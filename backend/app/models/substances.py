from sqlalchemy import String, SmallInteger, Float
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base


class Substances(Base):
    __tablename__ = "substances"

    id: Mapped[int] = mapped_column(SmallInteger, index=True, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    short_name: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    mcl: Mapped[float] = mapped_column(Float, nullable=False)  # MCL = ПДК
    density: Mapped[float] = mapped_column(Float, nullable=False)
    settling_velocity: Mapped[float] = mapped_column(Float, nullable=False)  # скорость оседания
    # hazard_level = Column(Integer, nullable=False) - может понадобиться если будем пилить справочную информацию
    # custom_color=Column(String, default="#E74C3C")-если захочется шлейф задавать кастомным цветом для каждого вещества
