import sqlite3
import os

def get_db_path():
    """Получение пути к базе данных"""
    return 'instance/h2s_simulation.db'

def init_db():
    """Инициализация базы данных с тестовым содержанием"""
    try:
        db_path = get_db_path()
        
        # Если директории базы данных instance нет, она создаётся
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Создание таблицы источников
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS sources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                height REAL NOT NULL,
                emission_rate REAL NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Создание таблицы параметров моделирования
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS simulation_params (
                id INTEGER PRIMARY KEY,
                wind_speed REAL NOT NULL,
                wind_direction TEXT NOT NULL,
                stability_class TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Проверка наличия данных в таблице с помощью курсора
        cursor.execute("SELECT COUNT(*) FROM sources")
        if cursor.fetchone()[0] == 0:
            # Если данных нет, добавляется тестовый набор
            test_sources = [
                ('Источник 1', 'point', 55.7558, 37.6173, 40.0, 3.7),
                ('Источник 2', 'point', 55.7600, 37.6250, 35.0, 2.5),
                ('Источник 3', 'point', 55.7500, 37.6100, 45.0, 4.2)
            ]

            cursor.executemany('''
                INSERT INTO sources (name, type, latitude, longitude, height, emission_rate)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', test_sources)

            # Добавление параметров по умолчанию
            cursor.execute('''
                INSERT OR REPLACE INTO simulation_params (id, wind_speed, wind_direction, stability_class)
                VALUES (1, 2.4, '0', 'C')
            ''')

        conn.commit()
        conn.close()
        print("База данных успешно инициализирована")
        
    except Exception as e:
        print(f"Ошибка инициализации базы данных: {e}")
        raise

def get_sources():
    """Получение всех источников выбросов из базы данных"""
    try:
        conn = sqlite3.connect(get_db_path())
        cursor = conn.cursor()

        cursor.execute('''
            SELECT id, name, type, latitude, longitude, height, emission_rate
            FROM sources
            ORDER BY created_at DESC
        ''')

        sources = []
        for row in cursor.fetchall():
            sources.append({
                'id': row[0],
                'name': row[1],
                'type': row[2],
                'latitude': row[3],
                'longitude': row[4],
                'height': row[5],
                'emission_rate': row[6]
            })

        conn.close()
        return sources
    except Exception as e:
        print(f"Ошибка получения источников выбросов из базы данных: {e}")
        return []

def get_simulation_params():
    """Получение параметров моделирования"""
    try:
        conn = sqlite3.connect(get_db_path())
        cursor = conn.cursor()

        cursor.execute('''
            SELECT wind_speed, wind_direction, stability_class
            FROM simulation_params
            WHERE id = 1
        ''')

        row = cursor.fetchone()
        conn.close()

        if row:
            return {
                'wind_speed': row[0],
                'wind_direction': row[1],
                'stability_class': row[2]
            }
        else:
            # Значения по умолчанию
            return {
                'wind_speed': 2.4,
                'wind_direction': '0',
                'stability_class': 'C'
            }
    except Exception as e:
        print(f"Ошибка получения параметров моделирования из базы данных: {e}")
        return {
            'wind_speed': 2.4,
            'wind_direction': '0',
            'stability_class': 'C'
        }

def add_source(name, source_type, latitude, longitude, height, emission_rate):
    """Добавление нового источника"""
    try:
        conn = sqlite3.connect(get_db_path())
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO sources (name, type, latitude, longitude, height, emission_rate)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (name, source_type, latitude, longitude, height, emission_rate))

        conn.commit()
        source_id = cursor.lastrowid
        conn.close()
        return source_id
    except Exception as e:
        print(f"Ошибка добавления источника выбросов в базу данных: {e}")
        raise

def delete_source(source_id):
    """Удаление источника"""
    try:
        conn = sqlite3.connect(get_db_path())
        cursor = conn.cursor()

        cursor.execute('DELETE FROM sources WHERE id = ?', (source_id,))

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Ошибка удаления источника выбросов из базы данных: {e}")
        raise

def update_simulation_params(wind_speed, wind_direction, stability_class):
    """Обновление параметров моделирования"""
    try:
        conn = sqlite3.connect(get_db_path())
        cursor = conn.cursor()

        cursor.execute('''
            INSERT OR REPLACE INTO simulation_params (id, wind_speed, wind_direction, stability_class)
            VALUES (1, ?, ?, ?)
        ''', (wind_speed, wind_direction, stability_class))

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Ошибка обновления параметров моделирования в базе данных: {e}")
        raise
