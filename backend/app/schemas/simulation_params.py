from pydantic import BaseModel, Field
from typing import Annotated


class SimulationParamsBase(BaseModel):
    wind_speed: Annotated[float, Field(gt=0, lt=150)] # В метрах в секунду
    wind_direction: float
    stability_class: str


class SimulationParamsCreate(SimulationParamsBase):
    pass


class SimulationParamsResponse(SimulationParamsBase):

    class Config:
        from_attributes = True
