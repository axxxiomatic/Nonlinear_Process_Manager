from pydantic import BaseModel
from typing import Optional
from ..models.users import RolesTypesEnum


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    id: Optional[int] = None
    role: Optional[RolesTypesEnum] = None
