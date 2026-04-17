from sqlalchemy.ext.asyncio import AsyncSession
from ..repositories.users import UserRepository
from ..schemas.users import UserCreate
from ..core.utils import hashing


class UserService:
    def __init__(self, db: AsyncSession):
        self.repository = UserRepository(db)

    async def get_users(self):
        result = await self.repository.get_users()
        return result

    async def get_user_by_id(self, id: int):
        result = await self.repository.get_by_id(id)
        return result

    async def get_user_by_email(self, email: str):
        result = await self.repository.get_by_email(email)
        return result

    async def create_user(self, user_schema: UserCreate):
        hashed_password = hashing(user_schema.password)
        user_data = user_schema.model_dump()
        user_data["password"] = hashed_password
        modified_schema = UserCreate(**user_data)
        result = await self.repository.create_user(modified_schema)
        return result

    async def delete_user(self, id: int):
        result = await self.repository.delete_user(id)
        return result
