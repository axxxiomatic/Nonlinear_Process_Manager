from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from .routers import pages, sources_api, simulation_params_api, layout
from .core.config import STATIC_DIR
from .database import init_models
from contextlib import asynccontextmanager
from . import models

"""
    как только будет Alembic - удалить init_model
    заменить app = FastAPI(lifespan=lifespan) на app = FastAPI()
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Пересоздание таблиц в БД...")
    await init_models()
    print("Таблицы готовы.")
    yield
    print("Завершение работы...")


app = FastAPI(lifespan=lifespan)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

app.include_router(pages.router)
app.include_router(sources_api.router)
app.include_router(simulation_params_api.router)
app.include_router(layout.router)
