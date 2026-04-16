from .base import Base
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Integer, String, Null, func, TIMESTAMP, Enum as SQLEnum
from enum import Enum
from datetime import datetime


class RolesTypesEnum(str, Enum):
    professor = "professor",
    student = "student",
    admin = "admin",


class Users(Base):
    __table__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    first_name: Mapped[str] = mapped_column(String, nullable=False)
    last_name: Mapped[str] = mapped_column(String, nullable=False)
    patronymic: Mapped[str | None] = mapped_column(String, server_default=Null)
    role: Mapped[RolesTypesEnum] = mapped_column(SQLEnum(RolesTypesEnum), default=RolesTypesEnum.student,
                                                 nullable=False)
    password: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())
