from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from fastapi.security import HTTPBearer
from ..services.source_service import SourceService
from ..core.emissions_calculation_math.state import pollution_state
from ..database import get_db
from ..schemas.sources import SourcesCreate, SourcesResponse
from ..core.auth import get_current_user

http_bearer = HTTPBearer(auto_error=False)

router = APIRouter(tags=['sources'], prefix="/api/sources",dependencies=[Depends(http_bearer)])


@router.get("/", response_model=List[SourcesResponse])
async def get_all_sources(db: AsyncSession = Depends(get_db), current_user: int = Depends(get_current_user)):
    source_service = SourceService(db)
    result = await source_service.get_all_sources(current_user)

    return result


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_source(new_source: SourcesCreate,
                        db: AsyncSession = Depends(get_db),
                        current_user: int = Depends(get_current_user)):
    source_service = SourceService(db)
    result = await source_service.add_source(new_source, current_user)
    print(result)

    pollution_state.invalidate_sources()

    return result


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source(id: int, db: AsyncSession = Depends(get_db),current_user: int = Depends(get_current_user)):
    source_service = SourceService(db)
    result = await source_service.delete_source(id, current_user)

    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Пользователь с таким id не существует")

    pollution_state.invalidate_sources()

    return None
