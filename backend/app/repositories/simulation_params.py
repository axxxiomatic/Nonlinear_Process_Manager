from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, Sequence
from ..models.simulation_params import SimulationParams
from ..schemas.simulation_params import SimulationParamsCreate


class SimulationParamsRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_simulation_params(self) -> Sequence[SimulationParams]:
        stmt = select(SimulationParams)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def create_simulation_params(
            self,
            new_simulation_params: SimulationParamsCreate
    ) -> SimulationParams | None:
        simulation_params_data = new_simulation_params.model_dump()
        simulation_params = SimulationParams(**simulation_params_data)

        self.db.add(simulation_params)
        await self.db.commit()
        await self.db.refresh(simulation_params)

        return simulation_params
