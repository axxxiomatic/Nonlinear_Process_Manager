from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from .routers import pages, sources_api, simulation_params_api, layout, substances_api, users, auth, scenarios
from .core.config import STATIC_DIR

app = FastAPI()

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

app.include_router(pages.router)
app.include_router(sources_api.router)
app.include_router(simulation_params_api.router)
app.include_router(layout.router)
app.include_router(substances_api.router)
app.include_router(users.router)
app.include_router(auth.router)
app.include_router(scenarios.router)
