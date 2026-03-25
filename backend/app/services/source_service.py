from sqlalchemy.ext.asyncio import AsyncSession
from ..repositories.sources import SourcesRepository
from ..schemas.sources import SourcesCreate


class SourceService:
    def __init__(self, db: AsyncSession):
        self.repository = SourcesRepository(db)

    async def add_source(self, source_schema: SourcesCreate):
        result = await self.repository.add_source(source_schema)
        return result

    async def delete_source(self, source_id: int):
        result = await self.repository.del_source(source_id)
        return result

    async def get_all_sources(self):
        result = await self.repository.get_all_sources()
        return result
