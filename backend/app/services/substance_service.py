from sqlalchemy.ext.asyncio import AsyncSession
from ..repositories.substance import SubstancesRepository
from ..schemas.substance import SubstanceCreate


class SubstanceService:
    def __init__(self, db: AsyncSession):
        self.repository = SubstancesRepository(db)

    async def get_all_substances(self):
        result = await self.repository.get_all_substances()
        return result

    async def get_substance_by_id(self, substance_id: id):
        result = await self.repository.get_substance_by_id(substance_id)
        return result

    async def add_substance(self, substance_schema: SubstanceCreate):
        result = await self.repository.add_substance(substance_schema)
        return result
