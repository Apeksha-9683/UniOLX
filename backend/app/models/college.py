import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class College(Base):
    """A campus profile.

    The place itself lives in `locations` (a row of type `campus`); the name,
    city and state are derived from that tree, and the campus landmarks live
    in `pickup_spots`.
    """

    __tablename__ = "colleges"
    __table_args__ = (
        UniqueConstraint("location_id", name="uq_colleges_location_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    location_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("locations.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    short_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    domain: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="verified")
    popular_branches: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    location = relationship("Location", lazy="joined")
    pickup_spots = relationship(
        "PickupSpot",
        back_populates="college",
        order_by="PickupSpot.sort_order",
        lazy="selectin",
    )

    @property
    def shortName(self) -> str:
        return self.short_name
