from sqlalchemy.ext.asyncio import AsyncSession
from ..models.substances import Substances
from ..schemas.substance import SubstanceCreate
from sqlalchemy import select, Sequence


class SubstancesRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all_substances(self) -> Sequence[Substances]:
        stmt = select(Substances)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def get_substance_by_id(self, substance_id: int) -> Substances | None:
        stmt = select(Substances).where(Substances.id == substance_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def add_substance(self, substance_schema: SubstanceCreate) -> Substances:
        substance_data = substance_schema.model_dump()
        substance = Substances(**substance_data)
        self.db.add(substance)
        await self.db.commit()
        await self.db.refresh(substance)
        return substance
