import uuid
from datetime import datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    Computed,
    Index,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.db.base import Base


class Listing(Base):
    __tablename__ = "listings"
    __table_args__ = (
        Index("ix_listings_geo", "latitude", "longitude"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    seller_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    college_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("colleges.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    pickup_spot_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("pickup_spots.id", ondelete="SET NULL"), nullable=True, index=True
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    original_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    condition: Mapped[str] = mapped_column(String(32), nullable=False, default="Good")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="Available", index=True)
    campus_pickup_spot: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    specs: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    tags: Mapped[list] = mapped_column(ARRAY(String(64)), nullable=False, default=list)

    views_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    embedding: Mapped[list | None] = mapped_column(
        Vector(settings.embedding_dimensions), nullable=True
    )
    latitude: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)

    search_vector: Mapped[Any] = mapped_column(
        TSVECTOR,
        Computed(
            "to_tsvector('english', "
            "coalesce(title, '') || ' ' || coalesce(description, '') || ' ' "
            "|| coalesce(campus_pickup_spot, '') || ' ' || coalesce(category, ''))",
            persisted=True,
        ),
    )

    posted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )

    seller = relationship("User", lazy="joined")
    college = relationship("College", lazy="joined")
    # Named `category_detail` so it does not shadow the `category` column,
    # which stays as the denormalised mirror of the category name.
    category_detail = relationship("Category", lazy="joined")
    location = relationship("Location", lazy="joined")
    pickup_spot = relationship("PickupSpot", lazy="joined")
    images = relationship(
        "ListingImage",
        back_populates="listing",
        cascade="all, delete-orphan",
        order_by="ListingImage.position",
        lazy="selectin",
    )


class ListingImage(Base):
    __tablename__ = "listing_images"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    listing = relationship("Listing", back_populates="images")


class WishlistEntry(Base):
    __tablename__ = "wishlists"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    listing_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    listing = relationship("Listing", lazy="joined")
