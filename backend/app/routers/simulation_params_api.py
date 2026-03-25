from ..services.simulation_params_service import SimulationParamsService
from sqlalchemy.ext.asyncio import AsyncSession
from ..database import get_db
from fastapi import APIRouter, HTTPException, status, Depends
from ..schemas.simulation_params import SimulationParamsResponse, SimulationParamsCreate

router = APIRouter(tags=['simulation_params'], prefix="/api/simulation_params")

@router.get("/")
async def get_params(db: AsyncSession = Depends(get_db)):
    params_service = SimulationParamsService(db)

    result = await params_service.get_simulation_params()

    return result


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_params(new_params: SimulationParamsCreate,db: AsyncSession = Depends(get_db)):
    params_service = SimulationParamsService(db)

    await params_service.create_simulation_params(new_params)



