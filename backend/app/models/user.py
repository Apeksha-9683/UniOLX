import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("email = lower(email)", name="email_lowercase"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)

    college_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("colleges.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    branch: Mapped[str] = mapped_column(String(120), nullable=False, default="Undergraduate")
    year: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    semester: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    hostel: Mapped[str | None] = mapped_column(String(160), nullable=True)
    avatar: Mapped[str] = mapped_column(String(500), nullable=False, default="")

    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    rating: Mapped[float] = mapped_column(Float, nullable=False, default=5.0)
    total_reviews: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_trades: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    college = relationship("College", lazy="joined")

    @property
    def id_str(self) -> str:
        return str(self.id)
