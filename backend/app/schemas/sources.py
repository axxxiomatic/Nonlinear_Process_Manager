from pydantic import BaseModel, Field
from pydantic_extra_types.coordinate import Longitude, Latitude
from typing import Annotated, Optional, List
from datetime import datetime

from ..models.sources import SourceTypeEnum


class SourcesBase(BaseModel):
    name: str
    type: SourceTypeEnum = SourceTypeEnum.point
    latitude: Latitude
    longitude: Longitude
    height: Annotated[float, Field(gt=0, lt=8000)]
    emission_rate: float
    substance_id: int
    scenario_id: int
    coordinates: Optional[List[List[float]]] = None


class SourcesCreate(SourcesBase):
    pass


class SourcesResponse(SourcesBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True