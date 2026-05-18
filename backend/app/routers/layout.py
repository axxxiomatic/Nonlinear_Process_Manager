from fastapi import APIRouter, Depends, Response, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from io import BytesIO
from typing import Optional
from ..database import get_db
from ..services.layout_service import LayoutService
from ..services.simulation_params_service import SimulationParamsService
from ..schemas.simulation_params import SimulationParamsCreate

router = APIRouter(tags=['simulation'], prefix="/api/simulation")


@router.get("/tiles/{substance_id}/{z}/{x}/{y}.png")
async def get_pollution_tile(
        substance_id: int,
        z: int,
        x: int,
        y: int,
        scenario_id: Optional[int] = Query(None),
        wind_speed: Optional[float] = Query(3.0),
        wind_direction: Optional[float] = Query(180.0),
        temperature: Optional[float] = Query(20.0),
        pressure: Optional[float] = Query(1013.0),
        db: AsyncSession = Depends(get_db)
):
    service = LayoutService(db)
    image = await service.render_tile(
        substance_id=substance_id,
        tx=x,
        ty=y,
        tz=z,
        scenario_id=scenario_id,
        wind_speed=wind_speed,
        wind_direction=wind_direction,
        temperature=temperature,
        pressure=pressure,
    )
    buf = BytesIO()
    image.save(buf, format="PNG")
    return Response(
        content=buf.getvalue(),
        media_type="image/png",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache"
        }
    )


@router.post("/params", status_code=status.HTTP_201_CREATED)
async def update_simulation_params(
        new_params: SimulationParamsCreate,
        db: AsyncSession = Depends(get_db)
):
    params_service = SimulationParamsService(db)
    await params_service.create_simulation_params(new_params)
    return {"status": "ok"}
