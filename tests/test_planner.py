from conftest import ScriptedChatModel

from ragolx.planner import QueryPlanner


def test_planner_without_hyde_skips_the_llm() -> None:
    chat_model = ScriptedChatModel(responses=["unused"])

    plan = QueryPlanner(chat_model).plan("coding laptop")

    assert plan.query == "coding laptop"
    assert plan.hypothetical_listing is None
    assert chat_model.calls == []


def test_planner_with_hyde_returns_search_document() -> None:
    chat_model = ScriptedChatModel(responses=["A used laptop for coding and class work."])

    plan = QueryPlanner(chat_model, use_hyde=True).plan("coding laptop")

    assert plan.query == "coding laptop"
    assert plan.hypothetical_listing == "A used laptop for coding and class work."
    assert len(chat_model.calls) == 1


def test_planner_with_empty_hyde_output_falls_back() -> None:
    chat_model = ScriptedChatModel(responses=["   "])

    plan = QueryPlanner(chat_model, use_hyde=True).plan("coding laptop")

    assert plan.hypothetical_listing is None
