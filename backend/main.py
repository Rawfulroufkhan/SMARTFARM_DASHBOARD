from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from datetime import datetime, timedelta
from typing import Optional, List
import json
import urllib.request
import urllib.parse
import asyncio
import secrets

app = FastAPI(title="SmartFarm API", version="2.1.0")

# ============================================================
# CORS
# ============================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:5176",
    "http://localhost:5177",

    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
    "http://127.0.0.1:5176",
    "http://127.0.0.1:5177",
],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# CONFIGURATION
# ============================================================
HISTORY_LIMIT = 500

# Keep this FALSE exactly as in the current project until real
# relay hardware is enabled.
PUMP_HARDWARE_ENABLED = False
AUTO_IRRIGATION_ENABLED = True

MOISTURE_START_THRESHOLD = 30.0
MOISTURE_STOP_THRESHOLD = 55.0
HIGH_TEMPERATURE = 35.0
LOW_HUMIDITY = 35.0
PH_LOW = 5.5
PH_HIGH = 7.5

# ThingSpeak channel currently used by SmartFarm
THINGSPEAK_CHANNEL_ID = "3519031"
THINGSPEAK_READ_API_KEY = "4W5S2OKWWKSPEPXZ"
THINGSPEAK_POLL_SECONDS = 5

# Weather location: Coimbatore for now.
# These can later be replaced by GPS coordinates.
WEATHER_LATITUDE = 11.0168
WEATHER_LONGITUDE = 76.9558
WEATHER_LOCATION_NAME = "Coimbatore"
WEATHER_CACHE_MINUTES = 10

# Prototype farmer login.
# Change these before real deployment.
FARMER_USERNAME = "farmer"
FARMER_PASSWORD = "farmer123"

# ============================================================
# MODELS
# ============================================================
class SensorData(BaseModel):
    soil_moisture: float = Field(..., ge=0, le=100)
    temperature: float
    humidity: float = Field(..., ge=0, le=100)
    ph: float = Field(..., ge=0, le=14)
    light: float = Field(..., ge=0)
    rain: bool = False


class IrrigationRequest(BaseModel):
    duration_minutes: float = Field(default=5, ge=0.1, le=120)
    source: str = "manual"


class FertilizerRequest(BaseModel):
    fertilizer: str
    amount_kg: float = Field(..., gt=0, le=10000)
    crop: str = "General"
    field: str = "Farm Alpha"
    notes: str = ""


class LoginRequest(BaseModel):
    username: str
    password: str


class LocationRequest(BaseModel):
    latitude: float
    longitude: float
    accuracy_m: float = 0.0


# ============================================================
# IN-MEMORY STORAGE
# ============================================================
latest_sensor_data = {}
previous_sensor_data = {}
sensor_history: List[dict] = []
irrigation_history: List[dict] = []
fertilizer_history: List[dict] = []
alerts: List[dict] = []

pump_state = {
    "running": False,
    "mode": "AUTO" if AUTO_IRRIGATION_ENABLED else "MANUAL",
    "last_action": None,
    "last_action_time": None,
}

alert_last_seen = {}
active_tokens = {}

weather_cache = {
    "data": None,
    "updated_at": None,
    "latitude": None,
    "longitude": None,
}

# Browser/GPS location supplied by the dashboard.
last_browser_location = {
    "latitude": None,
    "longitude": None,
    "accuracy_m": None,
    "updated_at": None,
}

thingspeak_state = {
    "last_entry_id": None,
    "last_created_at": None,
    "last_poll": None,
    "connected": False,
    "error": None,
}


# ============================================================
# HELPERS
# ============================================================
def now_iso():
    return datetime.now().isoformat()


def add_alert(
    level: str,
    title: str,
    message: str,
    key: Optional[str] = None,
    cooldown_minutes: int = 10,
):
    """Add an alert while preventing repeated alert spam."""
    if key:
        last = alert_last_seen.get(key)
        if last:
            if datetime.now() - last < timedelta(minutes=cooldown_minutes):
                return False
        alert_last_seen[key] = datetime.now()

    alerts.insert(
        0,
        {
            "id": len(alerts) + 1,
            "level": level,
            "title": title,
            "message": message,
            "timestamp": now_iso(),
        },
    )
    del alerts[100:]
    return True


def set_pump_hardware(running: bool):
    """
    Existing safe hardware abstraction.
    No real relay communication is enabled here.
    """
    if not PUMP_HARDWARE_ENABLED:
        return {
            "hardware_enabled": False,
            "simulated": True,
            "running": running,
        }

    # Keep real ESP32/relay communication here when hardware
    # is enabled later.
    return {
        "hardware_enabled": True,
        "simulated": False,
        "running": running,
    }


def weather_code_text(code):
    mapping = {
        0: "Clear sky",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Fog",
        48: "Depositing rime fog",
        51: "Light drizzle",
        53: "Moderate drizzle",
        55: "Dense drizzle",
        61: "Slight rain",
        63: "Moderate rain",
        65: "Heavy rain",
        71: "Slight snow",
        73: "Moderate snow",
        75: "Heavy snow",
        80: "Slight rain showers",
        81: "Moderate rain showers",
        82: "Violent rain showers",
        95: "Thunderstorm",
        96: "Thunderstorm with hail",
        99: "Thunderstorm with heavy hail",
    }
    return mapping.get(code, "Unknown")


