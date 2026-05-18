from pydantic import BaseModel
from ..models.users import RolesTypesEnum


class Token(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "Bearer"


class TokenData(BaseModel):
    id: int | None = None
    role: RolesTypesEnum | None = None
