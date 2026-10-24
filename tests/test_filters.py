from ragolx.filters import build_where


def test_build_where_always_enforces_availability() -> None:
    assert build_where(None) == {
        "$and": [
            {"status": {"$eq": "available"}},
            {"quantity_available": {"$gt": 0}},
        ]
    }


def test_build_where_scopes_to_college() -> None:
    assert build_where("college-a") == {
        "$and": [
            {"status": {"$eq": "available"}},
            {"quantity_available": {"$gt": 0}},
            {"college_id": {"$eq": "college-a"}},
        ]
    }
