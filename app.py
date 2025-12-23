import database as db
import os
import webbrowser
from threading import Timer
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

YMAPS_API_KEY = os.getenv('YMAPS_API_KEY')
YMAPS_LANG = os.getenv('YMAPS_LANG')
YWEATHER_API_KEY = os.getenv('YWEATHER_API_KEY')

required_vars = ['YMAPS_API_KEY', 'YMAPS_LANG', 'YWEATHER_API_KEY']
missing_vars = [var for var in required_vars if not os.getenv(var)]
if missing_vars:
    raise ValueError(f"Отсутствуют обязательные переменные окружения: {', '.join(missing_vars)}")

# Если папка instance для хранения БД не создана, она создаётся
if not os.path.exists('instance'):
    os.makedirs('instance')

@app.context_processor
def inject_config():
    """Внедряет конфигурацию во все шаблоны"""
    return {
        'config': {
            'YMAPS_API_KEY ': YMAPS_API_KEY,
            'YMAPS_LANG': YMAPS_LANG,
            'YWEATHER_API_KEY': YWEATHER_API_KEY,
        }
    }

# Страницы сайта
@app.route('/')
def index():
    """Страница мониторинга"""
    try:
        sources = db.get_sources()
        params = db.get_simulation_params()

        return render_template('index.html',
                             sources=sources,
                             wind_speed=params['wind_speed'],
                             wind_direction=params['wind_direction'],
                             stability_class=params['stability_class'])

    except Exception as e:
        print(f"Ошибка пути до страницы мониторинга: {e}")
        return "Ошибка загрузки страницы", 500

@app.route('/history')
def history():
    """Страница истории"""
    try:
        return render_template('history.html')
    except Exception as e:
        print(f"Ошибка пути до страницы истории: {e}")
        return "Ошибка загрузки страницы", 500

@app.route('/forecasting')
def forecasting():
    """Страница прогнозирования"""
    try:
        return render_template('forecasting.html')
    except Exception as e:
        print(f"Ошибка пути до страницы прогнозирования: {e}")
        return "Ошибка загрузки страницы", 500

@app.route('/recommendations')
def recommendations():
    """Страница рекомендаций"""
    try:
        return render_template('recommendations.html')
    except Exception as e:
        print(f"Ошибка пути до страницы рекомендаций: {e}")
        return "Ошибка загрузки страницы", 500

@app.route('/enterprise')
def enterprise():
    """Страница режима предприятия"""
    try:
        return render_template('enterprise.html')
    except Exception as e:
        print(f"Ошибка пути до страницы режима предприятия: {e}")
        return "Ошибка загрузки страницы", 500

@app.route('/login')
def login():
    """Страница авторизации"""
    try:
        return render_template('login.html')
    except Exception as e:
        print(f"Ошибка пути до страницы авторизации: {e}")
        return "Ошибка загрузки страницы", 500

# API-маршруты
@app.route('/api/sources', methods=['GET'])
def get_sources_api():
    """GET-запрос на получение списка источников выбросов"""
    try:
        sources = db.get_sources()
        return jsonify(sources)
    except Exception as e:
        print(f"Ошибка получения источников выбросов: {e}")
        return jsonify({'error': 'failed to get emission sources list'}), 500

@app.route('/api/sources', methods=['POST'])
def add_source_api():
    """POST-запрос для добавления нового источника выбросов"""
    try:
        data = request.json
        source_id = db.add_source(
            name=data.get('name', 'Новый источник'),
            source_type=data.get('type', 'point'),
            latitude=data.get('latitude'),
            longitude=data.get('longitude'),
            height=data.get('height', 40.0),
            emission_rate=data.get('emission_rate', 3.7)
        )
        return jsonify({'success': True, 'source_id': source_id})
    except Exception as e:
        print(f"Ошибка добавления источника выбросов: {e}")
        return jsonify({'error': 'failed to add emission source'}), 500

@app.route('/api/sources/<int:source_id>', methods=['DELETE'])
def delete_source_api(source_id):
    """DELETE-запрос на удаление источника выбросов"""
    try:
        db.delete_source(source_id)
        return jsonify({'success': True})
    except Exception as e:
        print(f"Ошибка удаления источника выбросов: {e}")
        return jsonify({'error': 'failed to delete emission source'}), 500

@app.route('/api/params', methods=['GET'])
def get_params_api():
    """GET-запрос на получение параметров моделирования"""
    try:
        params = db.get_simulation_params()
        return jsonify(params)
    except Exception as e:
        print(f"Ошибка получения параметров моделирования: {e}")
        return jsonify({'error': 'failed to get simulation parameters'}), 500

@app.route('/api/params', methods=['POST'])
def update_params_api():
    """POST-запрос на обновление параметров моделирования"""
    try:
        data = request.json
        db.update_simulation_params(
            wind_speed=data.get('wind_speed'),
            wind_direction=data.get('wind_direction'),
            stability_class=data.get('stability_class')
        )
        return jsonify({'success': True})
    except Exception as e:
        print(f"Ошибка обновления параметров моделирования: {e}")
        return jsonify({'error': 'failed to update simulation parameters'}), 500

@app.errorhandler(404)
def not_found(error):
    return "Page not found", 404

@app.errorhandler(500)
def internal_error(error):
    return "Internal server error", 500

if __name__ == '__main__':
    try:
        # Инициализация БД при запуске
        print("Инициализация базы данных...")
        db.init_db()
        print("База данных инициализирована успешно")
        
        # Определение хоста и порта
        HOST = '127.0.0.1'
        PORT = 5000
        URL = f"http://{HOST}:{PORT}"

        # Функция для открытия браузера
        def open_browser():
            webbrowser.open_new(URL)

        print("Цифровая платформа предсказания выбросов")
        print(f"Сервер запускается по адресу: {URL}")
        print("Нажмите CTRL + C, чтобы остановить сервер")
        
        # Браузер открывается через 1 секунду в отдельном потоке, что даёт серверу время на запуск
        Timer(1, open_browser).start()

        # Запуск сервера Flask
        app.run(
            host=HOST, 
            port=PORT, 
            debug=True,
            use_reloader=False 
        )

    except Exception as e:
        print(f"Failed to start server: {e}")
        print(f"Make sure no other application is using port {PORT}")
