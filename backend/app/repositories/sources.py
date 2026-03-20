from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..models.sources import Sources
from typing import List


class SourcesRepository:
    def __init__(self, db:AsyncSession):
        self.db = db

    async def get_all_sources(self) -> List[Sources]:
        stmt = select(Sources)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def add_source(self, source_data: dict) -> Sources:
        source = Sources(**source_data)
        self.db.add(source)
        await self.db.commit()
        await self.db.refresh(source)
        return source

    async def del_source(self, source_id: int) -> None:
        stmt = select(Sources).where(source_id==Sources.id)

        result = await self.db.execute(stmt)
        source = result.scalars().first()

        await self.db.delete(source)
        await self.db.commit()
