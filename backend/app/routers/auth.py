from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.security.oauth2 import OAuth2PasswordRequestForm

from ..schemas.tokens import Token
from ..database import get_db
from ..services.auth_service import AuthService

router = APIRouter(tags=["Authentification"])


@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    auth_service = AuthService(db)
    token = await auth_service.login(form_data)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid credentials",
                            headers={"WWW-Authenticate": "Bearer"})

    return token


@router.post("/refresh", response_model=Token, response_model_exclude_none=True)
async def refresh_token(refresh_token: str,
                        db: AsyncSession = Depends(get_db), ):
    auth_service = AuthService(db)
    token = await auth_service.refresh_access_token(refresh_token)

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid credentials",
                            headers={"WWW-Authenticate": "Bearer"})
    return token
