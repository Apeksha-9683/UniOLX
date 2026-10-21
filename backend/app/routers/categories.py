"""The category tree, the way OLX exposes it.

OLX returns `level`, `position`, `path`, `child_ids`, `offer_count` and
`photos_max` on every category.
"""

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import DbSession
from app.models.category import Category, CategoryAttribute
from app.models.location import Location
from app.services.catalog import counts_by_category
from app.services.places import PlaceIndex

router = APIRouter(prefix="/api/categories", tags=["categories"])


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except (ValueError, AttributeError, TypeError):
        return False


def _to_schema(
    category: Category,
    counts: dict,
    child_ids: list[str] | None = None,
) -> dict:
    return {
        "id": str(category.id),
        "slug": category.slug,
        "name": category.name,
        "alias": category.alias or "",
        "parentId": str(category.parent_id) if category.parent_id else None,
        "level": category.level,
        "position": category.position,
        "path": category.path or "",
        "viewType": category.view_type,
        "photosMax": category.photos_max,
        "isActive": category.is_active,
        "childIds": child_ids if child_ids is not None else [],
        "offerCount": counts.get(category.id, 0),
    }


async def _resolve(db, category_id: str) -> Category | None:
    try:
        return await db.get(Category, uuid.UUID(category_id))
    except (ValueError, AttributeError, TypeError):
        result = await db.execute(select(Category).where(Category.slug == category_id))
        return result.scalar_one_or_none()


@router.get("")
async def list_categories(
    db: DbSession,
    parent_id: str | None = None,
    location_id: str | None = Query(None, description="Count only listings in this place"),
):
    places = await PlaceIndex.load(db)
    location_ids: list | None = None
    if location_id:
        location = await db.get(Location, uuid.UUID(location_id)) if _is_uuid(location_id) else places.by_slug(location_id)
        if location is not None:
            location_ids = places.descendants_of(location)

    counts = await counts_by_category(db, location_ids)

    stmt = (
        select(Category)
        .options(selectinload(Category.children), selectinload(Category.attributes))
        .order_by(Category.level, Category.position, Category.name)
    )
    if parent_id:
        parent = await _resolve(db, parent_id)
        if parent is None:
            return []
        stmt = stmt.where(Category.parent_id == parent.id)

    result = await db.execute(stmt)
    categories = list(result.scalars().all())
    return [
        _to_schema(category, counts, [str(child.id) for child in category.children])
        for category in categories
    ]


@router.get("/tree")
async def category_tree(
    db: DbSession,
    location_id: str | None = Query(None, description="Count only listings in this place"),
):
    places = await PlaceIndex.load(db)
    location_ids: list | None = None
    if location_id:
        location = (
            await db.get(Location, uuid.UUID(location_id))
            if _is_uuid(location_id)
            else places.by_slug(location_id)
        )
        if location is not None:
            location_ids = places.descendants_of(location)

    counts = await counts_by_category(db, location_ids)

    result = await db.execute(
        select(Category).options(selectinload(Category.children), selectinload(Category.attributes))
    )
    categories = list(result.scalars().all())
    by_parent: dict[object, list[Category]] = {}
    for category in categories:
        by_parent.setdefault(category.parent_id, []).append(category)

    def build(category: Category) -> dict:
        children = sorted(
            by_parent.get(category.id, []),
            key=lambda item: (item.position, item.name),
        )
        return _to_schema(
            category, counts, [str(child.id) for child in children]
        ) | {"children": [build(child) for child in children]}

    roots = sorted(by_parent.get(None, []), key=lambda item: (item.position, item.name))
    return [build(root) for root in roots]


@router.get("/{identifier:path}/attributes")
async def category_attributes(identifier: str, db: DbSession):
    category = await _resolve(db, identifier)
    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Category not found"
        )

    result = await db.execute(
        select(CategoryAttribute)
        .where(CategoryAttribute.category_id == category.id)
        .order_by(CategoryAttribute.sort_order, CategoryAttribute.label)
    )
    return [
        {
            "id": str(attribute.id),
            "categoryId": str(attribute.category_id),
            "key": attribute.key,
            "label": attribute.label,
            "dataType": attribute.data_type,
            "options": list(attribute.options or []),
            "minValue": float(attribute.min_value) if attribute.min_value is not None else None,
            "maxValue": float(attribute.max_value) if attribute.max_value is not None else None,
            "unit": attribute.unit,
            "isFilterable": attribute.is_filterable,
            "isRequired": attribute.is_required,
            "sortOrder": attribute.sort_order,
        }
        for attribute in result.scalars().all()
    ]


@router.get("/{identifier:path}")
async def get_category(identifier: str, db: DbSession):
    category = await _resolve(db, identifier)
    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Category not found"
        )
    counts = await counts_by_category(db)
    return _to_schema(
        category, counts, [str(child.id) for child in category.children]
    )
