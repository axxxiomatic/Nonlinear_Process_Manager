from pydantic import BaseModel


class SimulationParamsBase(BaseModel):
    wind_speed: int
    wind_direction: str
    stability_class: str


class SimulationParamsCreate(SimulationParamsBase):
    pass
