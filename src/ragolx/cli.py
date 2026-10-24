import argparse
import json
import uuid
from collections.abc import Sequence
from pathlib import Path

from pydantic import ValidationError
from rich import box
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.prompt import Prompt
from rich.table import Table

from ragolx.config import Settings
from ragolx.graph import MarketplaceRAG
from ragolx.indexer import ListingIndexer, load_listings
from ragolx.models import RAGResponse
from ragolx.providers import build_embeddings
from ragolx.store import ChromaListingStore

console = Console()
VERSION = "0.1.0"

CHAT_HELP = """[bold]Commands[/]
  /help             Show this help
  /debug            Toggle query and retrieval diagnostics
  /college <uuid>   Scope to one college
  /college all      Search every college
  /quit             Exit

Or just type what you are looking for."""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ragolx",
        description=(
            "Semantic retrieval with cross-encoder reranking for campus marketplace listings."
        ),
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {VERSION}")
    subparsers = parser.add_subparsers(dest="command", required=True)

    ingest = subparsers.add_parser("ingest", help="Embed listings into Chroma")
    ingest.add_argument(
        "--data",
        type=Path,
        default=Path("data/listings.json"),
        help="JSON array of listings, or an object with a 'listings' array",
    )
    ingest.add_argument(
        "--prune",
        action="store_true",
        help="Delete vectors whose listing id is absent from the input",
    )
    ingest.add_argument(
        "--reset",
        action="store_true",
        help="Delete the collection before indexing (needed after changing embedding dimensions)",
    )
    ingest.set_defaults(handler=_run_ingest)

    search = subparsers.add_parser("search", help="Run one search and exit")
    search.add_argument("question", help="Natural-language product request")
    search.add_argument("--college-id", help="Only search listings from this college UUID")
    search.add_argument(
        "--debug",
        action="store_true",
        help="Show query, filters, and reranking diagnostics",
    )
    search.set_defaults(handler=_run_search)

    chat = subparsers.add_parser("chat", help="Interactive terminal search")
    chat.add_argument("--college-id", help="Only search listings from this college UUID")
    chat.add_argument(
        "--debug",
        action="store_true",
        help="Show query, filters, and reranking diagnostics",
    )
    chat.set_defaults(handler=_run_chat)

    return parser


def _load_settings() -> Settings:
    try:
        return Settings()
    except ValidationError as exc:
        console.print("[bold red]Configuration error[/]")
        console.print("Copy .env.example to .env and set OPENROUTER_API_KEY.")
        for error in exc.errors():
            location = ".".join(str(part) for part in error["loc"])
            console.print(f"  [red]{location}[/]: {error['msg']}")
        raise SystemExit(2) from exc


def _run_ingest(args: argparse.Namespace) -> int:
    settings = _load_settings()
    data_path: Path = args.data
    if not data_path.exists():
        console.print(f"[red]Data file not found:[/] {data_path}")
        return 2

    listings = load_listings(data_path)
    if not listings:
        console.print("[red]No listings found in the data file.[/]")
        return 2

    console.print(
        f"Embedding [bold]{len(listings)}[/] listings with "
        f"[cyan]{settings.embedding_model}[/] "
        f"({settings.embedding_dimensions} dimensions)"
    )

    store = ChromaListingStore(settings.chroma_path, settings.chroma_collection)
    embeddings = build_embeddings(settings)
    indexer = ListingIndexer(store, embeddings, settings.catalog_path)
    try:
        with console.status("[cyan]Embedding and upserting vectors...[/]"):
            report = indexer.ingest(
                listings,
                prune=args.prune,
                reset=args.reset,
            )
    finally:
        embeddings.close()

    console.print(
        f"[green]Index updated.[/] Upserted [bold]{report.indexed}[/], "
        f"pruned [bold]{report.pruned}[/], total vectors [bold]{report.total}[/]."
    )
    if report.catalog.college_ids:
        console.print("College scope IDs:")
        for college_id in report.catalog.college_ids:
            console.print(f"  [cyan]{college_id}[/]")
    return 0


def _run_search(args: argparse.Namespace) -> int:
    settings = _load_settings()
    college_id = _validated_college_id(args.college_id)
    if args.college_id and college_id is None:
        return 2

    rag = MarketplaceRAG.from_settings(settings)
    try:
        if rag.document_count() == 0:
            console.print("[yellow]The listing index is empty.[/] Run `ragolx ingest` first.")
            return 2
        with console.status("[cyan]Retrieving and reranking listings...[/]"):
            response = rag.query(args.question, college_id=college_id)
        _render_response(response, debug=args.debug)
        return 0
    finally:
        rag.close()


