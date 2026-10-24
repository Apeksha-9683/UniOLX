from typing import Any


def build_where(college_id: str | None) -> dict[str, Any]:
    clauses: list[dict[str, Any]] = [
        {"status": {"$eq": "available"}},
        {"quantity_available": {"$gt": 0}},
    ]
    if college_id:
        clauses.append({"college_id": {"$eq": college_id}})

    if len(clauses) == 1:
        return clauses[0]
    return {"$and": clauses}
