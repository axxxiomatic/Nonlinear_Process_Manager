from .base import Base
from typing import TYPE_CHECKING
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, TIMESTAMP, func, ForeignKey
from datetime import datetime

if TYPE_CHECKING:
    from .users import Users
    from .sources import Sources


class Scenarios(Base):
    __tablename__ = "scenarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    user_id: Mapped[int] = mapped_column(Integer,
                                         ForeignKey("users.id", ondelete="CASCADE"),
                                         nullable=False,
                                         index=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now(), nullable=False)

    source: Mapped[list["Sources"]] = relationship(back_populates="scenario",
                                                   cascade="all, delete-orphan",
                                                   passive_deletes=True)
    user: Mapped["Users"] = relationship(back_populates="scenario")
