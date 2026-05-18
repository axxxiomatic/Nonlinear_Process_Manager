from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Sequence

from ..models.users import Users, RolesTypesEnum
from ..schemas.users import UserCreate


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_users(self):
        stmt = select(Users)
        result = await self.db.execute(stmt)

        return result.scalars().all()

    async def get_by_id(self, user_id: int):
        stmt = select(Users).where(Users.id == user_id)
        result = await self.db.execute(stmt)

        return result.scalars().first()

    async def get_by_email(self, user_email: str):
        stmt = select(Users).where(Users.email == user_email)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def create_user(self, user_schema: UserCreate):
        user_data = user_schema.model_dump()
        user = Users(**user_data)
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def delete_user(self, user_id: int) -> bool:
        stmt = select(Users).where(Users.id == user_id)
        result = await self.db.execute(stmt)
        user = result.scalars().first()

        if not user:
            return False
        await self.db.delete(user)
        await self.db.commit()

        return True

    async def get_students_in_groups(self, groups: list[str]) -> Sequence[Users]:
        """
            Здесь мы получим список студентов, у которых есть общая группа с другим пользователем
            Используется только для профессоров, для получения ими доступа к данным их студентов
        """
        stmt = select(Users).where(Users.role == RolesTypesEnum.student)
        result = await self.db.execute(stmt)
        students = result.scalars().all()

        professor_groups = set(groups)
        return [student for student in students if professor_groups.intersection(student.group)]
