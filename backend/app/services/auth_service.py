from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.security.oauth2 import OAuth2PasswordRequestForm

from ..repositories.users import UserRepository
from ..core.utils import verify
from ..core.auth import create_access_token
from ..schemas.tokens import Token


class AuthService:
    def __init__(self, db = AsyncSession):
        self.repository = UserRepository(db)

    async def login(self, user_credentials: OAuth2PasswordRequestForm):
        user = await self.repository.get_by_email(user_credentials.username)

        if not user:
            return None

        if not verify(user_credentials.password, user.password):
            return None

        token_data = {"user_id": user.id, "user_role": user.role}
        access_token = create_access_token(token_data)

        return Token(access_token=access_token, token_type="bearer")