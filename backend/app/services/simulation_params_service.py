from sqlalchemy.ext.asyncio import AsyncSession
from ..repositories.simulation_params import SimulationParamsRepository
from ..schemas.simulation_params import SimulationParamsCreate


class SimulationParamsService:
    def __init__(self, db: AsyncSession):
        self.repository = SimulationParamsRepository(db)

    async def get_simulation_params(self):
        result = await self.repository.get_simulation_params()
        return result

    async def create_simulation_params(self, new_simulation_params:SimulationParamsCreate):
        result = await self.repository.create_simulation_params(new_simulation_params)
        return result