# ============================================================
# WEATHER FORECAST
# ============================================================
def fetch_weather_forecast(latitude=None, longitude=None):
    url = (
        "https://api.open-meteo.com/v1/forecast?"
        + urllib.parse.urlencode(
            {
                "latitude": float(latitude if latitude is not None else WEATHER_LATITUDE),
                "longitude": float(longitude if longitude is not None else WEATHER_LONGITUDE),
                "current": ",".join(
                    [
                        "temperature_2m",
                        "relative_humidity_2m",
                        "precipitation",
                        "rain",
                        "weather_code",
                    ]
                ),
                "hourly": ",".join(
                    [
                        "temperature_2m",
                        "precipitation_probability",
                        "precipitation",
                        "rain",
                        "weather_code",
                    ]
                ),
                "daily": ",".join(
                    [
                        "weather_code",
                        "temperature_2m_max",
                        "temperature_2m_min",
                        "precipitation_probability_max",
                        "precipitation_sum",
                        "rain_sum",
                    ]
                ),
                "forecast_days": 3,
                "timezone": "auto",
            }
        )
    )

    request = urllib.request.Request(
        url,
        headers={"User-Agent": "SmartFarm/2.1"},
    )

    with urllib.request.urlopen(request, timeout=5) as response:
        weather = json.loads(response.read().decode("utf-8"))

    current = weather.get("current", {})
    daily = weather.get("daily", {})

    result = {
        "location": {
            "name": (
                "GPS location"
                if latitude is not None and longitude is not None
                else WEATHER_LOCATION_NAME
            ),
            "latitude": float(latitude if latitude is not None else WEATHER_LATITUDE),
            "longitude": float(longitude if longitude is not None else WEATHER_LONGITUDE),
        },
        "current": {
            "temperature": current.get("temperature_2m"),
            "temperature_c": current.get("temperature_2m"),
            "humidity": current.get("relative_humidity_2m"),
            "relative_humidity": current.get("relative_humidity_2m"),
            "precipitation": current.get("precipitation"),
            "rain": current.get("rain"),
            "weather_code": current.get("weather_code"),
            "condition": weather_code_text(current.get("weather_code")),
            "description": weather_code_text(current.get("weather_code")),
        },
        "forecast": [],
        "daily": [],
        "hourly": [],
        "source": "Open-Meteo",
        "updated_at": now_iso(),
    }

    dates = daily.get("time", [])
    max_temp = daily.get("temperature_2m_max", [])
    min_temp = daily.get("temperature_2m_min", [])
    rain_probability = daily.get("precipitation_probability_max", [])
    precipitation = daily.get("precipitation_sum", [])
    rain_sum = daily.get("rain_sum", [])
    weather_codes = daily.get("weather_code", [])

    for i in range(min(3, len(dates))):
        code = weather_codes[i] if i < len(weather_codes) else None
        result["forecast"].append(
            {
                "date": dates[i],
                "temperature_max": (
                    max_temp[i] if i < len(max_temp) else None
                ),
                "temperature_min": (
                    min_temp[i] if i < len(min_temp) else None
                ),
                "max_c": (
                    max_temp[i] if i < len(max_temp) else None
                ),
                "min_c": (
                    min_temp[i] if i < len(min_temp) else None
                ),
                "day": (
                    datetime.fromisoformat(dates[i]).strftime("%a")
                    if i < len(dates)
                    else None
                ),
                "rain_probability": (
                    rain_probability[i]
                    if i < len(rain_probability)
                    else None
                ),
                "precipitation": (
                    precipitation[i] if i < len(precipitation) else None
                ),
                "rain": rain_sum[i] if i < len(rain_sum) else None,
                "weather_code": code,
                "condition": weather_code_text(code),
            }
        )

    result["daily"] = list(result["forecast"])

    hourly = weather.get("hourly", {})
    h_times = hourly.get("time", [])
    h_temp = hourly.get("temperature_2m", [])
    h_prob = hourly.get("precipitation_probability", [])
    h_precip = hourly.get("precipitation", [])
    h_rain = hourly.get("rain", [])
    h_codes = hourly.get("weather_code", [])

    for i in range(min(12, len(h_times))):
        code = h_codes[i] if i < len(h_codes) else None
        result["hourly"].append({
            "time": h_times[i],
            "temperature": h_temp[i] if i < len(h_temp) else None,
            "rain_probability": h_prob[i] if i < len(h_prob) else None,
            "precipitation": h_precip[i] if i < len(h_precip) else None,
            "rain": h_rain[i] if i < len(h_rain) else None,
            "condition": weather_code_text(code),
        })

    return result


