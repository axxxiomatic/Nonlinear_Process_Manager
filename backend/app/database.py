from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from .core.config import settings


SQLALCHEMY_DATABASE_URL = f'postgresql+asyncpg://{settings.database_username}:{settings.database_password}@' \
                          f'{settings.database_hostname}:{settings.database_port}/{settings.database_name}'


engine = create_async_engine(SQLALCHEMY_DATABASE_URL)

SessionLocal = sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with SessionLocal() as db:
        yield db

"""
    как только будет Alembic - удалить init_model
"""


async def init_models():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)