from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from io import BytesIO
from ..database import get_db
from ..services.layout_service import LayoutService
from ..services.simulation_params_service import SimulationParamsService
from ..schemas.simulation_params import SimulationParamsCreate

router = APIRouter(tags=['simulation'], prefix="/api/simulation")


@router.get("/tiles/{z}/{x}/{y}.png")
async def get_pollution_tile(z: int, x: int, y: int, db: AsyncSession = Depends(get_db)):
    service = LayoutService(db)
    image = await service.render_tile(x, y, z)
    buf = BytesIO()
    image.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")

@router.post("/params", status_code=status.HTTP_201_CREATED)
async def update_simulation_params(
    new_params: SimulationParamsCreate,
    db: AsyncSession = Depends(get_db)
):
    params_service = SimulationParamsService(db)
    await params_service.create_simulation_params(new_params)
    return {"status": "ok"}