from fastapi import APIRouter, HTTPException, status, Depends
from ..services.source_service import SourceService
from sqlalchemy.ext.asyncio import AsyncSession
from ..database import get_db
from ..schemas.sources import SourcesCreate

router = APIRouter(tags=['sources'], prefix="/api/sources")


@router.get("/")
async def get_all_sources(db: AsyncSession = Depends(get_db)):
    source_service = SourceService(db)
    result = await source_service.get_all_sources()

    return result


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_source(new_source: SourcesCreate, db: AsyncSession = Depends(get_db)):
    source_service = SourceService(db)
    result = await source_service.add_source(new_source)
    print(result)
    return result


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source(id: int, db: AsyncSession = Depends(get_db)):
    source_service = SourceService(db)
    result = await source_service.delete_source(id)

    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Пользователь с таким id не существует")

    return result
