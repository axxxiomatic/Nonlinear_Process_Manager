from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[3]

TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"




class Settings(BaseSettings):
    # --- База данных ---
    database_hostname: str
    database_port: str
    database_password: str
    database_name: str
    database_username: str

    # --- Авторизация (На будущее) ---
#    secret_key: str
#    algorithm: str
#    access_token_expiration_minutes: int

    # --- Yandex карты ---
    ymaps_api_key: str
    ymaps_lang: str = "ru_RU"
    yweather_api_key: str

    # extra="ignore" позволяет иметь в .env лишние переменные без ошибок
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def template_config(self) -> dict:
        return {
            "YMAPS_API_KEY": self.ymaps_api_key,
            "YMAPS_LANG": self.ymaps_lang,
            "YWEATHER_API_KEY": self.yweather_api_key,
        }

try:
    settings = Settings()
except Exception as e:
    print(f"ОШИБКА ЗАГРУЗКИ КОНФИГУРАЦИИ: {e}")
    raise e

TEMPLATE_CONFIG = settings.template_config
