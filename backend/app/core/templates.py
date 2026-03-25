from fastapi.templating import Jinja2Templates
from backend.app.core.config import TEMPLATES_DIR, TEMPLATE_CONFIG

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

# Теперь переменная 'config' доступна во всех HTML файлах
templates.env.globals["config"] = TEMPLATE_CONFIG