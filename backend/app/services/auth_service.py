from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.security.oauth2 import OAuth2PasswordRequestForm
from datetime import datetime, timezone
from fastapi import HTTPException, status
from ..repositories.users import UserRepository
from ..core.utils import verify
from ..core.auth import (create_access_token,
                         create_refresh_token,
                         REFRESH_TOKEN_TYPE,
                         get_current_token_payload,
                         validate_token_type)
from ..schemas.tokens import Token


"""
    Убрать вызовы HTTPResponses когда сделаю кастомные исключениzя
"""

class AuthService:
    def __init__(self, db: AsyncSession):
        self.repository = UserRepository(db)

    async def __validate_user(self, user_credentials):
        user = await self.repository.get_by_email(user_credentials.username)

        if user is None:
            return None

        if not verify(user_credentials.password, user.password):
            return None

        return user

    async def login(self, user_credentials: OAuth2PasswordRequestForm):
        user = await self.__validate_user(user_credentials)
        if not user:
            return None

        access_token_data = {"user_id": user.id,
                             "user_role": user.role,
                             "iat": datetime.now(timezone.utc)}

        refresh_token_data = {"user_id": user.id,
                              "iat": datetime.now(timezone.utc)}

        access_token = create_access_token(access_token_data)
        refresh_token = create_refresh_token(refresh_token_data)

        return Token(access_token=access_token, refresh_token=refresh_token, token_type="bearer")

    async def refresh_access_token(self, refresh_token: str, ):
        payload = get_current_token_payload(refresh_token)
        validate_token_type(payload, REFRESH_TOKEN_TYPE)
        user_id = payload.get("user_id")

        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                                detail="Invalid credentials",
                                headers={"WWW-Authenticate": "Bearer"})

        user = await self.repository.get_by_id(user_id)

        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                                detail="Invalid credentials",
                                headers={"WWW-Authenticate": "Bearer"})

        access_token_data = {"user_id": user.id,
                             "user_role": user.role,
                             "iat": datetime.now(timezone.utc)}

        access_token = create_access_token(access_token_data)
        return Token(access_token=access_token, token_type="bearer")
