from typing import Any

from backend.app.db import Database


def college_names(connection: Any, college_id: str | None) -> tuple[str, str]:
    if not college_id:
        return ("", "")
    row = connection.execute(
        "SELECT name, short_name FROM colleges WHERE id = ?",
        (college_id,),
    ).fetchone()
    if row:
        return (row["name"], row["short_name"])
    return (college_id, college_id)


def frontend_listing(row: Any, database: Database) -> dict[str, Any]:
    listing = database.decode_listing(row)
    with database.connection() as connection:
        seller = connection.execute(
            "SELECT id, name, college_id, branch, is_verified FROM users WHERE id = ?",
            (listing["seller_id"],),
        ).fetchone()
        college_name, _ = college_names(connection, listing["college_id"])
        seller_college, _ = college_names(
            connection,
            seller["college_id"] if seller else listing["college_id"],
        )
    seller_data = dict(seller) if seller else {
        "id": listing["seller_id"],
        "name": "Campus seller",
        "college_id": listing["college_id"],
        "branch": "Student",
        "is_verified": True,
    }
    return {
        "id": listing["id"],
        "title": listing["title"],
        "description": listing["description"],
        "price": listing["price"],
        "originalPrice": listing["price"],
        "category": listing["category"],
        "condition": listing["condition"],
        "status": listing["status"].capitalize(),
        "collegeId": listing["college_id"],
        "collegeName": college_name,
        "campusPickupSpot": listing["pickup_location"] or "Campus pickup point",
        "seller": {
            "id": seller_data["id"],
            "name": seller_data["name"],
            "collegeId": seller_data["college_id"],
            "collegeName": seller_college,
            "branch": seller_data["branch"],
            "avatar": f"https://api.dicebear.com/7.x/bottts/svg?seed={seller_data['id']}",
            "isVerified": bool(seller_data["is_verified"]),
            "rating": 5,
            "totalReviews": 0,
            "hostelOrArea": listing["pickup_location"] or "Campus",
        },
        "images": [],
        "specs": {str(key): str(value) for key, value in listing["specs"].items()},
        "tags": [],
        "postedAt": listing["created_at"],
        "quantity": listing["quantity_available"],
    }
