from .base import Base
from sqlalchemy import String, Integer, func, TIMESTAMP, Float, JSON, ForeignKey, SmallInteger, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from enum import Enum
from datetime import datetime
from .substances import Substances


class SourceTypeEnum(str, Enum):
    point = "point"
    line = "line"
    polygon = "polygon"


class Sources(Base):
    __tablename__ = "sources"

    id: Mapped[int] = mapped_column(Integer,
                                    primary_key=True,
                                    index=True)
    name: Mapped[str] = mapped_column(String,
                                      nullable=False,
                                      index=True)
    type: Mapped[SourceTypeEnum] = mapped_column(SQLEnum(SourceTypeEnum),
                                                 default=SourceTypeEnum.point,
                                                 nullable=False,
                                                 index=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    height: Mapped[float] = mapped_column(Float, nullable=False)
    emission_rate: Mapped[float] = mapped_column(Float, nullable=False)
    substance_id: Mapped[int] = mapped_column(SmallInteger,
                                              ForeignKey("substances.id",
                                                         ondelete="CASCADE"),
                                              nullable=False)
    substance: Mapped["Substances"] = relationship()
    coordinates: Mapped[list | None] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP,
                                                 server_default=func.now(),
                                                 index=True,
                                                 nullable=False)
