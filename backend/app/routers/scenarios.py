from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from ..database import get_db
from ..core.auth import get_current_user
from ..schemas.scenarios import ScenariosResponse, ScenariosCreate
from ..models.users import Users
from ..services.scenarios import ScenarioService

router = APIRouter(
    prefix="/scenarios",
    tags=["Scenarios"],
)


@router.get("/", response_model=List[ScenariosResponse])
async def get_scenarios(db: AsyncSession = Depends(get_db), current_user: Users = Depends(get_current_user)):
    service = ScenarioService(db)
    return await service.get_scenarios(current_user)


@router.get("/{id}", response_model=ScenariosResponse)
async def get_scenario_by_id(
        id: int,
        db: AsyncSession = Depends(get_db),
        current_user: Users = Depends(get_current_user)
):
    service = ScenarioService(db)
    return await service.get_scenario_by_id(id, current_user)


@router.post("/", response_model=ScenariosResponse, status_code=status.HTTP_201_CREATED)
async def create_scenario(
        new_scenario: ScenariosCreate,
        db: AsyncSession = Depends(get_db),
        current_user: Users = Depends(get_current_user)
):
    service = ScenarioService(db)
    return await service.create_scenario(new_scenario, current_user)


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scenario(
        id: int,
        db: AsyncSession = Depends(get_db),
        current_user: Users = Depends(get_current_user)
):
    service = ScenarioService(db)
    await service.delete_scenario(id, current_user)

    return None

