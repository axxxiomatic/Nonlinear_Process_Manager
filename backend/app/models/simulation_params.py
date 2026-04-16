from .base import Base
from sqlalchemy import String, SmallInteger, func, TIMESTAMP, Float
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime


class SimulationParams(Base):
    __tablename__ = "simulation_params"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, nullable=False)
    wind_speed: Mapped[float] = mapped_column(Float, nullable=False)
    wind_direction: Mapped[float] = mapped_column(Float, nullable=False) # Тут будет измеряться вградусах
    stability_class: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP, nullable=False, server_default=func.now())
