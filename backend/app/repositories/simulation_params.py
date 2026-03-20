from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..models.simulation_params import SimulationParams
from typing import List
from ..schemas.simulation_params import SimulationParamsCreate


class SimulationParamsRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_simulation_params(self) -> List[SimulationParams]:
        stmt = select(SimulationParams)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def update_simulation_params(
            self,
            id: int,
            new_simulation_params: SimulationParamsCreate
    ) -> SimulationParams | None:

        stmt = select(SimulationParams).where(SimulationParams.id == id)
        result = await self.db.execute(stmt)
        simulation_params = result.scalars().first()

        if not simulation_params:
            return None

        update_data = new_simulation_params.model_dump()

        for key, value in update_data.items():
            setattr(simulation_params, key, value)

        await self.db.commit()
        await self.db.refresh(simulation_params)

        return simulation_params