def get_weather_forecast(latitude=None, longitude=None):
    # Use the browser's live GPS when supplied; otherwise use the
    # existing Coimbatore fallback. Cache is kept per coordinate pair.
    lat = float(latitude) if latitude is not None else WEATHER_LATITUDE
    lon = float(longitude) if longitude is not None else WEATHER_LONGITUDE

    same_location = (
        weather_cache["latitude"] is not None
        and abs(weather_cache["latitude"] - lat) < 0.0005
        and weather_cache["longitude"] is not None
        and abs(weather_cache["longitude"] - lon) < 0.0005
    )

    if (
        same_location
        and weather_cache["data"] is not None
        and weather_cache["updated_at"] is not None
        and datetime.now() - weather_cache["updated_at"]
        < timedelta(minutes=WEATHER_CACHE_MINUTES)
    ):
        return weather_cache["data"]

    try:
        result = fetch_weather_forecast(lat, lon)
        weather_cache["data"] = result
        weather_cache["updated_at"] = datetime.now()
        weather_cache["latitude"] = lat
        weather_cache["longitude"] = lon
        return result

    except Exception as e:
        print("Weather API error:", e)

        if same_location and weather_cache["data"] is not None:
            return weather_cache["data"]

        return {
            "location": {
                "name": "GPS location" if latitude is not None else WEATHER_LOCATION_NAME,
                "latitude": lat,
                "longitude": lon,
            },
            "current": {},
            "forecast": [],
            "daily": [],
            "hourly": [],
            "source": "Open-Meteo",
            "error": "Weather service temporarily unavailable",
            "updated_at": now_iso(),
        }


def weather_rain_expected_soon(weather_data=None):
    """Return (rain_probability, forecast_available)."""
    try:
        data = weather_data if weather_data is not None else get_weather_forecast()
        probabilities = []

        # Prefer the next 12 hourly forecast values.
        for item in (data.get("hourly") or [])[:12]:
            value = item.get("rain_probability")
            if isinstance(value, (int, float)):
                probabilities.append(float(value))

        if probabilities:
            return max(0.0, min(100.0, max(probabilities))), True

        # Fall back to today's daily forecast.
        forecast = data.get("forecast") or []
        if forecast:
            value = forecast[0].get("rain_probability")
            if isinstance(value, (int, float)):
                return max(0.0, min(100.0, float(value))), True
    except Exception:
        pass

    return 0.0, False


# ============================================================
# ALERT PROCESSING
# ============================================================
def process_environment_alerts(new_data: dict):
    old = previous_sensor_data

    if not old:
        if new_data["soil_moisture"] < MOISTURE_START_THRESHOLD:
            add_alert(
                "warning",
                "Low soil moisture",
                f"Soil moisture is {new_data['soil_moisture']:.1f}%. Irrigation may be required.",
                key="low_soil_moisture",
            )

        if new_data["temperature"] > HIGH_TEMPERATURE:
            add_alert(
                "warning",
                "High temperature",
                f"Temperature is {new_data['temperature']:.1f}°C.",
                key="high_temperature",
            )

        if new_data["humidity"] < LOW_HUMIDITY:
            add_alert(
                "warning",
                "Low humidity",
                f"Humidity is {new_data['humidity']:.1f}%.",
                key="low_humidity",
            )

        if new_data["ph"] < PH_LOW or new_data["ph"] > PH_HIGH:
            add_alert(
                "warning",
                "Abnormal soil pH",
                f"Soil pH is {new_data['ph']:.1f}.",
                key="abnormal_ph",
            )
        return

    if abs(new_data["soil_moisture"] - old["soil_moisture"]) >= 5:
        direction = (
            "decreased"
            if new_data["soil_moisture"] < old["soil_moisture"]
            else "increased"
        )
        add_alert(
            "info",
            "Soil moisture changed",
            f"Soil moisture {direction} from "
            f"{old['soil_moisture']:.1f}% to "
            f"{new_data['soil_moisture']:.1f}%.",
            key="soil_moisture_change",
            cooldown_minutes=5,
        )

    if abs(new_data["temperature"] - old["temperature"]) >= 3:
        direction = (
            "increased"
            if new_data["temperature"] > old["temperature"]
            else "decreased"
        )
        add_alert(
            "warning" if new_data["temperature"] > HIGH_TEMPERATURE else "info",
            "Temperature changed",
            f"Temperature {direction} from "
            f"{old['temperature']:.1f}°C to "
            f"{new_data['temperature']:.1f}°C.",
            key="temperature_change",
            cooldown_minutes=5,
        )

    if abs(new_data["humidity"] - old["humidity"]) >= 10:
        add_alert(
            "info",
            "Humidity changed",
            f"Humidity changed from {old['humidity']:.1f}% "
            f"to {new_data['humidity']:.1f}%.",
            key="humidity_change",
            cooldown_minutes=5,
        )

    if abs(new_data["ph"] - old["ph"]) >= 0.5:
        add_alert(
            "warning",
            "Soil pH changed",
            f"Soil pH changed from {old['ph']:.1f} "
            f"to {new_data['ph']:.1f}.",
            key="ph_change",
            cooldown_minutes=10,
        )

    old_light = float(old.get("light", 0))
    if abs(new_data["light"] - old_light) >= max(100, old_light * 0.35):
        add_alert(
            "info",
            "Light intensity changed",
            f"Light changed from {old_light:.1f} "
            f"to {new_data['light']:.1f}.",
            key="light_change",
            cooldown_minutes=5,
        )

    if new_data["soil_moisture"] < MOISTURE_START_THRESHOLD:
        add_alert(
            "warning",
            "Low soil moisture",
            f"Soil moisture is {new_data['soil_moisture']:.1f}%. "
            f"Irrigation may be required.",
            key="low_soil_moisture",
        )

    if new_data["temperature"] > HIGH_TEMPERATURE:
        add_alert(
            "warning",
            "High temperature",
            f"Temperature is {new_data['temperature']:.1f}°C.",
            key="high_temperature",
        )

    if new_data["humidity"] < LOW_HUMIDITY:
        add_alert(
            "warning",
            "Low humidity",
            f"Humidity is {new_data['humidity']:.1f}%.",
            key="low_humidity",
        )

    if new_data["ph"] < PH_LOW or new_data["ph"] > PH_HIGH:
        add_alert(
            "warning",
            "Abnormal soil pH",
            f"Soil pH is {new_data['ph']:.1f}. "
            f"Check soil condition before fertilizer application.",
            key="abnormal_ph",
        )

    if bool(new_data["rain"]) != bool(old.get("rain", False)):
        if new_data["rain"]:
            add_alert(
                "info",
                "Rain detected",
                "Rain detected. Automatic irrigation will be blocked.",
                key="rain_state",
                cooldown_minutes=2,
            )
        else:
            add_alert(
                "info",
                "Rain stopped",
                "Rain is no longer detected.",
                key="rain_state",
                cooldown_minutes=2,
            )


