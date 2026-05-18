from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from ..repositories.scenarios import ScenariosRepository
from ..models.users import Users, RolesTypesEnum
from ..models.scenarios import Scenarios
from ..repositories.users import UserRepository
from ..schemas.scenarios import ScenariosCreate

"""убрать вызов исключений из сервисов, когда будут готовы кастомные исключения"""


class ScenarioService:
    def __init__(self, db: AsyncSession):
        self.repository = ScenariosRepository(db)
        self.user_repository = UserRepository(db)

    async def __check_access(self, scenario: Scenarios, current_user) -> None:
        if current_user.role == RolesTypesEnum.admin:
            return None

        if scenario.user_id == current_user.id:
            return None

        if current_user.role == RolesTypesEnum.professor:
            students = await self.user_repository.get_students_in_groups(current_user.group)
            if scenario.user_id in {student.id for student in students}:
                return None
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough rights to access this scenario"
        )

    async def get_scenarios(self, current_user: Users) -> list[Scenarios]:
        match current_user.role:
            case RolesTypesEnum.admin:
                return list(await self.repository.get_all_scenarios())

            case RolesTypesEnum.student:
                return list(await self.repository.get_scenario_by_user_id(current_user.id))

            case RolesTypesEnum.professor:
                own = list(await self.repository.get_scenario_by_user_id(current_user.id))

                students = await self.user_repository.get_students_in_groups(current_user.group)
                student_ids = [student.id for student in students]

                students_scenarios = (
                    list(await self.repository.get_scenario_by_user_ids(student_ids))
                    if student_ids else []
                )
                return own + students_scenarios

            case _:

                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Unknown role"
                )

    async def get_scenario_by_id(self, scenario_id: int, current_user: Users):
        scenario = await self.repository.get_scenario_by_id(scenario_id)
        if not scenario:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Scenario not found"
            )

        await self.__check_access(scenario, current_user)
        return scenario

    async def create_scenario(self, scenario_schema: ScenariosCreate, current_user: Users):
        if current_user.role == RolesTypesEnum.student and scenario_schema.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Can not create scenarios on other user behalf"
            )
        result = await self.repository.create(scenario_schema)
        return result

    async def delete_scenario(self, scenario_id: int, current_user: Users):
        scenario = await self.repository.get_scenario_by_id(scenario_id)
        if not scenario:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Scenario not found"
            )
        await self.__check_access(scenario, current_user)
        return await self.repository.delete(scenario_id)
