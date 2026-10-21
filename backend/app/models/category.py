import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Index,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    PrimaryKeyConstraint,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Category(Base):
    """The OLX-style category tree.

    Mirrors OLX's category fields: `alias` (its URL alias), `level` (depth),
    `position` (sort among siblings), `path` (URL path) and `photos_max`
    (how many photos an ad in this category may carry).
    """

    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_categories_slug"),
        Index("ix_categories_ancestors", "ancestors", postgresql_using="gin"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    alias: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=True, index=True
    )
    ancestors: Mapped[list[uuid.UUID]] = mapped_column(
        ARRAY(UUID(as_uuid=True)), nullable=False, default=list
    )
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    path: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    view_type: Mapped[str] = mapped_column(String(16), nullable=False, default="list")
    photos_max: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    parent = relationship("Category", remote_side=[id], lazy="joined")
    children = relationship(
        "Category",
        back_populates="parent",
        order_by="Category.position",
        lazy="selectin",
    )
    attributes = relationship(
        "CategoryAttribute",
        back_populates="category",
        order_by="CategoryAttribute.sort_order",
        lazy="selectin",
        cascade="all, delete-orphan",
    )


class CategoryAttribute(Base):
    """The field schema for one category, e.g. RAM, brand, size."""

    __tablename__ = "category_attributes"
    __table_args__ = (
        UniqueConstraint("category_id", "key", name="category_attribute_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    data_type: Mapped[str] = mapped_column(String(16), nullable=False, default="text")
    options: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    min_value: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    max_value: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    unit: Mapped[str | None] = mapped_column(String(24), nullable=True)
    is_filterable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    category = relationship("Category", back_populates="attributes")


class ListingAttribute(Base):
    """OLX's `parameters` object, stored relationally so it can be filtered.

    The typed columns are the point: `WHERE key = 'ram' AND value_num = 16`
    is a real SQL predicate, which the old JSONB `specs` column could not do.
    """

    __tablename__ = "listing_attributes"
    __table_args__ = (
        PrimaryKeyConstraint("listing_id", "key", name="pk_listing_attributes"),
        Index(
            "ix_listing_attributes_num",
            "key",
            "value_num",
            postgresql_where=text("value_num IS NOT NULL"),
        ),
        Index(
            "ix_listing_attributes_bool",
            "key",
            "value_bool",
            postgresql_where=text("value_bool IS NOT NULL"),
        ),
    )

    listing_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    value_num: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    value_bool: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
