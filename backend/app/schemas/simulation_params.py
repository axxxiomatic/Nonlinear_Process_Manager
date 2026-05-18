from pydantic import BaseModel, Field
from typing import Annotated


class SimulationParamsBase(BaseModel):
    wind_speed: Annotated[float, Field(gt=0, lt=150)] # В метрах в секунду
    wind_direction: float
    stability_class: str

    """
        Для Илюхи: яркость зависит от синуса угла поверхности Земли к Солнцу, вместо времени суток
        (дефолтное значение - 20000 -тень в полдень)
        плотность облаков измеряется в октах, где 0 - безоблачно, а 8 - максимальная плотность
    """
    sun_brightness: Annotated[float, Field(gt=0, lt=120000)] = 20000
    cloud_density: Annotated[int, Field(ge=0, le=8)] = 0


class SimulationParamsCreate(SimulationParamsBase):
    pass


class SimulationParamsResponse(SimulationParamsBase):

    class Config:
        from_attributes = True
