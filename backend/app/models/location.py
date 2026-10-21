import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Location(Base):
    """The OLX-style place tree: country -> state -> city -> district -> campus.

    `ancestors` is the materialised path, so "everything inside Bengaluru" is
    `WHERE :id = ANY(ancestors)` instead of a recursive CTE per query.
    """

    __tablename__ = "locations"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_locations_slug"),
        CheckConstraint(
            "type IN ('country','state','city','district','campus')",
            name="ck_locations_type",
        ),
        Index("ix_locations_ancestors", "ancestors", postgresql_using="gin"),
        Index("ix_locations_geo", "latitude", "longitude"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("locations.id", ondelete="CASCADE"), nullable=True, index=True
    )
    ancestors: Mapped[list[uuid.UUID]] = mapped_column(
        ARRAY(UUID(as_uuid=True)), nullable=False, default=list
    )
    latitude: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    address_line: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    parent = relationship("Location", remote_side=[id], lazy="joined")
    children = relationship(
        "Location",
        back_populates="parent",
        order_by="Location.sort_order",
        lazy="selectin",
    )


class PickupSpot(Base):
    """A landmark on campus where a trade can happen."""

    __tablename__ = "pickup_spots"
    __table_args__ = (
        UniqueConstraint("college_id", "name", name="uq_pickup_spots_college_id_name"),
        Index("ix_pickup_spots_geo", "latitude", "longitude"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    college_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    latitude: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    college = relationship("College", back_populates="pickup_spots")
