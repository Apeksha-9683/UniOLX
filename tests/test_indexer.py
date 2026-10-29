from pathlib import Path

from conftest import FakeEmbeddings, make_listing

from backend.ragolx.indexer import (
    ListingIndexer,
    listing_document,
    listing_metadata,
    load_listings,
    read_catalog,
)
from backend.ragolx.store import ChromaListingStore


def test_listing_document_and_metadata() -> None:
    listing = make_listing(
        "listing-1",
        title="Casio Calculator",
        category="Calculators",
        description="Great for maths.\nWorks perfectly.",
        price=900,
        specs={"model": "FX-991EX", "solar": True},
    )

    document = listing_document(listing)
    metadata = listing_metadata(listing)

    assert document == ("Title: Casio Calculator\nDescription: Great for maths. Works perfectly.")
    assert "Category" not in document
    assert "Specs" not in document
    assert metadata["listing_id"] == "listing-1"
    assert metadata["price"] == 900
    assert metadata["status"] == "available"
    assert metadata["quantity_available"] == 1


def test_index_upsert_and_prune(tmp_path: Path, fake_embeddings: FakeEmbeddings) -> None:
    store = ChromaListingStore(tmp_path / "chroma", "listings")
    catalog_path = tmp_path / "chroma" / "catalog.json"
    indexer = ListingIndexer(store, fake_embeddings, catalog_path)

    first = make_listing("listing-1", category="Laptops")
    second = make_listing("listing-2", category="Cycles", condition="fair")
    report = indexer.ingest([first, second])

    assert report.indexed == 2
    assert report.total == 2
    assert report.catalog.listing_count == 2
    assert store.count() == 2
    assert read_catalog(catalog_path).college_ids == ["college-a"]

    indexer.ingest([first, second])
    assert store.count() == 2

    report = indexer.ingest([first], prune=True)
    assert report.pruned == 1
    assert store.count() == 1
    assert store.ids() == ["listing-1"]


def test_ingest_reset_empties_collection(tmp_path: Path, fake_embeddings: FakeEmbeddings) -> None:
    store = ChromaListingStore(tmp_path / "chroma", "listings")
    indexer = ListingIndexer(store, fake_embeddings, tmp_path / "chroma" / "catalog.json")
    indexer.ingest([make_listing("listing-1"), make_listing("listing-2")])

    report = indexer.ingest([make_listing("listing-3")], reset=True)

    assert report.total == 1
    assert store.ids() == ["listing-3"]


def test_seed_data_is_valid() -> None:
    listings = load_listings(Path("data/listings.json"))

    assert len(listings) == 126
    assert len({listing.id for listing in listings}) == 126
    assert any(listing.status == "sold" for listing in listings)
    assert any(listing.status == "reserved" for listing in listings)
