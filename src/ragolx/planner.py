from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.output_parsers import StrOutputParser

from ragolx.models import QueryPlan
from ragolx.prompts import build_hyde_prompt


class QueryPlanner:
    def __init__(self, chat_model: BaseChatModel, *, use_hyde: bool = False) -> None:
        self._use_hyde = use_hyde
        self._chain = build_hyde_prompt() | chat_model | StrOutputParser()

    def plan(self, question: str) -> QueryPlan:
        if not self._use_hyde:
            return QueryPlan(query=question)

        raw = self._chain.invoke({"question": question}).strip()
        if not raw:
            return QueryPlan(query=question)
        return QueryPlan(query=question, hypothetical_listing=raw)