def _run_chat(args: argparse.Namespace) -> int:
    settings = _load_settings()
    college_id = _validated_college_id(args.college_id)
    if args.college_id and college_id is None:
        return 2

    rag = MarketplaceRAG.from_settings(settings)
    try:
        if rag.document_count() == 0:
            console.print("[yellow]The listing index is empty.[/] Run `ragolx ingest` first.")
            return 2

        debug = args.debug
        _render_welcome(settings, rag.document_count(), college_id)
        while True:
            try:
                line = Prompt.ask("\n[bold cyan]you[/bold cyan]", console=console).strip()
            except (EOFError, KeyboardInterrupt):
                console.print()
                break
            if not line:
                continue

            command = line.split()[0].casefold()
            if command in {"/quit", "/exit", "quit", "exit"}:
                break
            if command == "/help":
                console.print(CHAT_HELP)
                continue
            if command == "/debug":
                debug = not debug
                console.print(f"Debug: [bold]{'on' if debug else 'off'}[/]")
                continue
            if command == "/college":
                parts = line.split()
                if len(parts) == 1:
                    console.print(f"Current scope: [cyan]{college_id or 'all colleges'}[/]")
                    continue
                raw = parts[1]
                if raw.casefold() in {"all", "none", "clear"}:
                    college_id = None
                    console.print("Scope: [cyan]all colleges[/]")
                    continue
                try:
                    college_id = str(uuid.UUID(raw))
                except ValueError:
                    console.print("[red]That is not a valid college UUID.[/]")
                    continue
                console.print(f"Scope: [cyan]{college_id}[/]")
                continue
            if line.startswith("/"):
                console.print("[yellow]Unknown command.[/] Type /help.")
                continue

            try:
                with console.status("[cyan]Retrieving and reranking listings...[/]"):
                    response = rag.query(line, college_id=college_id)
            except Exception as exc:
                console.print(f"[red]Search failed:[/] {exc}")
                continue
            _render_response(response, debug=debug)
        return 0
    finally:
        rag.close()


def _validated_college_id(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return str(uuid.UUID(value))
    except ValueError:
        console.print(f"[red]Invalid college UUID:[/] {value}")
        return None


def _render_welcome(settings: Settings, document_count: int, college_id: str | None) -> None:
    scope = college_id or "all colleges"
    console.print(
        Panel(
            f"[bold]Ragolx[/]  {settings.chat_model}\n"
            f"{document_count} listings indexed  |  scope: {scope}\n"
            "Semantic retrieval + cross-encoder reranking + grounded answer\n\n"
            "Type /help for commands.",
            border_style="cyan",
            padding=(0, 1),
        )
    )


def _render_response(response: RAGResponse, *, debug: bool) -> None:
    if debug:
        if response.plan.hypothetical_listing:
            console.print(
                Panel(
                    response.plan.hypothetical_listing,
                    title="HyDE search document",
                    border_style="magenta",
                    padding=(0, 1),
                )
            )
        console.print(f"[dim]Query:[/] {response.plan.query}")
        console.print(f"[dim]Chroma where:[/] {json.dumps(response.where, ensure_ascii=False)}")
        console.print(f"[dim]Reranked:[/] {'yes' if response.reranked else 'no'}")

    console.print(
        Panel(
            Markdown(response.answer),
            title="Ragolx",
            border_style="green",
            padding=(0, 1),
        )
    )

    if not response.results:
        return

    table = Table(
        box=box.SIMPLE_HEAD,
        header_style="bold cyan",
        caption=(
            "Dense candidates reranked by a cross-encoder"
            if response.reranked
            else "Dense vector retrieval"
        ),
    )
    table.add_column("#", justify="right", style="dim")
    table.add_column("Product", max_width=34, overflow="ellipsis", no_wrap=True)
    table.add_column("Price", justify="right")
    table.add_column("Condition")
    table.add_column("Match", justify="right")
    if response.reranked:
        table.add_column("Rerank", justify="right")
    table.add_column("Listing ID", style="dim", no_wrap=True)

    for index, result in enumerate(response.results, start=1):
        match = f"{round(result.similarity * 100)}%" if result.similarity is not None else "-"
        row = [
            str(index),
            result.title,
            f"₹{result.price:,}",
            result.condition,
            match,
        ]
        if response.reranked:
            rerank = f"{result.rerank_score:.3f}" if result.rerank_score is not None else "-"
            row.append(rerank)
        row.append(result.listing_id)
        table.add_row(*row)
    console.print(table)


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.handler(args))
    except KeyboardInterrupt:
        console.print("\n[yellow]Interrupted.[/]")
        return 130
    except Exception as exc:
        console.print(f"[red]Error:[/] {exc}")
        return 1
