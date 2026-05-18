from pydantic import BaseModel
from .users import UserForScenarioInfo
from datetime import datetime


class ScenariosBase(BaseModel):
    name: str


class ScenariosResponse(ScenariosBase):
    id: int
    user: UserForScenarioInfo
    created_at: datetime

    class Config:
        from_attributes = True


class ScenariosCreate(ScenariosBase):
    user_id: int