def parse_bool(value, default=False):
    """Safely convert sensor/API boolean values without treating "false" as True."""
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    text = str(value).strip().lower()
    if text in {"true", "1", "yes", "y", "on", "active", "rain", "raining"}:
        return True
    if text in {"false", "0", "no", "n", "off", "inactive", "none", "null", ""}:
        return False
    return default


def sensor_rain_fallback_prediction(temperature, humidity, light):
    """Threshold-based fallback using temperature, humidity and light only."""
    score = 0

    # Humidity is the strongest fallback signal.
    if humidity >= 90:
        score += 55
    elif humidity >= 80:
        score += 40
    elif humidity >= 70:
        score += 25
    elif humidity >= 60:
        score += 10

    # Moderate temperatures are more supportive of rain.
    if 18 <= temperature <= 30:
        score += 20
    elif 15 <= temperature <= 35:
        score += 10

    # Low light can indicate heavy cloud cover.
    if light <= 100:
        score += 25
    elif light <= 300:
        score += 15
    elif light <= 800:
        score += 5

    # Extra evidence when humidity is high and light is low.
    if humidity >= 80 and light <= 300:
        score += 10

    score = max(0, min(95, score))

    if score >= 70:
        label = "High rain possibility"
    elif score >= 50:
        label = "Moderate rain possibility"
    elif score >= 30:
        label = "Low rain possibility"
    else:
        label = "Very low rain possibility"

    return score, label


def update_sensor_data(data: dict, source: str = "sensor"):
    global latest_sensor_data, previous_sensor_data

    previous_sensor_data = latest_sensor_data.copy()

    latest_sensor_data = {
        "soil_moisture": float(data["soil_moisture"]),
        "temperature": float(data["temperature"]),
        "humidity": float(data["humidity"]),
        "ph": float(data["ph"]),
        "light": float(data["light"]),
        "rain": parse_bool(data.get("rain", False), default=False),
        "water_level": data.get("water_level"),
        "pump_status": data.get("pump_status"),
        "fertilizer_level": data.get("fertilizer_level"),
        "timestamp": data.get("timestamp", now_iso()),
        "source": source,
    }

    sensor_history.insert(0, latest_sensor_data.copy())
    del sensor_history[HISTORY_LIMIT:]

    process_environment_alerts(latest_sensor_data)
    run_automatic_irrigation()


