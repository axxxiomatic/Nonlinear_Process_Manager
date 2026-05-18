import jwt
from jwt.exceptions import PyJWTError, InvalidTokenError
from datetime import datetime, timedelta, timezone
from fastapi.security import OAuth2PasswordBearer
from fastapi import HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from .config import settings

from ..database import get_db
from ..schemas.tokens import TokenData
from ..models.users import Users, RolesTypesEnum

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

SECRET_KEY = settings.secret_key
ALGORITHM = settings.algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = settings.access_token_expiration_minutes
REFRESH_TOKEN_EXPIRE_DAYS = settings.refresh_token_expiration_days

TOKEN_TYPE_FIELD = "type"
ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"


def create_token(data: dict, token_type: str):
    jwt_payload = {TOKEN_TYPE_FIELD: token_type, }
    jwt_payload.update(data)
    return jwt.encode(jwt_payload, SECRET_KEY, algorithm=ALGORITHM)


def create_access_token(data: dict):
    to_encode = data.copy()

    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = create_token(to_encode, ACCESS_TOKEN_TYPE)

    return encoded_jwt


def create_refresh_token(data: dict):
    to_encode = data.copy()

    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = create_token(to_encode, REFRESH_TOKEN_TYPE)

    return encoded_jwt


def verify_token(token: str, credentials_exception):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        user_id: str = payload.get("user_id")

        if not user_id:
            raise credentials_exception
        token_data = TokenData(id=user_id)

    except PyJWTError:
        raise credentials_exception

    return token_data


def get_current_token_payload(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"invalid token error: {e}",
        )
    return payload


def validate_token_type(payload: dict, token_type: str):
    if (current_token_type := payload.get(TOKEN_TYPE_FIELD)) == token_type:
        return True

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=f"Invalid token type ({current_token_type!r}) received; {token_type!r} expected"
    )


async def get_user_by_token(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    credentials_exception = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                                          detail="Invalid credentials",
                                          headers={"WWW-Authenticate": "Bearer"})
    token = verify_token(token, credentials_exception)

    stmt = select(Users).where(Users.id == token.id)
    result = await db.execute(stmt)
    return result.scalars().first()


async def get_current_user(payload: dict = Depends(get_current_token_payload),
                           token: str = Depends(oauth2_scheme),
                           db: AsyncSession = Depends(get_db)):
    validate_token_type(payload, ACCESS_TOKEN_TYPE)
    return await get_user_by_token(token, db)


async def get_current_user_for_refresh(payload: dict = Depends(get_current_token_payload),
                                       token: str = Depends(oauth2_scheme),
                                       db: AsyncSession = Depends(get_db), ):
    validate_token_type(payload, REFRESH_TOKEN_TYPE)
    return await get_user_by_token(token, db)


def require_roles(*roles: RolesTypesEnum):
    async def check_role(current_user: Users = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Недостаточно прав"
            )
        return current_user

    return check_role


def require_admin():
    return require_roles(RolesTypesEnum.admin)
