from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class College(Base):
    __tablename__ = "colleges"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    short_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    city: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    state: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    domain: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="verified")
    campus_spots: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    popular_branches: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    @property
    def shortName(self) -> str:
        return self.short_name