# ============================================================
# AI
# ============================================================
def current_ai_analysis():
    if not latest_sensor_data:
        return {
            "ready": False,
            "message": "Waiting for sensor data.",
        }

    s = latest_sensor_data
    moisture = float(s["soil_moisture"])
    temperature = float(s["temperature"])
    humidity = float(s["humidity"])
    ph = float(s["ph"])
    light = float(s["light"])
    rain = bool(s["rain"])

    # PRIMARY: live weather forecast.
    # FALLBACK: deterministic thresholds using temperature + humidity + light.
    try:
        weather_data = get_weather_forecast()
    except Exception:
        weather_data = {}

    weather_rain_probability, weather_available = weather_rain_expected_soon(
        weather_data
    )

    sensor_rain_score, sensor_rain_label = sensor_rain_fallback_prediction(
        temperature, humidity, light
    )

    if weather_available:
        rain_score = round(weather_rain_probability)
        rain_source = "weather_forecast"

        if rain:
            rain_label = "Rain detected now"
        elif rain_score >= 70:
            rain_label = "High rain possibility"
        elif rain_score >= 50:
            rain_label = "Moderate rain possibility"
        elif rain_score >= 30:
            rain_label = "Low rain possibility"
        else:
            rain_label = "Low rain possibility"
    else:
        rain_score = sensor_rain_score
        rain_source = "sensor_fallback"
        rain_label = sensor_rain_label

    water_score = 0

    if moisture < 25:
        water_score += 60
    elif moisture < 35:
        water_score += 45
    elif moisture < 45:
        water_score += 25

    if temperature > 35:
        water_score += 20
    elif temperature > 30:
        water_score += 10

    if humidity < 35:
        water_score += 15
    elif humidity < 50:
        water_score += 8

    if light > 800:
        water_score += 5

    if rain:
        water_score -= 60

    water_score = max(0, min(100, water_score))

    if water_score >= 70:
        water_label = "High water need"
    elif water_score >= 40:
        water_label = "Moderate water need"
    else:
        water_label = "Low water need"

    if ph < PH_LOW:
        fertilizer = "Agricultural lime / pH correction"
        fertilizer_reason = "Soil pH is acidic."
        fertilizer_urgency = "High"
    elif ph > PH_HIGH:
        fertilizer = "Avoid additional alkaline inputs"
        fertilizer_reason = "Soil pH is high."
        fertilizer_urgency = "Medium"
    elif moisture < 25 and temperature > 35:
        fertilizer = "Delay fertilizer application"
        fertilizer_reason = "Soil is very dry and temperature is high."
        fertilizer_urgency = "Low"
    elif moisture < 35:
        fertilizer = "Balanced fertilizer"
        fertilizer_reason = (
            "Soil moisture is low; irrigate before fertilizer application."
        )
        fertilizer_urgency = "Medium"
    else:
        fertilizer = "Routine crop-specific fertilizer"
        fertilizer_reason = (
            "Current sensor conditions do not indicate an urgent correction."
        )
        fertilizer_urgency = "Low"

    # Reuse the forecast result already fetched above.

    should_start_pump = (
        AUTO_IRRIGATION_ENABLED
        and not rain
        and water_score >= 70
        and moisture <= MOISTURE_START_THRESHOLD
        and weather_rain_probability < 60
    )

    if rain:
        irrigation_decision = "DO NOT IRRIGATE"
        irrigation_reason = "Rain is detected."
    elif (
        weather_rain_probability >= 60
        and moisture <= MOISTURE_START_THRESHOLD
    ):
        irrigation_decision = "POSTPONE IRRIGATION"
        irrigation_reason = (
            f"Rain probability is about {weather_rain_probability}%."
        )
    elif should_start_pump:
        irrigation_decision = "START PUMP"
        irrigation_reason = (
            "Soil moisture is low, water need is high, "
            "and significant rain is not expected."
        )
    elif moisture < 45:
        irrigation_decision = "MONITOR / PREPARE"
        irrigation_reason = (
            "Soil moisture is below the preferred range."
        )
    else:
        irrigation_decision = "NO IRRIGATION"
        irrigation_reason = "Current soil moisture is acceptable."

    confidence = round(
        min(
            98,
            max(
                60,
                60
                + (20 if moisture < 35 else 0)
                + (10 if humidity > 70 else 0)
                + (8 if rain else 0),
            ),
        )
    )

    return {
        "ready": True,
        "timestamp": now_iso(),
        "rain_prediction": {
            "probability_percent": rain_score,
            "label": rain_label,
            "rain_detected": rain,
            "source": rain_source,
            "forecast_available": weather_available,
            "fallback_threshold": 60,
            "sensor_fallback_probability": sensor_rain_score,
        },
        "weather_forecast": {
            "rain_probability": weather_rain_probability,
            "available": weather_available,
            "source": "Open-Meteo" if weather_available else "Unavailable - sensor fallback",
        },
        "water_need": {
            "score_percent": water_score,
            "label": water_label,
            "recommended_action": irrigation_decision,
        },
        "fertilizer": {
            "recommendation": fertilizer,
            "reason": fertilizer_reason,
            "urgency": fertilizer_urgency,
            "note": (
                "For precise fertilizer dosing, add soil N/P/K "
                "values or a laboratory soil test."
            ),
        },
        "pump": {
            "auto_mode": AUTO_IRRIGATION_ENABLED,
            "should_start": should_start_pump,
            "running": pump_state["running"],
            "hardware_enabled": PUMP_HARDWARE_ENABLED,
        },
        "decision": {
            "title": irrigation_decision,
            "confidence_percent": confidence,
            "reason": irrigation_reason,
        },
        "inputs": {
            "soil_moisture": moisture,
            "temperature": temperature,
            "humidity": humidity,
            "ph": ph,
            "light": light,
            "rain": rain,
            "water_level": s.get("water_level"),
            "pump_status": s.get("pump_status"),
            "fertilizer_level": s.get("fertilizer_level"),
        },
    }


