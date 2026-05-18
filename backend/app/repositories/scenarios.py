from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select, Sequence

from ..models.scenarios import Scenarios
from ..schemas.scenarios import ScenariosCreate


class ScenariosRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all_scenarios(self) -> Sequence[Scenarios]:
        stmt = select(Scenarios).options(selectinload(Scenarios.user))
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def get_scenario_by_user_id(self, user_id: int) -> Sequence[Scenarios]:
        stmt = select(Scenarios).where(Scenarios.user_id == user_id).options(selectinload(Scenarios.user))
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def get_scenario_by_user_ids(self, user_ids: list[int]) -> Sequence[Scenarios]:
        stmt = select(Scenarios).where(Scenarios.user_id.in_(user_ids)).options(selectinload(Scenarios.user))
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def get_scenario_by_id(self, scenario_id: int) -> Scenarios:
        stmt = select(Scenarios).where(Scenarios.id == scenario_id).options(selectinload(Scenarios.user))
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def create(self, schema: ScenariosCreate) -> Scenarios:
        scenario = Scenarios(**schema.model_dump())
        self.db.add(scenario)
        await self.db.commit()
        await self.db.refresh(scenario)
        return scenario

    async def delete(self, scenario_id: int) -> bool:
        scenario = await self.get_scenario_by_id(scenario_id)
        if not scenario:
            return False

        await self.db.delete(scenario)
        await self.db.commit()
        return True
