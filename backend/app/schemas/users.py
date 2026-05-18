from pydantic import BaseModel, EmailStr, model_validator
from typing import Optional
from ..models.users import RolesTypesEnum


class UserBase(BaseModel):
    first_name: str
    last_name: str
    patronymic: Optional[str] = None
    group: list[str]


class UserCreate(UserBase):
    password: str
    email: EmailStr
    role: RolesTypesEnum

    @model_validator(mode="after")
    def validate_group(self) -> "UserBase":
        if self.role == RolesTypesEnum.student and len(self.group) != 1:
            raise ValueError("Student can only be in one group")

        if len(self.group) == 0:
            raise ValueError("Group field required")

        return self


class UserResponse(UserBase):
    role: RolesTypesEnum

    class Config:
        from_attributes = True


class UserForScenarioInfo(UserBase):
    class Config:
        from_attributes = True