def run_automatic_irrigation():
    if not latest_sensor_data or not AUTO_IRRIGATION_ENABLED:
        return

    analysis = current_ai_analysis()

    if not analysis.get("ready"):
        return

    should_start = analysis["pump"]["should_start"]

    if should_start and not pump_state["running"]:
        pump_state["running"] = True
        pump_state["last_action"] = "AUTO_START"
        pump_state["last_action_time"] = now_iso()

        set_pump_hardware(True)

        irrigation_history.insert(
            0,
            {
                "timestamp": now_iso(),
                "action": "START",
                "duration_minutes": 5,
                "source": "AI_AUTO",
                "reason": analysis["decision"]["reason"],
            },
        )

        add_alert(
            "warning",
            "AI started irrigation",
            "Automatic irrigation was triggered because water need is high, "
            "soil moisture is low, and significant rain is not expected.",
            key="pump_auto_start",
            cooldown_minutes=2,
        )

    elif not should_start and pump_state["running"]:
        pump_state["running"] = False
        pump_state["last_action"] = "AUTO_STOP"
        pump_state["last_action_time"] = now_iso()

        set_pump_hardware(False)

        irrigation_history.insert(
            0,
            {
                "timestamp": now_iso(),
                "action": "STOP",
                "duration_minutes": 0,
                "source": "AI_AUTO",
                "reason": analysis["decision"]["reason"],
            },
        )

        add_alert(
            "success",
            "AI stopped irrigation",
            "Automatic irrigation was stopped because watering is no longer "
            "required or rain is expected.",
            key="pump_auto_stop",
            cooldown_minutes=2,
        )


# ============================================================
# THINGSPEAK
# ============================================================
def fetch_thingspeak_latest():
    url = (
        f"https://api.thingspeak.com/channels/"
        f"{THINGSPEAK_CHANNEL_ID}/feeds/last.json?"
        f"api_key={urllib.parse.quote(THINGSPEAK_READ_API_KEY)}"
    )

    request = urllib.request.Request(
        url,
        headers={"User-Agent": "SmartFarm/2.1"},
    )

    with urllib.request.urlopen(request, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def parse_thingspeak_feed(feed: dict):
    def number(key, default=0.0):
        value = feed.get(key)
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    # Current SmartFarm ThingSpeak field mapping:
    # field1 = Temperature
    # field2 = Humidity
    # field3 = Soil Moisture
    # field4 = Water Level
    # field5 = Pump Status
    # field6 = Light Intensity
    # field7 = pH Value
    # field8 = Fertilizer Level

    return {
        "temperature": number("field1"),
        "humidity": number("field2"),
        "soil_moisture": number("field3"),
        "water_level": number("field4"),
        "pump_status": number("field5"),
        "light": number("field6"),
        "ph": number("field7"),
        "fertilizer_level": number("field8"),
        # Rain is not currently one of the 8 ThingSpeak fields.
        # Weather rain is used as an additional signal.
        "rain": bool(
            (get_weather_forecast().get("current", {}).get("rain") or 0) > 0
        ),
        "timestamp": feed.get("created_at") or now_iso(),
    }


async def thingspeak_poll_loop():
    await asyncio.sleep(2)

    while True:
        try:
            feed = await asyncio.to_thread(fetch_thingspeak_latest)

            entry_id = feed.get("entry_id")
            created_at = feed.get("created_at")

            thingspeak_state["last_poll"] = now_iso()
            thingspeak_state["connected"] = True
            thingspeak_state["error"] = None

            if (
                entry_id is not None
                and (
                    entry_id != thingspeak_state["last_entry_id"]
                    or created_at != thingspeak_state["last_created_at"]
                )
            ):
                sensor_data = await asyncio.to_thread(
                    parse_thingspeak_feed, feed
                )

                thingspeak_state["last_entry_id"] = entry_id
                thingspeak_state["last_created_at"] = created_at

                update_sensor_data(sensor_data, source="ThingSpeak")

        except Exception as e:
            thingspeak_state["connected"] = False
            thingspeak_state["error"] = str(e)
            print("ThingSpeak polling error:", e)

        await asyncio.sleep(THINGSPEAK_POLL_SECONDS)


# ============================================================
# FARMER LOGIN PAGE
# ============================================================
LOGIN_PAGE = r"""
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SmartFarm Farmer Login</title>
<style>
*{box-sizing:border-box}
body{
    margin:0;min-height:100vh;display:flex;align-items:center;
    justify-content:center;font-family:Arial,Helvetica,sans-serif;
    background:linear-gradient(135deg,#10291d,#1f6b45)
}
.card{
    width:min(420px,92vw);background:#fff;border-radius:22px;
    padding:34px;box-shadow:0 20px 60px rgba(0,0,0,.25)
}
.logo{
    width:64px;height:64px;border-radius:18px;display:flex;
    align-items:center;justify-content:center;background:#27ae60;
    color:#fff;font-size:30px;margin-bottom:18px
}
h1{margin:0 0 8px;color:#173b28}
p{color:#68756d}
label{display:block;margin:18px 0 7px;font-weight:600;color:#31463a}
input{
    width:100%;padding:13px 14px;border:1px solid #d3ddd7;
    border-radius:10px;font-size:16px;outline:none
}
input:focus{
    border-color:#27ae60;box-shadow:0 0 0 3px rgba(39,174,96,.12)
}
button{
    width:100%;margin-top:22px;padding:14px;border:0;border-radius:10px;
    background:#27ae60;color:#fff;font-size:16px;font-weight:700;cursor:pointer
}
button:hover{background:#219653}
button:disabled{opacity:.6;cursor:not-allowed}
#message{margin-top:14px;min-height:22px;font-weight:600}
.ok{color:#218838}.error{color:#c62828}
.small{font-size:12px;margin-top:18px}
</style>
</head>
<body>
<div class="card">
    <div class="logo">🌱</div>
    <h1>SmartFarm</h1>
    <p>Farmer Portal — sign in to manage your farm.</p>

    <form id="loginForm">
        <label>Username</label>
        <input id="username" autocomplete="username" required>

        <label>Password</label>
        <input id="password" type="password"
               autocomplete="current-password" required>

        <button id="loginButton" type="submit">Farmer Login</button>
        <div id="message"></div>
    </form>

    <p class="small">SmartFarm prototype • Coimbatore</p>
</div>

<script>
const form = document.getElementById("loginForm");
const button = document.getElementById("loginButton");
const message = document.getElementById("message");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    button.disabled = true;
    message.className = "";
    message.textContent = "Signing in...";

    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                username: document.getElementById("username").value.trim(),
                password: document.getElementById("password").value
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.detail || data.message || "Login failed");
        }

        localStorage.setItem("smartfarm_token", data.token);
        localStorage.setItem("smartfarm_user", JSON.stringify(data.user));

        message.className = "ok";
        message.textContent =
            "Login successful. Opening dashboard...";

        // Existing dashboard is currently served on port 5177.
        setTimeout(() => {
            window.location.href = "http://localhost:5177";
        }, 500);

    } catch (error) {
        message.className = "error";
        message.textContent = error.message;
        button.disabled = false;
    }
});
</script>
</body>
</html>
"""


@app.get("/login", response_class=HTMLResponse)
def login_page():
    return LOGIN_PAGE


@app.post("/api/auth/login")
def farmer_login(request: LoginRequest):
    if (
        request.username != FARMER_USERNAME
        or request.password != FARMER_PASSWORD
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password.",
        )

    token = secrets.token_urlsafe(32)

    active_tokens[token] = {
        "username": request.username,
        "role": "farmer",
        "login_time": now_iso(),
    }

    return {
        "success": True,
        "token": token,
        "user": {
            "username": request.username,
            "role": "farmer",
        },
    }


@app.get("/api/auth/me")
def auth_me(token: Optional[str] = None):
    if not token or token not in active_tokens:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated.",
        )

    return {
        "success": True,
        "user": active_tokens[token],
    }


