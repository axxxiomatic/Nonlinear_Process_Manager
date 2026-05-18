from fastapi import APIRouter, Request, Depends
from ..services.simulation_params_service import SimulationParamsService
from sqlalchemy.ext.asyncio import AsyncSession
from ..database import get_db
from ..core.templates import templates

router = APIRouter(tags=['pages'])


@router.get('/')
async def index(request: Request, db:AsyncSession = Depends(get_db)):
    simulation_params_service = SimulationParamsService(db)

    simulation_params = await simulation_params_service.get_simulation_params()

    template = templates.TemplateResponse("index.html", {
        "request": request,
        "simulation_params": simulation_params,
    })
    return template

