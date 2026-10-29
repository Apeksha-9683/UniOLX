import json

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.output_parsers import StrOutputParser

from backend.ragolx.models import RetrievedListing
from backend.ragolx.prompts import build_answer_prompt


class AnswerGenerator:
    def __init__(self, chat_model: BaseChatModel) -> None:
        self._chain = build_answer_prompt() | chat_model | StrOutputParser()

    def generate(self, question: str, results: list[RetrievedListing]) -> str:
        context = json.dumps(
            [
                {
                    "listing_id": result.listing_id,
                    "title": result.title,
                    "category": result.category,
                    "price_inr": result.price,
                    "condition": result.condition,
                    "pickup_location": result.pickup_location,
                    "quantity_available": result.quantity_available,
                    "listing": result.document,
                }
                for result in results
            ],
            ensure_ascii=False,
            indent=2,
        )
        answer = self._chain.invoke({"question": question, "context": context})
        return answer.strip()