@app.post("/api/auth/logout")
def farmer_logout(token: Optional[str] = None):
    if token:
        active_tokens.pop(token, None)

    return {"success": True}


# ============================================================
# ROOT / STATUS
# ============================================================
@app.get("/")
def root():
    return {
        "message": "SmartFarm Backend is Running",
        "version": "2.1.0",
        "login": "/login",
    }


@app.get("/api/status")
def system_status():
    return {
        "success": True,
        "backend": "online",
        "sensor_connected": bool(latest_sensor_data),
        "last_update": latest_sensor_data.get("timestamp"),
        "history_count": len(sensor_history),
        "pump": pump_state,
        "ai_enabled": True,
        "auto_irrigation_enabled": AUTO_IRRIGATION_ENABLED,
        "pump_hardware_enabled": PUMP_HARDWARE_ENABLED,
        "thingspeak": thingspeak_state,
        "weather": {
            "location": WEATHER_LOCATION_NAME,
            "available": weather_cache["data"] is not None,
            "updated_at": (
                weather_cache["data"].get("updated_at")
                if weather_cache["data"]
                else None
            ),
        },
    }


# ============================================================
# SENSOR API
# ============================================================
@app.post("/api/sensors")
def receive_sensor_data(data: SensorData):
    update_sensor_data(
        {
            "soil_moisture": data.soil_moisture,
            "temperature": data.temperature,
            "humidity": data.humidity,
            "ph": data.ph,
            "light": data.light,
            "rain": data.rain,
            "timestamp": now_iso(),
        },
        source="ESP32",
    )

    return {
        "success": True,
        "data": latest_sensor_data,
        "ai": current_ai_analysis(),
    }


@app.get("/api/sensors")
def get_sensor_data():
    return {
        "success": True,
        "data": latest_sensor_data,
    }


@app.get("/api/sensors/history")
def get_sensor_history():
    return {
        "success": True,
        "count": len(sensor_history),
        "data": sensor_history,
    }


# ============================================================
# WEATHER API
# ============================================================
@app.post("/api/location")
def save_browser_location(request: LocationRequest):
    latitude = request.latitude
    longitude = request.longitude
    accuracy_m = request.accuracy_m
    if not (-90 <= float(latitude) <= 90 and -180 <= float(longitude) <= 180):
        raise HTTPException(status_code=400, detail="Invalid GPS coordinates.")

    last_browser_location.update({
        "latitude": float(latitude),
        "longitude": float(longitude),
        "accuracy_m": float(accuracy_m or 0),
        "updated_at": now_iso(),
    })

    return {"success": True, "data": last_browser_location.copy()}


@app.get("/api/location")
def get_browser_location():
    return {"success": True, "data": last_browser_location.copy()}


@app.get("/api/weather/forecast")
def weather_forecast(latitude: Optional[float] = None, longitude: Optional[float] = None):
    # Explicit GPS coordinates win. If omitted, use the last browser location.
    if latitude is None:
        latitude = last_browser_location.get("latitude")
    if longitude is None:
        longitude = last_browser_location.get("longitude")

    return {
        "success": True,
        "data": get_weather_forecast(latitude, longitude),
    }


