from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from ..repositories.sources import SourcesRepository
from ..schemas.sources import SourcesCreate
from ..models.users import Users
from .scenarios import ScenariosRepository

"""
    Удалить HTTPException когда кастомные искл.
"""


class SourceService:
    def __init__(self, db: AsyncSession):
        self.repository = SourcesRepository(db)
        self.scenario_repository = ScenariosRepository(db)

    async def __check_scenario_ownership(
            self, scenario_id: int, current_user: Users
    ):
        scenario = await self.scenario_repository.get_scenario_by_id(scenario_id)
        if not scenario:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                                detail="Scenario not found")

        if scenario.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough rights to access this scenario"
            )

    async def add_source(self, source_schema: SourcesCreate, current_user: Users):
        await self.__check_scenario_ownership(source_schema.scenario_id, current_user)
        result = await self.repository.add_source(source_schema)
        return result

    async def delete_source(self, source_id: int, current_user: Users):
        source = await self.repository.get_source_by_id(source_id)
        if not source:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Source not found"
            )

        await self.__check_scenario_ownership(source.scenario_id, current_user)

        result = await self.repository.del_source(source_id)
        return result

    async def get_all_sources(self, current_user: Users):
        result = await self.repository.get_all_sources()
        return [source for source in result if source.scenario_id in
                {scenario.id for scenario in await self.scenario_repository.get_scenario_by_user_id(current_user.id)}]

    async def get_sources_by_substance(self, substance_id: int, current_user: Users):
        result = await self.repository.get_sources_by_substance(substance_id)
        return [source for source in result if source.scenario_id in
                {scenario.id for scenario in await self.scenario_repository.get_scenario_by_user_id(current_user.id)}]

    async def get_sources_by_substance_internal(self, substance_id: int):
        return await self.repository.get_sources_by_substance_internal(substance_id)
