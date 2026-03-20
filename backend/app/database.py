from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from dotenv import load_dotenv
import os

load_dotenv()

'''
    Константу заменим на postgres потом
    
    BASE_DIR И DB_PATH нужны только пока есть sqlite
'''

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(os.path.dirname(BASE_DIR), 'instance', 'h2s_simulation.db')
SQLALCHEMY_DATABASE_URL = f'sqlite+aiosqlite:///{DB_PATH}'

engine = create_async_engine(SQLALCHEMY_DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    async with SessionLocal as db:
        yield db