# ============================================================
# AI API
# ============================================================
@app.get("/api/ai/decision")
def ai_decision():
    return {
        "success": True,
        "data": current_ai_analysis(),
    }


@app.get("/api/ai/rain")
def ai_rain_prediction():
    analysis = current_ai_analysis()
    return {
        "success": True,
        "data": analysis.get("rain_prediction", {}),
    }


@app.get("/api/ai/water")
def ai_water_prediction():
    analysis = current_ai_analysis()
    return {
        "success": True,
        "data": analysis.get("water_need", {}),
    }


# ============================================================
# IRRIGATION API
# ============================================================
@app.get("/api/irrigation")
def get_irrigation_status():
    return {
        "success": True,
        "data": pump_state,
    }


@app.get("/api/ai/irrigation")
def irrigation_recommendation():
    analysis = current_ai_analysis()

    if not analysis.get("ready"):
        return {
            "success": False,
            "message": "Waiting for sensor data.",
        }

    return {
        "success": True,
        "data": {
            "recommendation": analysis["decision"],
            "water_need": analysis["water_need"],
            "rain_prediction": analysis["rain_prediction"],
            "weather_forecast": analysis["weather_forecast"],
            "pump": analysis["pump"],
        },
    }


@app.post("/api/irrigation/start")
def start_irrigation(request: IrrigationRequest):
    pump_state["running"] = True
    pump_state["last_action"] = "MANUAL_START"
    pump_state["last_action_time"] = now_iso()

    hardware = set_pump_hardware(True)

    record = {
        "timestamp": now_iso(),
        "action": "START",
        "duration_minutes": request.duration_minutes,
        "source": request.source,
    }

    irrigation_history.insert(0, record)

    add_alert(
        "success",
        "Irrigation started",
        f"Irrigation started for "
        f"{request.duration_minutes:g} minutes ({request.source}).",
        key="manual_start",
        cooldown_minutes=1,
    )

    return {
        "success": True,
        "data": pump_state,
        "hardware": hardware,
    }


@app.post("/api/irrigation/stop")
def stop_irrigation():
    pump_state["running"] = False
    pump_state["last_action"] = "MANUAL_STOP"
    pump_state["last_action_time"] = now_iso()

    hardware = set_pump_hardware(False)

    record = {
        "timestamp": now_iso(),
        "action": "STOP",
        "duration_minutes": 0,
        "source": "manual",
    }

    irrigation_history.insert(0, record)

    add_alert(
        "success",
        "Irrigation stopped",
        "The irrigation pump was stopped.",
        key="manual_stop",
        cooldown_minutes=1,
    )

    return {
        "success": True,
        "data": pump_state,
        "hardware": hardware,
    }


@app.get("/api/irrigation/history")
def get_irrigation_history():
    return {
        "success": True,
        "count": len(irrigation_history),
        "data": irrigation_history[:100],
    }


# ============================================================
# FERTILIZER API
# ============================================================
@app.get("/api/fertilizer/recommendation")
def fertilizer_recommendation():
    analysis = current_ai_analysis()

    if not analysis.get("ready"):
        return {
            "success": False,
            "message": "Waiting for sensor data.",
        }

    return {
        "success": True,
        "data": analysis["fertilizer"],
    }


@app.post("/api/fertilizer/use")
def record_fertilizer(request: FertilizerRequest):
    record = {
        "timestamp": now_iso(),
        "fertilizer": request.fertilizer,
        "amount_kg": request.amount_kg,
        "crop": request.crop,
        "field": request.field,
        "notes": request.notes,
    }

    fertilizer_history.insert(0, record)

    add_alert(
        "info",
        "Fertilizer usage recorded",
        f"{request.amount_kg:g} kg of {request.fertilizer} "
        f"recorded for {request.crop}.",
        key="fertilizer_usage",
        cooldown_minutes=1,
    )

    return {
        "success": True,
        "data": record,
    }


@app.get("/api/fertilizer/usage")
def fertilizer_usage():
    total_kg = sum(item["amount_kg"] for item in fertilizer_history)

    return {
        "success": True,
        "count": len(fertilizer_history),
        "total_kg": total_kg,
        "data": fertilizer_history[:100],
    }


# ============================================================
# ALERT API
# ============================================================
@app.get("/api/alerts")
def get_alerts():
    return {
        "success": True,
        "count": len(alerts),
        "data": alerts[:50],
    }


# ============================================================
# STARTUP
# ============================================================
@app.on_event("startup")
async def startup():
    print("\n========================================")
    print(" SmartFarm API v2.1")
    print(" AI decision engine: READY")
    print(f" Auto irrigation: {AUTO_IRRIGATION_ENABLED}")
    print(f" Pump hardware: {PUMP_HARDWARE_ENABLED}")
    print(f" ThingSpeak channel: {THINGSPEAK_CHANNEL_ID}")
    print(f" Weather location: {WEATHER_LOCATION_NAME}")
    print(" Farmer login: /login")
    print("========================================\n")

    # Runs in the background; it does not block FastAPI.
    asyncio.create_task(thingspeak_poll_loop())
