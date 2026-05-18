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
    """
    Илюха, кароч, тут 2 параметра яркость Солнца в люксах и облачность в октах.
    Если захочешь поменять ОБЯЗАТЕЛЬНО после правок пишешь в консоли alembic revision "имя ревизии" --autogenerate
    Проверяешь правильность миграции и после этого делаешь  alembic upgrade head
    НЕ ТРОГАЙ СУЩЕСТВУЮЩИЕ РЕВИЗИИ!!!
    """
    sun_brightness: Mapped[float] = mapped_column(Float, nullable=False)
    cloud_density: Mapped[int] = mapped_column(SmallInteger, nullable=False)