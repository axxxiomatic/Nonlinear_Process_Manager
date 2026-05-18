from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, Sequence
from ..models.sources import Sources
from ..schemas.sources import SourcesCreate


class SourcesRepository:
    def __init__(self, db:AsyncSession):
        self.db = db

    async def get_all_sources(self) -> Sequence[Sources]:
        stmt = select(Sources)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def get_sources_by_substance(self, substance_id: int) -> Sequence[Sources]:
        stmt = select(Sources).where(Sources.substance_id == substance_id)

        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def add_source(self, source_schema: SourcesCreate) -> Sources:
        source_data = source_schema.model_dump()

        source = Sources(**source_data)

        self.db.add(source)
        await self.db.commit()
        await self.db.refresh(source)
        return source

    async def del_source(self, source_id: int) -> bool:
        stmt = select(Sources).where(Sources.id==source_id)

        result = await self.db.execute(stmt)
        source = result.scalars().first()

        if not source:
            return False

        await self.db.delete(source)
        await self.db.commit()

        return True

    async def get_sources_by_scenario_id(self, scenario_id: int) -> Sequence[Sources]:
        stmt = select(Sources).where(Sources.scenario_id == scenario_id)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def get_source_by_id(self, source_id: int) -> Sources | None:
        stmt = select(Sources).where(Sources.id == source_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_sources_by_substance_internal(self, substance_id: int) -> Sequence[Sources]:
        stmt = select(Sources).where(Sources.substance_id == substance_id)
        result = await self.db.execute(stmt)
        return result.scalars().all()
