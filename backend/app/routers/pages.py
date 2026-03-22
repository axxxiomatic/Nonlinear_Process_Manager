from fastapi import APIRouter, Request, HTTPException, status, Depends
from ..services.source_service import SourceService
from ..services.simulation_params_service import SimulationParamsService
from sqlalchemy.ext.asyncio import AsyncSession
from ..database import get_db
from ..core.templates import templates

router = APIRouter(tags=['pages'])


@router.get('/')
async def index(request: Request, db:AsyncSession = Depends(get_db)):
    source_service = SourceService(db)
    simulation_params_service = SimulationParamsService(db)

    sources = await source_service.get_all_sources()
    simulation_params = await simulation_params_service.get_simulation_params()

    template = templates.TemplateResponse("index.html", {
        "request": request,
        "sources": sources,
        "simulation_params": simulation_params
    })
    return template


@router.get('/history')
async def history(request:Request):
    template = templates.TemplateResponse("history.html", {"request": request})
    return template


@router.get('/recommendations')
async def recommendations(request:Request):
    template = templates.TemplateResponse("recommendations.html", {"request": request})
    return template


@router.get('/forecasting')
async def forecasting(request:Request):
    template = templates.TemplateResponse("forecasting.html", {"request":request})
    return template


@router.get('/enterprise')
async def enterprise(request: Request, db: AsyncSession = Depends(get_db)):

    source_service = SourceService(db)
    sources = await source_service.get_all_sources()
    template = templates.TemplateResponse("enterprise.html", {
        "request": request,
        "sources": sources})
    return template


@router.get('/login')
async def login(request: Request):
    template = templates.TemplateResponse("login.html", {"request": request})
    return template


