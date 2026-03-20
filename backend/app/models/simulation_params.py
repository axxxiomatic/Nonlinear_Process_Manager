from backend.app.database import Base
from sqlalchemy import Column, String, Integer, func, TIMESTAMP, Float


class SimulationParams(Base):
    id = Column(Integer, primary_key=True, nullable=False)
    wind_speed = Column(Float, nullable=False)
    wind_direction = Column(String, nullable=False)
    stability_class = Column(String, nullable=False)
    updated_at = Column(TIMESTAMP, nullable=False, default=func.now())
