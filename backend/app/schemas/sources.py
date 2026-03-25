from pydantic import BaseModel, Field
from pydantic_extra_types.coordinate import Longitude, Latitude
from typing import Annotated


class SourcesBase(BaseModel):
    name: str
    type: str
    latitude: Latitude
    longitude: Longitude
    height: Annotated[float, Field(gt=0, lt=8000)]
    emission_rate: float


class SourcesResponse(SourcesBase):
    id: int

    class Config:
        from_attributes = True


class SourcesCreate(SourcesBase):
    pass
