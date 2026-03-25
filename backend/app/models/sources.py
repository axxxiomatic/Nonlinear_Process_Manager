from backend.app.database import Base
from sqlalchemy import Column, String, Integer, func, TIMESTAMP, Float


class Sources(Base):
    __tablename__ = "sources"

    id = Column(Integer, primary_key=True, nullable=False)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    height = Column(Float, nullable=False)
    emission_rate = Column(Float, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())

