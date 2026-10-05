import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Bell,
  BellRing,
  Brain,
  CloudRain,
  ChevronDown,
  Droplets,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  Leaf,
  Menu,
  MessageCircle,
  Mic,
  MicOff,
  Moon,
  RefreshCw,
  Send,
  Settings as SettingsIcon,
  Sun,
  LogOut,
  User,
  Thermometer,
  MapPin,
  CloudSun,
  Cloud,
  Waves,
  X,
} from "lucide-react";

const API_BASE = "http://127.0.0.1:8000/api";

const EMPTY_SENSOR = {
  soilMoisture: 0,
  temperature: 0,
  humidity: 0,
  ph: 0,
  light: 0,
  rain: false,
  timestamp: null,
};

const NAV = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["monitoring", "Monitoring", Activity],
  ["ai", "AI Decisions", Brain],
  ["irrigation", "Irrigation", Droplets],
  ["fertilizer", "Fertilizer", FlaskConical],
  ["alerts", "Alerts", Bell],
  ["settings", "Settings", SettingsIcon],
];

async function getJson(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`${path} -> HTTP ${response.status}`);
  }
  return response.json();
}

async function postJson(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${path} -> HTTP ${response.status}`);
  }

  return response.json();
}

function normalizeSensor(data) {
  return {
    soilMoisture: Number(data?.soil_moisture ?? 0),
    temperature: Number(data?.temperature ?? 0),
    humidity: Number(data?.humidity ?? 0),
    ph: Number(data?.ph ?? 0),
    light: Number(data?.light ?? 0),
    waterLevel: Number(data?.water_level ?? data?.waterLevel ?? 0),
    rain: Boolean(data?.rain),
    timestamp: data?.timestamp ?? null,
  };
}

function normalizeWeather(data) {
  if (!data) return null;
  const current = data.current || {};
  const rawForecast = data.forecast || data.daily || [];
  const forecast = rawForecast.map((day) => ({
    ...day,
    day:
      day.day ||
      (day.date
        ? new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, {
            weekday: "short",
          })
        : "Day"),
    max_c: day.max_c ?? day.temperature_max ?? day.temperature_2m_max ?? null,
    min_c: day.min_c ?? day.temperature_min ?? day.temperature_2m_min ?? null,
    rain_probability:
      day.rain_probability ??
      day.precipitation_probability_max ??
      day.precipitation_probability ??
      0,
    precipitation: day.precipitation ?? day.precipitation_sum ?? 0,
    condition: day.condition || day.description || "Unknown",
  }));

  return {
    ...data,
    current: {
      ...current,
      temperature: current.temperature ?? current.temperature_c ?? null,
      temperature_c: current.temperature_c ?? current.temperature ?? null,
      humidity: current.humidity ?? current.relative_humidity ?? current.relative_humidity_2m ?? null,
      condition: current.condition || current.description || "Unknown conditions",
      description: current.description || current.condition || "Unknown conditions",
    },
    forecast,
    daily: forecast,
  };
}

function statusFor(value, low, high) {
  if (value < low) return "Low";
  if (value > high) return "High";
  return "Good";
}

function firstValue(obj, keys, fallback = null) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return fallback;
}

function getFertilizerInfo(fertilizer, fieldAreaHa) {
  const name = firstValue(
    fertilizer,
    ["recommended_fertilizer", "fertilizer", "recommendation", "name", "type"],
    "No specific fertilizer yet"
  );

  const npk = firstValue(
    fertilizer,
    ["npk", "npk_ratio", "npk_value", "ratio"],
    null
  );

  const rate = Number(
    firstValue(
      fertilizer,
      ["rate_kg_per_ha", "recommended_rate_kg_per_ha", "dose_kg_per_ha"],
      0
    )
  );

  const directAmount = Number(
    firstValue(
      fertilizer,
      ["amount_kg", "recommended_amount_kg", "dose_kg", "recommended_kg"],
      0
    )
  );

  const calculatedAmount =
    !directAmount && rate && fieldAreaHa ? rate * Number(fieldAreaHa) : 0;

  const items = firstValue(
    fertilizer,
    ["items", "materials", "fertilizer_items", "required_items"],
    null
  );

  return {
    name,
    npk,
    rate,
    amount: directAmount || calculatedAmount || null,
    items,
  };
}

function getWaterInfo(ai, fieldAreaHa) {
  const water = ai?.water_need || {};

  const directLiters = Number(
    firstValue(
      water,
      ["amount_liters", "recommended_liters", "water_liters", "volume_liters"],
      0
    )
  );

  const litersPerHa = Number(
    firstValue(
      water,
      ["liters_per_ha", "rate_liters_per_ha", "water_rate_l_per_ha"],
      0
    )
  );

  const calculated =
    !directLiters && litersPerHa && fieldAreaHa
      ? litersPerHa * Number(fieldAreaHa)
      : 0;

  return {
    amount: directLiters || calculated || null,
    litersPerHa,
  };
}


function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("smartfarm_theme") === "dark");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("Please enter your username and password.");
      return;
    }

    setLoading(true);

    try {
      const result = await postJson("/auth/login", {
        username: username.trim(),
        password,
      });

      if (!result.success || !result.token) {
        throw new Error(result.message || "Login failed.");
      }

      if (remember) {
        localStorage.setItem("smartfarm_token", result.token);
        localStorage.setItem(
          "smartfarm_user",
          JSON.stringify(result.user || { username, role: "farmer" })
        );
      } else {
        sessionStorage.setItem("smartfarm_token", result.token);
        sessionStorage.setItem(
          "smartfarm_user",
          JSON.stringify(result.user || { username, role: "farmer" })
        );
      }

      onLogin(result.user || { username, role: "farmer" });
    } catch (e) {
      setError(
        e.message?.includes("401")
          ? "Invalid username or password."
          : e.message || "Unable to connect to SmartFarm."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={darkMode ? "login-shell login-dark" : "login-shell"}
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: darkMode
          ? "linear-gradient(135deg, #07130d 0%, #0b2115 48%, #102d1c 100%)"
          : "linear-gradient(135deg, #edf8f0 0%, #dff2e5 48%, #ccebd7 100%)",
        padding: 24,
        fontFamily: "inherit",
        position: "relative",
      }}
    >
      <button
        type="button"
        onClick={() => {
          const next = !darkMode;
          setDarkMode(next);
          localStorage.setItem("smartfarm_theme", next ? "dark" : "light");
        }}
        aria-label="Toggle theme"
        style={{
          position: "absolute",
          top: 22,
          right: 22,
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,.35)",
          background: darkMode ? "#173525" : "#ffffff",
          color: darkMode ? "#f5c542" : "#14532d",
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          boxShadow: "0 8px 25px rgba(0,0,0,.12)",
        }}
      >
        {darkMode ? <Sun size={19} /> : <Moon size={19} />}
      </button>

      <div
        style={{
          width: "min(430px, 100%)",
          background: darkMode ? "#10251a" : "#fff",
          border: darkMode ? "1px solid #244a31" : "1px solid #dce9df",
          borderRadius: 24,
          padding: 34,
          boxShadow: "0 24px 70px rgba(31, 78, 48, .16)",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            background: "#16a34a",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 18,
          }}
        >
          <Leaf size={31} />
        </div>

        <h1 style={{ margin: 0, fontSize: 30, color: darkMode ? "#ecfdf3" : "#173b28" }}>
          Welcome to SmartFarm
        </h1>
        <p style={{ margin: "8px 0 26px", color: darkMode ? "#a8c5b1" : "#6b7b70" }}>
          Sign in to manage your farm, irrigation and AI decisions.
        </p>

        <form onSubmit={submit}>
          <label
            style={{
              display: "block",
              fontWeight: 650,
              marginBottom: 7,
              color: "#31463a",
            }}
          >
            Username
          </label>

          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            autoComplete="username"
            style={{
              width: "100%",
              padding: "13px 14px",
              border: "1px solid #d5e1d8",
              borderRadius: 11,
              fontSize: 15,
              outline: "none",
              boxSizing: "border-box",
            }}
          />

          <label
            style={{
              display: "block",
              fontWeight: 650,
              margin: "18px 0 7px",
              color: "#31463a",
            }}
          >
            Password
          </label>

          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              style={{
                width: "100%",
                padding: "13px 48px 13px 14px",
                border: "1px solid #d5e1d8",
                borderRadius: 11,
                fontSize: 15,
                outline: "none",
                boxSizing: "border-box",
              }}
            />

            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              style={{
                position: "absolute",
                right: 8,
                top: 7,
                border: 0,
                background: "transparent",
                cursor: "pointer",
                padding: 8,
                color: "#557060",
              }}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 17,
              color: "#52645a",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember me
          </label>

          {error && (
            <div
              style={{
                marginTop: 16,
                padding: "11px 13px",
                borderRadius: 10,
                background: "#fff1f2",
                color: "#b91c1c",
                fontSize: 14,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              marginTop: 22,
              padding: 14,
              border: 0,
              borderRadius: 11,
              background: loading ? "#83c99c" : "#16a34a",
              color: "#fff",
              fontSize: 16,
              fontWeight: 700,
              cursor: loading ? "wait" : "pointer",
            }}
          >
            {loading ? "Signing in..." : "Sign in as Farmer"}
          </button>
        </form>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 7,
            marginTop: 22,
            color: "#819087",
            fontSize: 12,
          }}
        >
          <Leaf size={14} />
          SmartFarm • AI Agriculture
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("smartfarm_theme") === "dark");

  const [authUser, setAuthUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [farmOpen, setFarmOpen] = useState(false);
  const [selectedFarm, setSelectedFarm] = useState("Farm Alpha");

  const [sensor, setSensor] = useState(EMPTY_SENSOR);
  const [weather, setWeather] = useState(null);
  const [location, setLocation] = useState({
    latitude: null,
    longitude: null,
    accuracy_m: null,
    source: "waiting",
  });
  const [ai, setAi] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [fertilizer, setFertilizer] = useState(null);
  const [pump, setPump] = useState({
    running: false,
    mode: "AUTO",
    hardware_enabled: false,
  });

  const [history, setHistory] = useState([]);
  const [irrigationHistory, setIrrigationHistory] = useState([]);
  const [fertilizerUsage, setFertilizerUsage] = useState({
    count: 0,
    total_kg: 0,
    data: [],
  });

  const [backendOnline, setBackendOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [autoIrrigation, setAutoIrrigation] = useState(true);
  const [refreshSeconds, setRefreshSeconds] = useState(3);

  // These settings are used by the assistant when the backend supplies
  // fertilizer rates or water rates.
  const [crop, setCrop] = useState("General");
  const [fieldAreaHa, setFieldAreaHa] = useState(1);

  const [fertForm, setFertForm] = useState({
    fertilizer: "NPK 10-10-10",
    amount_kg: 1,
    crop: "General",
    field: "Farm Alpha",
    notes: "",
  });

  const [chatOpen, setChatOpen] = useState(false);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([
    {
      role: "assistant",
      text:
        "Hello! I’m your SmartFarm Assistant. I can read the current farm data and explain water needs, rain risk, pump actions, fertilizer recommendations, NPK and alerts.",
    },
  ]);

  const notifiedRef = useRef(new Set());

  useEffect(() => {
    localStorage.setItem("smartfarm_theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const handleLogin = useCallback((user) => {
    setAuthUser(user);
    setAuthChecking(false);
    setError("");
  }, []);

  const logout = useCallback(async () => {
    const token =
      localStorage.getItem("smartfarm_token") ||
      sessionStorage.getItem("smartfarm_token");

    try {
      if (token) {
        await fetch(
          `${API_BASE}/auth/logout?token=${encodeURIComponent(token)}`,
          { method: "POST" }
        );
      }
    } catch {
      // Local logout should still work if the backend is unavailable.
    }

    localStorage.removeItem("smartfarm_token");
    localStorage.removeItem("smartfarm_user");
    sessionStorage.removeItem("smartfarm_token");
    sessionStorage.removeItem("smartfarm_user");

    setAuthUser(null);
    setProfileOpen(false);
    setFarmOpen(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkLogin = async () => {
      const token =
        localStorage.getItem("smartfarm_token") ||
        sessionStorage.getItem("smartfarm_token");

      if (!token) {
        if (!cancelled) {
          setAuthChecking(false);
          setAuthUser(null);
        }
        return;
      }

      try {
        const response = await getJson(
          `/auth/me?token=${encodeURIComponent(token)}`
        );

        if (!cancelled && response?.success) {
          setAuthUser(response.user);
        } else if (!cancelled) {
          setAuthUser(null);
        }
      } catch {
        localStorage.removeItem("smartfarm_token");
        localStorage.removeItem("smartfarm_user");
        sessionStorage.removeItem("smartfarm_token");
        sessionStorage.removeItem("smartfarm_user");

        if (!cancelled) {
          setAuthUser(null);
        }
      } finally {
        if (!cancelled) {
          setAuthChecking(false);
        }
      }
    };

    checkLogin();

    return () => {
      cancelled = true;
    };
  }, []);

  const loadCore = useCallback(async () => {
    setError("");

    const results = await Promise.allSettled([
      getJson("/sensors"),
      getJson("/ai/decision"),
      getJson("/alerts"),
      getJson("/fertilizer/recommendation"),
      getJson("/irrigation"),
    ]);

    const [s, a, al, f, p] = results;
    let online = false;

    if (s.status === "fulfilled" && s.value?.success) {
      setSensor(normalizeSensor(s.value.data));
      online = true;
    }

    if (a.status === "fulfilled" && a.value?.success) {
      setAi(a.value.data);
    }

    if (al.status === "fulfilled" && al.value?.success) {
      setAlerts(al.value.data || []);
    }

    if (f.status === "fulfilled" && f.value?.success) {
      setFertilizer(f.value.data);
    }

    if (p.status === "fulfilled" && p.value?.success) {
      setPump(p.value.data);
    }


    setBackendOnline(online);

    if (!online) {
      setError("Sensor API is not responding. Check FastAPI on port 8000.");
    }
  }, []);

  const loadWeather = useCallback(async (coords = null) => {
    try {
      const query = coords
        ? `?latitude=${encodeURIComponent(coords.latitude)}&longitude=${encodeURIComponent(coords.longitude)}`
        : "";
      const r = await getJson(`/weather/forecast${query}`);
      if (r?.success) setWeather(normalizeWeather(r.data || null));
    } catch {
      // Weather is supplemental. AI will use the sensor fallback when this fails.
    }
  }, []);

  const updateBrowserLocation = useCallback((position) => {
    const coords = {
      latitude: Number(position.coords.latitude),
      longitude: Number(position.coords.longitude),
      accuracy_m: Number(position.coords.accuracy || 0),
    };

    setLocation({ ...coords, source: "browser_geolocation" });

    // Store the live location in the backend too.
    postJson("/location", coords).catch(() => {});
    loadWeather(coords);
  }, [loadWeather]);

  const loadHistory = useCallback(async () => {
    try {
      const r = await getJson("/sensors/history");
      if (r.success) {
        setHistory(r.data || []);
      }
    } catch (e) {
      setError(`Sensor history: ${e.message}`);
    }
  }, []);

  const loadIrrigationHistory = useCallback(async () => {
    try {
      const r = await getJson("/irrigation/history");
      if (r.success) {
        setIrrigationHistory(r.data || []);
      }
    } catch (e) {
      setError(`Irrigation history: ${e.message}`);
    }
  }, []);

  const loadFertilizerUsage = useCallback(async () => {
    try {
      const r = await getJson("/fertilizer/usage");
      if (r.success) {
        setFertilizerUsage({
          count: r.count || 0,
          total_kg: r.total_kg || 0,
          data: r.data || [],
        });
      }
    } catch (e) {
      setError(`Fertilizer usage: ${e.message}`);
    }
  }, []);

  useEffect(() => {
    if (!authUser) return undefined;

    loadCore();

    const id = setInterval(loadCore, refreshSeconds * 1000);

    return () => clearInterval(id);
  }, [loadCore, refreshSeconds, authUser]);

  useEffect(() => {
    if (!authUser) return undefined;

    let watchId = null;
    let fallbackTimer = null;

    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        updateBrowserLocation,
        () => {
          // Permission denied/unavailable: safely use backend fallback (Coimbatore).
          setLocation((current) => ({
            ...current,
            source: "fallback",
          }));
          loadWeather();
        },
        { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 }
      );
    } else {
      setLocation((current) => ({ ...current, source: "fallback" }));
      loadWeather();
    }

    // Weather is refreshed independently from the fast sensor polling.
    fallbackTimer = setInterval(() => loadWeather(), 60 * 1000);

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (fallbackTimer) clearInterval(fallbackTimer);
    };
  }, [loadWeather, updateBrowserLocation, authUser]);

  useEffect(() => {
    loadHistory();
    loadIrrigationHistory();
    loadFertilizerUsage();
  }, [loadHistory, loadIrrigationHistory, loadFertilizerUsage]);

  // Automatic browser notifications from backend alerts and important
  // live sensor conditions.
  useEffect(() => {
    if (!("Notification" in window)) return;

    const notify = (title, body, tag) => {
      if (Notification.permission !== "granted") return;

      new Notification(title, {
        body,
        tag,
      });
    };

    alerts.slice(0, 10).forEach((a) => {
      const signature = String(
        a.id ?? `${a.timestamp || ""}-${a.title || ""}-${a.message || ""}`
      );

      if (!notifiedRef.current.has(signature)) {
        notifiedRef.current.add(signature);

        notify(
          `SmartFarm: ${a.title || "Farm Alert"}`,
          a.message || "A new farm event needs your attention.",
          `smartfarm-${signature}`
        );
      }
    });

    const moisture = Number(sensor.soilMoisture);

    if (moisture > 0 && moisture < 30 && !sensor.rain) {
      const signature = `dry-${Math.floor(moisture / 2)}`;

      if (!notifiedRef.current.has(signature)) {
        notifiedRef.current.add(signature);

        notify(
          "SmartFarm: Low Soil Moisture",
          `Soil moisture is ${moisture.toFixed(1)}%. Water need is ${waterNeed}%.`,
          signature
        );
      }
    }

    if (sensor.rain) {
      const signature = "rain-detected";

      if (!notifiedRef.current.has(signature)) {
        notifiedRef.current.add(signature);

        notify(
          "SmartFarm: Rain Detected",
          "Rain is detected. Automatic irrigation should remain blocked.",
          signature
        );
      }
    }
  }, [alerts, sensor.soilMoisture, sensor.rain]);

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      setError("This browser does not support notifications.");
      return;
    }

    const permission = await Notification.requestPermission();

    if (permission === "granted") {
      new Notification("SmartFarm Notifications Enabled", {
        body: "Important farm alerts will now appear as browser notifications.",
      });
    }
  };

  const startPump = async (source = "dashboard_manual") => {
    setBusy(true);

    try {
      const r = await postJson("/irrigation/start", {
        duration_minutes: 5,
        source,
      });

      if (r.success) {
        setPump(r.data);
      }

      await Promise.all([loadCore(), loadIrrigationHistory()]);
      return r;
    } catch (e) {
      setError(`Start pump: ${e.message}`);
      return { success: false, error: e.message };
    } finally {
      setBusy(false);
    }
  };

  const stopPump = async (source = "dashboard_manual") => {
    setBusy(true);

    try {
      const r = await postJson("/irrigation/stop", { source });

      if (r.success) {
        setPump(r.data);
      }

      await Promise.all([loadCore(), loadIrrigationHistory()]);
      return r;
    } catch (e) {
      setError(`Stop pump: ${e.message}`);
      return { success: false, error: e.message };
    } finally {
      setBusy(false);
    }
  };

  const recordFertilizer = async (e) => {
    e.preventDefault();
    setBusy(true);

    try {
      const r = await postJson("/fertilizer/use", {
        ...fertForm,
        amount_kg: Number(fertForm.amount_kg),
      });

      if (!r.success) {
        throw new Error(r.message || "Request failed");
      }

      await loadFertilizerUsage();

      setFertForm((x) => ({
        ...x,
        amount_kg: 1,
        notes: "",
      }));
    } catch (e) {
      setError(`Record fertilizer: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const title =
    NAV.find(([key]) => key === page)?.[1] || "Dashboard";

  const rainProbability = Number(
    ai?.rain_prediction?.probability_percent ?? 0
  );

  const waterNeed = Number(
    ai?.water_need?.score_percent ?? 0
  );

  const aiDecision =
    ai?.decision?.title ?? "WAITING FOR DATA";

  const aiReason =
    ai?.decision?.reason ?? "Waiting for live sensor data.";

  const fertilizerInfo = getFertilizerInfo(
    fertilizer,
    fieldAreaHa
  );

  const waterInfo = getWaterInfo(ai, fieldAreaHa);

  const fetchAgentContext = useCallback(async () => {
    // The assistant deliberately refreshes its own tools instead of relying
    // only on whatever values happen to be visible on the dashboard.
    const [sensorResult, aiResult, weatherResult, fertResult, pumpResult, alertsResult] =
      await Promise.allSettled([
        getJson("/sensors"),
        getJson("/ai/decision"),
        getJson(
          location.latitude != null && location.longitude != null
            ? `/weather/forecast?latitude=${encodeURIComponent(location.latitude)}&longitude=${encodeURIComponent(location.longitude)}`
            : "/weather/forecast"
        ),
        getJson("/fertilizer/recommendation"),
        getJson("/irrigation"),
        getJson("/alerts"),
      ]);

    const freshSensor = sensorResult.status === "fulfilled" && sensorResult.value?.success
      ? normalizeSensor(sensorResult.value.data)
      : sensor;
    const freshAi = aiResult.status === "fulfilled" && aiResult.value?.success
      ? aiResult.value.data
      : ai;
    const freshWeather = weatherResult.status === "fulfilled" && weatherResult.value?.success
      ? weatherResult.value.data
      : weather;
    const freshFertilizer = fertResult.status === "fulfilled" && fertResult.value?.success
      ? fertResult.value.data
      : fertilizer;
    const freshPump = pumpResult.status === "fulfilled" && pumpResult.value?.success
      ? pumpResult.value.data
      : pump;
    const freshAlerts = alertsResult.status === "fulfilled" && alertsResult.value?.success
      ? (alertsResult.value.data || [])
      : alerts;

    return {
      sensor: freshSensor,
      ai: freshAi,
      weather: freshWeather,
      fertilizer: freshFertilizer,
      pump: freshPump,
      alerts: freshAlerts,
      rainProbability: Number(freshAi?.rain_prediction?.probability_percent ?? 0),
      waterNeed: Number(freshAi?.water_need?.score_percent ?? 0),
      aiDecision: freshAi?.decision?.title ?? "WAITING FOR DATA",
      aiReason: freshAi?.decision?.reason ?? "Waiting for live farm data.",
      fertilizerInfo: getFertilizerInfo(freshFertilizer, fieldAreaHa),
      waterInfo: getWaterInfo(freshAi, fieldAreaHa),
    };
  }, [alerts, ai, fertilizer, fieldAreaHa, location.latitude, location.longitude, pump, sensor, weather]);

  const sendChat = async () => {
    const question = chatInput.trim();
    if (!question || busy) return;

    setChatMessages((previous) => [...previous, { role: "user", text: question }]);
    setChatInput("");
    setBusy(true);

    try {
      const context = await fetchAgentContext();
      const result = await runFarmerAgent(question, context, {
        startPump: () => startPump("chat_agent"),
        stopPump: () => stopPump("chat_agent"),
      });

      setChatMessages((previous) => [
        ...previous,
        { role: "assistant", text: result.text },
      ]);
    } catch (e) {
      setChatMessages((previous) => [
        ...previous,
        { role: "assistant", text: `⚠️ I couldn't complete that request: ${e.message}` },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const handleVoiceCommand = async (transcript) => {
    const command = String(transcript || "").trim();
    if (!command) return;
    setChatInput("");
    setChatMessages((previous) => [...previous, { role: "user", text: `🎤 ${command}` }]);
    setBusy(true);
    try {
      const context = await fetchAgentContext();
      const result = await runFarmerAgent(command, context, {
        startPump: () => startPump("voice_agent"),
        stopPump: () => stopPump("voice_agent"),
      });
      setChatMessages((previous) => [...previous, { role: "assistant", text: result.text }]);
    } catch (e) {
      setChatMessages((previous) => [...previous, { role: "assistant", text: `⚠️ Voice command failed: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  if (authChecking) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f4f8f5",
          color: "#31513d",
          fontFamily: "inherit",
        }}
      >
        Checking SmartFarm login...
      </div>
    );
  }

  if (!authUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className={`app ${darkMode ? "theme-dark" : "theme-light"}`}>
      <style>{THEME_CSS + WEATHER_FLOAT_CSS}</style>
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-icon">
            <Leaf size={24} />
          </div>

          <div>
            <h2>SmartFarm</h2>
            <span>AI Agriculture</span>
          </div>
        </div>

        <nav>
          <p className="nav-title">MAIN</p>

          {NAV.slice(0, 5).map(([key, label, Icon]) => (
            <button
              key={key}
              className={`nav-item ${page === key ? "active" : ""}`}
              style={navButtonStyle}
              onClick={() => setPage(key)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}

          <p className="nav-title system-title">SYSTEM</p>

          {NAV.slice(5).map(([key, label, Icon]) => (
            <button
              key={key}
              className={`nav-item ${page === key ? "active" : ""}`}
              style={navButtonStyle}
              onClick={() => setPage(key)}
            >
              <Icon size={19} />
              <span>{label}</span>

              {key === "alerts" && (
                <span className="notification">
                  {alerts.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="system-status">
          <span
            className="online-dot"
            style={{
              backgroundColor: backendOnline ? "#16a34a" : "#ef4444",
            }}
          />

          <div>
            <strong>
              {backendOnline ? "System Online" : "Backend Offline"}
            </strong>

            <small>
              {backendOnline
                ? "Sensor data connected"
                : "Waiting for FastAPI"}
            </small>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="header">
          <div className="header-left">
            <button
              className="mobile-menu"
              onClick={() => setPage("dashboard")}
            >
              <Menu size={22} />
            </button>

            <div>
              <h1>{title}</h1>
              <p>Real-time intelligent farming monitoring</p>
            </div>
          </div>

          <div className="header-right">
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setDarkMode((v) => !v)}
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
              <span>{darkMode ? "Light" : "Dark"}</span>
            </button>

            <div style={{ position: "relative" }}>
              <button
                type="button"
                className="farm-selector"
                onClick={() => {
                  setFarmOpen((v) => !v);
                  setProfileOpen(false);
                }}
                style={{
                  cursor: "pointer",
                  border: 0,
                  font: "inherit",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Leaf size={16} />
                {selectedFarm}
                <ChevronDown
                  size={15}
                  style={{
                    transform: farmOpen ? "rotate(180deg)" : "none",
                    transition: "transform .15s",
                  }}
                />
              </button>

              {farmOpen && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 8px)",
                    width: 210,
                    background: "#fff",
                    border: "1px solid #dfe7e1",
                    borderRadius: 13,
                    padding: 7,
                    boxShadow: "0 14px 35px rgba(0,0,0,.12)",
                    zIndex: 100,
                  }}
                >
                  {["Farm Alpha", "Farm Beta"].map((farm) => (
                    <button
                      key={farm}
                      type="button"
                      onClick={() => {
                        setSelectedFarm(farm);
                        setFarmOpen(false);
                      }}
                      style={{
                        width: "100%",
                        padding: "10px 11px",
                        border: 0,
                        borderRadius: 9,
                        background:
                          selectedFarm === farm ? "#eef9f1" : "transparent",
                        color: "#243a2d",
                        textAlign: "left",
                        cursor: "pointer",
                        font: "inherit",
                      }}
                    >
                      <Leaf size={14} style={{ marginRight: 8 }} />
                      {farm}
                    </button>
                  ))}
                  <div
                    style={{
                      padding: "7px 11px 5px",
                      fontSize: 11,
                      color: "#8a968f",
                    }}
                  >
                    Farm switching is ready for additional farms.
                  </div>
                </div>
              )}
            </div>

            <div style={{ position: "relative" }}>
              <button
                type="button"
                className="profile"
                onClick={() => {
                  setProfileOpen((v) => !v);
                  setFarmOpen(false);
                }}
                style={{
                  border: 0,
                  background: "transparent",
                  font: "inherit",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  textAlign: "left",
                }}
              >
                <div className="avatar">
                  {(authUser?.username || "F").charAt(0).toUpperCase()}
                </div>

                <div>
                  <strong>{authUser?.username || "Farmer"}</strong>
                  <small>
                    {authUser?.role === "farmer"
                      ? "Farmer"
                      : authUser?.role || "Administrator"}
                  </small>
                </div>

                <ChevronDown
                  size={15}
                  style={{
                    transform: profileOpen ? "rotate(180deg)" : "none",
                    transition: "transform .15s",
                  }}
                />
              </button>

              {profileOpen && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 10px)",
                    width: 245,
                    background: "#fff",
                    border: "1px solid #dfe7e1",
                    borderRadius: 15,
                    padding: 8,
                    boxShadow: "0 16px 40px rgba(0,0,0,.14)",
                    zIndex: 100,
                  }}
                >
                  <div
                    style={{
                      padding: "11px 12px 13px",
                      borderBottom: "1px solid #edf1ee",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: "50%",
                          background: "#16a34a",
                          color: "#fff",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <User size={18} />
                      </div>
                      <div>
                        <strong style={{ display: "block" }}>
                          {authUser?.username || "Farmer"}
                        </strong>
                        <span
                          style={{
                            color: "#7a887f",
                            fontSize: 12,
                          }}
                        >
                          {authUser?.role || "Farmer"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      setPage("settings");
                    }}
                    style={{
                      width: "100%",
                      padding: "11px 12px",
                      marginTop: 5,
                      border: 0,
                      borderRadius: 9,
                      background: "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                      font: "inherit",
                      color: "#33463a",
                    }}
                  >
                    <SettingsIcon size={15} style={{ marginRight: 9 }} />
                    Account & Settings
                  </button>

                  <button
                    type="button"
                    onClick={logout}
                    style={{
                      width: "100%",
                      padding: "11px 12px",
                      border: 0,
                      borderRadius: 9,
                      background: "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                      font: "inherit",
                      color: "#c62828",
                    }}
                  >
                    <LogOut size={15} style={{ marginRight: 9 }} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {error && (
          <div className="popup-animate" style={styles.error}>
            <span>{error}</span>

            <button onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}

        {page === "dashboard" && (
          <Dashboard
            sensor={sensor}
            ai={ai}
            pump={pump}
            fertilizer={fertilizer}
            alerts={alerts}
            backendOnline={backendOnline}
            weather={weather}
            rainProbability={rainProbability}
            waterNeed={waterNeed}
            aiDecision={aiDecision}
            aiReason={aiReason}
            startPump={startPump}
            stopPump={stopPump}
            busy={busy}
            fertilizerInfo={fertilizerInfo}
            waterInfo={waterInfo}
          />
        )}

        {page === "monitoring" && (
          <Monitoring
            sensor={sensor}
            history={history}
            refresh={loadHistory}
          />
        )}

        {page === "ai" && (
          <AIDecisions
            ai={ai}
            sensor={sensor}
            pump={pump}
            fertilizer={fertilizer}
            rainProbability={rainProbability}
            waterNeed={waterNeed}
            aiDecision={aiDecision}
            aiReason={aiReason}
            fertilizerInfo={fertilizerInfo}
            waterInfo={waterInfo}
          />
        )}

        {page === "irrigation" && (
          <Irrigation
            pump={pump}
            sensor={sensor}
            ai={ai}
            history={irrigationHistory}
            startPump={startPump}
            stopPump={stopPump}
            busy={busy}
            refresh={loadIrrigationHistory}
          />
        )}

        {page === "fertilizer" && (
          <Fertilizer
            fertilizer={fertilizer}
            usage={fertilizerUsage}
            form={fertForm}
            setForm={setFertForm}
            submit={recordFertilizer}
            busy={busy}
            refresh={loadFertilizerUsage}
            fertilizerInfo={fertilizerInfo}
            crop={crop}
            setCrop={setCrop}
            fieldAreaHa={fieldAreaHa}
            setFieldAreaHa={setFieldAreaHa}
          />
        )}

        {page === "alerts" && (
          <Alerts alerts={alerts} sensor={sensor} />
        )}

        {page === "settings" && (
          <SettingsPage
            backendOnline={backendOnline}
            autoIrrigation={autoIrrigation}
            setAutoIrrigation={setAutoIrrigation}
            refreshSeconds={refreshSeconds}
            setRefreshSeconds={setRefreshSeconds}
            reload={loadCore}
            crop={crop}
            setCrop={setCrop}
            fieldAreaHa={fieldAreaHa}
            setFieldAreaHa={setFieldAreaHa}
            requestNotificationPermission={
              requestNotificationPermission
            }
          />
        )}
      </main>

      <WeatherShortcut
        open={weatherOpen}
        setOpen={setWeatherOpen}
        weather={weather}
        location={location}
      />

      <FarmerAssistant
        open={chatOpen}
        setOpen={setChatOpen}
        input={chatInput}
        setInput={setChatInput}
        messages={chatMessages}
        sendChat={sendChat}
        onVoiceCommand={handleVoiceCommand}
        busy={busy}
        requestNotificationPermission={
          requestNotificationPermission
        }
      />
    </div>
  );
}

function normalizeIntent(q) {
  const text = String(q || "")
    .toLowerCase()
    .replace(/[^a-z0-9%? ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Explicit ON/OFF phrases are intentionally stricter than a simple
  // keyword match so "turn on" can never be mistaken for "turn off".
  const wantsOn =
    /\b(turn|switch)\s+(the\s+)?(pump|motor|irrigation|watering|water pump)?\s*(on|up)\b/.test(text) ||
    /\b(start|activate|enable|run)\b.*\b(pump|motor|irrigation|watering)\b/.test(text) ||
    /\b(pump|motor|irrigation|watering)\b.*\b(start|activate|enable|on)\b/.test(text);

  const wantsOff =
    /\b(turn|switch)\s+(the\s+)?(pump|motor|irrigation|watering|water pump)?\s*(off|down)\b/.test(text) ||
    /\b(stop|disable|deactivate|shut off|switch off)\b.*\b(pump|motor|irrigation|watering)\b/.test(text) ||
    /\b(pump|motor|irrigation|watering)\b.*\b(stop|disable|deactivate|off)\b/.test(text);

  const asksPump = /\b(pump|motor|irrigation|watering|water pump)\b/.test(text);

  return {
    text,
    wantsOn,
    wantsOff,
    asksPump,
    weather: /\b(weather|forecast|temperature outside|rain forecast|will it rain|tomorrow|today)\b/.test(text),
    rain: /\b(rain|raining|rainfall|shower|storm)\b/.test(text),
    fertilizer: /\b(fertilizer|fertiliser|npk|nitrogen|phosphorus|potassium|nutrient|manure)\b/.test(text),
    sensors: /\b(sensor|soil|moisture|humidity|temperature|ph|light|reading|condition)\b/.test(text),
    tank: /\b(tank|water level|storage|reservoir|how much water)\b/.test(text),
    alert: /\b(alert|warning|problem|danger|notification)\b/.test(text),
    why: /\b(why|reason|explain|because|should i|what do you recommend|recommend)\b/.test(text),
    waterNeed: /\b(water|irrigat|dry|thirst|need water)\b/.test(text),
  };
}

function formatWeather(weather) {
  const current = weather?.current || {};
  const forecast = weather?.forecast || weather?.daily || [];
  const loc = weather?.location || {};
  const temp = current.temperature ?? current.temperature_c;
  const humidity = current.humidity ?? current.relative_humidity;
  const condition = current.condition || current.description || "unknown conditions";
  const rainProb = forecast[0]?.rain_probability;
  let text = `🌤️ ${loc.name || "Your location"}: ${temp != null ? Number(temp).toFixed(1) + "°C" : "temperature unavailable"}, ${condition}.`;
  if (humidity != null) text += ` Humidity is ${Number(humidity).toFixed(0)}%.`;
  if (rainProb != null) text += ` Today's rain probability is about ${Number(rainProb).toFixed(0)}%.`;
  return text;
}

async function runFarmerAgent(question, data, tools) {
  const intent = normalizeIntent(question);

  // Agent loop: understand -> choose a tool -> execute -> re-check context -> respond.
  // It intentionally uses fresh backend/forecast data supplied by fetchAgentContext.
  if (intent.asksPump && intent.wantsOn && !intent.wantsOff) {
    if (intent.tank) {
      return { text: "⚠️ I understood this as a tank-fill motor command. The current backend exposes the irrigation pump control, not a separate tank-motor command, so I won't pretend I switched the wrong motor." };
    }
    const result = await tools.startPump();
    return { text: result?.success ? "🚰 Done. I turned the irrigation pump ON and sent the command to the controller." : "❌ I couldn't turn the irrigation pump ON. The backend did not confirm the command." };
  }

  if (intent.asksPump && intent.wantsOff) {
    const result = await tools.stopPump();
    return { text: result?.success ? "🛑 Done. I turned the irrigation pump OFF and sent the stop command to the controller." : "❌ I couldn't turn the irrigation pump OFF. The backend did not confirm the command." };
  }

  if (intent.weather || (intent.rain && !intent.waterNeed)) {
    return { text: formatWeather(data.weather) };
  }

  if (intent.fertilizer) {
    const f = data.fertilizerInfo;
    let text = `🌱 Based on the latest soil/farm context, the current recommendation is ${f.name}.`;
    if (data.fertilizer?.reason) text += ` Reason: ${data.fertilizer.reason}`;
    if (data.fertilizer?.urgency) text += ` Urgency: ${data.fertilizer.urgency}.`;
    if (f.npk) text += ` NPK: ${f.npk}.`;
    if (f.rate) text += ` Rate: ${f.rate} kg/ha.`;
    if (!f.rate && !f.amount) text += " I won't invent a dosage: precise application needs crop stage, field area and soil N/P/K or a lab test.";
    return { text };
  }

  if (intent.alert) {
    if (!data.alerts?.length) return { text: "🔔 I don't see any active backend alerts right now." };
    const a = data.alerts[0];
    return { text: `🔔 Latest alert: ${a.title || "Farm alert"} — ${a.message || "Please check the Alerts page."}` };
  }

  if (intent.tank) {
    const level = Number(data.sensor.waterLevel ?? data.sensor.water_level ?? 0);
    if (!Number.isFinite(level)) return { text: "💧 I can't read the tank level right now." };
    return { text: `💧 The latest tank level is ${level.toFixed(0)}%. ${level >= 95 ? "The tank is effectively full." : level <= 20 ? "The tank is low and needs filling." : "The tank is between the low and full thresholds."}` };
  }

  if (intent.waterNeed || intent.why) {
    const rainProb = Number(data.rainProbability || 0);
    const moisture = Number(data.sensor.soilMoisture || 0);
    let recommendation = data.aiDecision;
    if (rainProb >= 60 && moisture < 55) recommendation = "POSTPONE IRRIGATION";
    else if (moisture <= 30 && rainProb < 60) recommendation = "START/KEEP IRRIGATION AVAILABLE";
    return { text: `💧 My current decision is ${recommendation}. Soil moisture is ${moisture.toFixed(1)}%, rain probability is ${rainProb.toFixed(0)}%, and the AI reason is: ${data.aiReason}` };
  }

  if (intent.sensors) {
    const s = data.sensor;
    return { text: `📡 Latest live readings: soil moisture ${s.soilMoisture.toFixed(1)}%, temperature ${s.temperature.toFixed(1)}°C, humidity ${s.humidity.toFixed(1)}%, pH ${s.ph.toFixed(2)}, light ${s.light.toFixed(0)} lux. ${formatWeather(data.weather)}` };
  }

  return { text: "🤖 I can understand natural requests about irrigation, the pump, tank level, weather/rain, fertilizer/NPK, sensors and alerts. You can say things like “turn the pump on”, “should I water today?”, “will it rain?”, or “what fertilizer should I use?”" };
}

function WeatherShortcut({ open, setOpen, weather, location }) {
  const current = weather?.current || {};
  const daily = (weather?.forecast || weather?.daily || []).slice(0, 5);

  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} title="Live weather forecast" aria-label="Open live weather forecast" className="weather-float-button">
          <CloudSun size={24} />
          <span className="weather-live-dot" />
        </button>
      )}
      {open && (
        <div className="weather-float-panel">
          <div className="weather-float-header">
            <div>
              <strong>Live Weather</strong>
              <span>
                <MapPin size={13} />
                {location?.source === "browser_geolocation" && location?.latitude != null
                  ? `GPS • ${Number(location.latitude).toFixed(4)}, ${Number(location.longitude).toFixed(4)}`
                  : "Coimbatore • fallback location"}
              </span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close weather"><X size={18} /></button>
          </div>
          <div className="weather-float-current">
            <div className="weather-float-icon"><CloudSun size={38} /></div>
            <div>
              <div className="weather-float-temp">{(current.temperature ?? current.temperature_c) != null ? `${Number(current.temperature ?? current.temperature_c).toFixed(1)}°C` : "—"}</div>
              <div className="weather-float-desc">{current.condition || current.description || "Loading live weather..."}</div>
            </div>
          </div>
          <div className="weather-float-updated">
            Live forecast • updates automatically
            {weather?.source ? ` • ${weather.source}` : ""}
          </div>
          <div className="weather-float-days">
            {daily.map((day, i) => (
              <div className="weather-float-day" key={`${day.date}-${i}`}>
                <strong>{day.day || day.date}</strong>
                <Cloud size={17} />
                <span>{day.rain_probability ?? 0}% rain</span>
                <b>{day.max_c ?? "—"}° / {day.min_c ?? "—"}°</b>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function FarmerAssistant({
  open,
  setOpen,
  input,
  setInput,
  messages,
  sendChat,
  onVoiceCommand,
  busy,
  requestNotificationPermission,
}) {
  const quickQuestions = [
    "Does my farm need water?",
    "Why is the pump running?",
    "What is the tank water level?",
    "Will it rain today?",
    "What fertilizer is recommended?",
  ];

  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const recognitionRef = useRef(null);

  const startVoiceCommand = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      window.alert(
        "Voice commands are not supported in this browser. Use Google Chrome or Microsoft Edge."
      );
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      setIsListening(true);
      setLiveTranscript("");
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const text = event.results[i][0]?.transcript || "";
        if (event.results[i].isFinal) finalText += text;
        else interimText += text;
      }

      setLiveTranscript((finalText || interimText).trim());

      if (finalText.trim()) {
        onVoiceCommand(finalText.trim());
      }
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      setLiveTranscript("");
      if (event.error !== "aborted" && event.error !== "no-speech") {
        window.alert(`Voice recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      setLiveTranscript("");
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore cleanup errors
      }
    };
  }, []);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Open Farmer Assistant"
        aria-label="Open Farmer Assistant"
        style={chatButtonStyle}
      >
        <MessageCircle size={26} />
      </button>
    );
  }

  return (
    <div className="sf-chat-window" style={chatWindowStyle}>
      <div className="sf-chat-header" style={chatHeaderStyle}>
        <div>
          <strong>🌱 Farmer Assistant</strong>
          <div style={{ fontSize: 12, opacity: 0.9 }}>
            Live SmartFarm advisor • voice + live data
          </div>
        </div>

        <button
          onClick={() => {
            try {
              recognitionRef.current?.stop();
            } catch {}
            setOpen(false);
          }}
          style={closeButtonStyle}
          aria-label="Close assistant"
        >
          <X size={20} />
        </button>
      </div>

      <div style={{ padding: 10 }}>
        <button
          onClick={requestNotificationPermission}
          className="sf-chat-notify"
          style={{
            ...styles.button,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <BellRing size={16} />
          Enable Farmer Notifications
        </button>
      </div>

      <div className="sf-chat-quick" style={quickQuestionsStyle}>
        {quickQuestions.map((question) => (
          <button
            key={question}
            onClick={() => setInput(question)}
            className="sf-chat-quick-btn"
            style={quickQuestionStyle}
            disabled={busy}
          >
            {question}
          </button>
        ))}
      </div>

      <div className="sf-chat-messages" style={chatMessagesStyle}>
        {messages.map((message, index) => (
          <div
            key={index}
            className="sf-chat-bubble"
            style={{
              ...chatBubbleStyle,
              alignSelf:
                message.role === "user" ? "flex-end" : "flex-start",
              background:
                message.role === "user" ? "#dcfce7" : "white",
            }}
          >
            {message.text}
          </div>
        ))}

        {busy && !isListening && (
          <div className="sf-agent-status">
            🤖 Checking fresh sensor, weather and farm data…
          </div>
        )}
      </div>

      {isListening && (
        <div className="sf-voice-live">
          <span className="sf-voice-dot" />
          <div style={{ flex: 1 }}>
            <strong>Listening…</strong>
            <div>
              {liveTranscript ||
                "Say a command naturally, for example: turn on the irrigation pump"}
            </div>
          </div>
          <button type="button" onClick={startVoiceCommand}>
            Stop
          </button>
        </div>
      )}

      <div className="sf-chat-input" style={chatInputStyle}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendChat();
          }}
          placeholder="Ask about your farm..."
          className="sf-chat-text-input"
          style={chatTextInputStyle}
          disabled={busy}
        />

        <button
          type="button"
          onClick={startVoiceCommand}
          className="sf-chat-mic"
          title={isListening ? "Stop listening" : "Voice command"}
          aria-label={isListening ? "Stop listening" : "Voice command"}
          disabled={busy && !isListening}
        >
          {isListening ? <MicOff size={20} /> : <Mic size={20} />}
        </button>

        <button
          type="button"
          onClick={sendChat}
          style={styles.primary}
          title="Send"
          disabled={busy || !input.trim()}
        >
          <Send size={17} />
        </button>
      </div>
    </div>
  );
}


const WEATHER_FLOAT_CSS = `
.weather-float-button{position:fixed;right:24px;bottom:94px;width:58px;height:58px;border-radius:50%;border:1px solid rgba(59,130,246,.28);background:#eff6ff;color:#2563eb;box-shadow:0 10px 30px rgba(0,0,0,.16);cursor:pointer;z-index:999;display:grid;place-items:center;transition:transform .18s ease,box-shadow .18s ease}
.weather-float-button:hover{transform:translateY(-3px) scale(1.04);box-shadow:0 15px 34px rgba(37,99,235,.24)}
.weather-live-dot{position:absolute;top:8px;right:8px;width:9px;height:9px;border-radius:50%;background:#22c55e;border:2px solid #eff6ff}
.weather-float-panel{position:fixed;right:24px;bottom:94px;width:min(390px,calc(100vw - 32px));max-height:min(620px,calc(100vh - 130px));overflow:auto;background:#fff;border:1px solid #dbe7df;border-radius:22px;box-shadow:0 22px 60px rgba(0,0,0,.2);z-index:999;padding:16px}
.weather-float-header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.weather-float-header strong{display:block;color:#173b28;font-size:17px}.weather-float-header span{display:flex;align-items:center;gap:4px;color:#718078;font-size:12px;margin-top:4px}.weather-float-header button{border:0;background:transparent;color:#718078;cursor:pointer;padding:4px}
.weather-float-current{margin-top:15px;display:flex;align-items:center;gap:14px;padding:14px;border-radius:17px;background:#eff6ff;border:1px solid #dbeafe}.weather-float-icon{width:62px;height:62px;border-radius:17px;display:grid;place-items:center;color:#f59e0b;background:#fff7d6}.weather-float-temp{font-size:28px;font-weight:800;color:#173b28}.weather-float-desc{color:#65756b;font-size:12px;margin-top:2px}.weather-float-updated{font-size:11px;color:#6f7f76;margin:10px 2px}.weather-float-days{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.weather-float-day{padding:10px 7px;border:1px solid #e1e9e4;border-radius:14px;display:grid;gap:5px;text-align:center;background:#f9fbfa;font-size:10px;color:#64746b}.weather-float-day strong{color:#203a2a;font-size:11px}.weather-float-day svg{margin:auto;color:#3b82f6}.weather-float-day b{color:#203a2a;font-size:10px}
.theme-dark .weather-float-button{background:#10263a;border-color:#244e73;color:#60a5fa}.theme-dark .weather-live-dot{border-color:#10263a}.theme-dark .weather-float-panel{background:#0d1d13;border-color:#294934}.theme-dark .weather-float-header strong{color:#ecfff1}.theme-dark .weather-float-header span,.theme-dark .weather-float-desc,.theme-dark .weather-float-updated{color:#9fc0aa}.theme-dark .weather-float-current{background:#10263a;border-color:#244e73}.theme-dark .weather-float-temp{color:#ecfff1}.theme-dark .weather-float-day{background:#102118;border-color:#294934;color:#9fc0aa}.theme-dark .weather-float-day strong,.theme-dark .weather-float-day b{color:#e7f5eb}
@media(max-width:700px){.weather-float-button{right:16px;bottom:86px}.weather-float-panel{right:16px;bottom:86px}.weather-float-days{grid-template-columns:repeat(2,1fr)}}
`;

const THEME_CSS = `

  /* Farmer Assistant — follow the selected dashboard theme */
  .sf-chat-window {
    background:#ffffff !important;
    color:#183326;
    border-color:#dfe7e1 !important;
  }
  .sf-chat-messages {
    background:#f8faf8 !important;
  }
  .sf-chat-quick {
    background:#ffffff;
    border-color:#eef2ef !important;
  }
  .sf-chat-quick-btn {
    background:#ffffff !important;
    color:#243a2d !important;
    border-color:#cbd5d1 !important;
  }
  .sf-chat-text-input {
    background:#ffffff !important;
    color:#183326 !important;
    border-color:#cbd5d1 !important;
  }
  .sf-chat-text-input::placeholder { color:#7b8b82 !important; }
  .sf-chat-input {
    background:#ffffff !important;
    border-color:#e5e7eb !important;
  }
  .sf-chat-bubble {
    color:#183326 !important;
  }
  .theme-dark .sf-chat-window {
    background:#0b1710 !important;
    color:#e7f5eb !important;
    border-color:#294934 !important;
    box-shadow:0 24px 70px rgba(0,0,0,.55) !important;
  }
  .theme-dark .sf-chat-header {
    background:#15803d !important;
    color:#ffffff !important;
  }
  .theme-dark .sf-chat-quick {
    background:#0b1710 !important;
    border-color:#294934 !important;
  }
  .theme-dark .sf-chat-notify {
    background:#10251a !important;
    color:#e7f5eb !important;
    border-color:#31583d !important;
  }
  .theme-dark .sf-chat-quick-btn {
    background:#102118 !important;
    color:#dff7e7 !important;
    border-color:#31583d !important;
  }
  .theme-dark .sf-chat-messages {
    background:#07110b !important;
  }
  .theme-dark .sf-chat-bubble {
    background:#102118 !important;
    color:#e7f5eb !important;
    border-color:#31583d !important;
  }
  .theme-dark .sf-chat-input {
    background:#0b1710 !important;
    border-color:#294934 !important;
  }
  .theme-dark .sf-chat-text-input {
    background:#07110b !important;
    color:#e7f5eb !important;
    border-color:#31583d !important;
  }
  .theme-dark .sf-chat-text-input::placeholder { color:#789384 !important; }
  .sf-chat-mic {
    width:42px; min-width:42px; border:1px solid #cbd5d1; border-radius:12px;
    background:#eef8f1; color:#15803d; cursor:pointer; display:grid; place-items:center;
  }
  .sf-chat-mic:hover { transform:translateY(-1px); box-shadow:0 6px 15px rgba(0,0,0,.12); }
  .sf-chat-mic:disabled { opacity:.5; cursor:not-allowed; transform:none; }
  .sf-voice-live {
    display:flex; align-items:center; gap:10px; margin:0 10px 8px; padding:10px 12px;
    border:1px solid #31583d; border-radius:13px; background:#102118; color:#e7f5eb;
  }
  .sf-voice-live button {
    border:1px solid #4b7d59; background:#183b25; color:#fff; border-radius:9px;
    padding:6px 10px; cursor:pointer;
  }
  .sf-voice-dot { width:9px; height:9px; flex:0 0 9px; border-radius:50%; background:#ef4444; animation:sfPulse 1.1s infinite; }
  .sf-agent-status { align-self:center; padding:7px 10px; border-radius:10px; font-size:12px; color:#6b7c71; background:#eef5ef; }
  .weather-current-details { display:flex; flex-wrap:wrap; gap:8px; margin-top:9px; font-size:12px; color:#65756b; }
  .weather-current-details span { padding:5px 8px; border-radius:9px; background:rgba(255,255,255,.7); }
  .weather-detail-strip { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-top:12px; }
  .weather-detail-strip > div { padding:10px 12px; border-radius:13px; border:1px solid #e0e9e2; background:#f8fbf9; }
  .weather-detail-strip small { display:block; color:#718078; font-size:10px; margin-bottom:4px; }
  .weather-detail-strip strong { display:block; color:#203a2a; font-size:12px; overflow-wrap:anywhere; }
  .forecast-item small { color:#718078; }
  .theme-dark .sf-chat-mic { background:#10291a; border-color:#31583d; color:#86efac; }
  .theme-dark .sf-agent-status { background:#102118; color:#a9c5b1; }
  .theme-dark .weather-current-details span { background:#12251a; color:#a9c5b1; }
  .theme-dark .weather-detail-strip > div { background:#0e2115; border-color:#294934; }
  .theme-dark .weather-detail-strip small { color:#8faa98; }
  .theme-dark .weather-detail-strip strong { color:#e7f5eb; }


  /* AI reason must be a proper dark card in dark mode */
  .ai-reason-box {
    border:1px solid #d7eadc;
    color:#183326;
  }
  .ai-reason-box strong { color:#14532d; }
  .ai-reason-box p { color:#355545; }
  .theme-dark .ai-reason-box {
    background:#102118 !important;
    border-color:#31583d !important;
    color:#e7f5eb !important;
  }
  .theme-dark .ai-reason-box strong { color:#b9f6ca !important; }
  .theme-dark .ai-reason-box p { color:#c9ddd0 !important; }
  * { box-sizing: border-box; }
  .sf-card {
    border-radius: 24px !important;
    overflow: hidden;
  }
  .theme-dark { background:#07110b !important; color:#e7f5eb !important; }
  .theme-dark .main { background:#07110b !important; }
  .theme-dark .header { background:#09150e !important; border-color:#1d3525 !important; }
  .theme-dark .sidebar { background:linear-gradient(180deg,#0a1b10,#06100a) !important; border-color:#193523 !important; }
  .theme-dark .logo h2, .theme-dark .logo span, .theme-dark .nav-title, .theme-dark .system-status strong, .theme-dark .system-status small, .theme-dark .header h1, .theme-dark .header p { color:#e7f5eb !important; }
  .theme-dark .nav-item { color:#b9d1bf !important; border-radius:14px !important; }
  .theme-dark .nav-item:hover { background:#12351f !important; color:#fff !important; }
  .theme-dark .nav-item.active { background:#164b2a !important; color:#fff !important; }
  .theme-dark .system-status { background:#0d2416 !important; border-color:#254c32 !important; border-radius:18px !important; }
  .theme-dark .farm-selector { background:#10291a !important; color:#d9f7e2 !important; border-color:#2b5537 !important; border-radius:14px !important; }
  .theme-dark .profile strong { color:#effff3 !important; }
  .theme-dark .profile small { color:#93b29d !important; }
  .theme-dark .sf-card { background:#0a160f !important; border-color:#203d2a !important; color:#e7f5eb !important; box-shadow:0 12px 30px rgba(0,0,0,.30); }
  .theme-dark .sf-stat-card { background:#0b1710 !important; }
  .theme-dark .stat-title { color:#c8ded0 !important; }
  .theme-dark .stat-value { color:#f3fff6 !important; }
  .theme-dark .stat-status { filter:brightness(1.18); }
  .theme-dark .stat-progress { background:#17281d; }
  .theme-dark .stat-progress-meta span { color:#91a99a; }
  .theme-dark .weather-panel, .theme-dark .forecast-item { background:#0e2115 !important; border-color:#23432d !important; }
  .theme-dark .weather-location, .theme-dark .weather-desc, .theme-dark .forecast-item span { color:#9fc0aa !important; }
  .theme-dark .forecast-item strong, .theme-dark .forecast-item b, .theme-dark .weather-temp { color:#ecfff1 !important; }
  .theme-dark .theme-toggle { background:#10251a !important; border-color:#31583d !important; color:#f6d45b !important; }
  .theme-dark input, .theme-dark textarea, .theme-dark select { background:#09170e !important; color:#e7f5eb !important; border-color:#31583d !important; }
  .theme-dark button { border-radius:14px; }

  .stat-topline { display:flex; justify-content:space-between; align-items:flex-start; gap:20px; }
  .stat-icon { width:66px; height:66px; flex:0 0 66px; padding:17px; border-radius:21px !important; display:grid; place-items:center; transition:transform .28s cubic-bezier(.2,.8,.2,1), box-shadow .28s ease; }
  .sf-stat-card {
    min-height:280px;
    padding:28px !important;
    position:relative;
    border-radius:26px !important;
    overflow:hidden !important;
    background:#ffffff;
    border:1px solid #dce7df;
    box-shadow:0 10px 28px rgba(28,55,39,.08);
    transition:transform .28s cubic-bezier(.2,.8,.2,1), box-shadow .28s ease, border-color .28s ease;
  }
  .sf-stat-card:hover {
    transform:translateY(-5px);
    border-color:#c9dbce;
    box-shadow:0 22px 46px rgba(28,55,39,.14);
  }
  .theme-dark .sf-stat-card:hover { border-color:#3b7a4d !important; box-shadow:0 22px 46px rgba(0,0,0,.46); }
  .sf-stat-card:hover .stat-icon { transform:translateY(-2px) scale(1.045); }
  .stat-main-row { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-top:28px; min-width:0; }
  .stat-copy { min-width:0; padding-bottom:5px; }
  .stat-value { font-size:35px; font-weight:850; margin-top:0; letter-spacing:-.9px; line-height:1.08; transition:transform .28s ease, color .2s; overflow-wrap:anywhere; }
  .sf-stat-card:hover .stat-value { transform:translateX(2px); }
  .stat-title { color:#42564a; margin-top:11px; font-size:15px; line-height:1.3; }
  .stat-status { display:block; margin-top:10px; font-size:14px; font-weight:750; line-height:1.3; }

  .stat-progress { width:100%; height:12px; margin-top:20px; border-radius:999px; background:#e7eee9; overflow:hidden; box-shadow:inset 0 1px 2px rgba(0,0,0,.08); }
  .stat-progress-fill { height:100%; border-radius:999px; transform-origin:left center; transition:none !important; }
  .stat-progress-meta { display:flex; justify-content:space-between; gap:12px; margin-top:9px; font-size:12px; font-weight:700; }
  .stat-progress-meta span:last-child { color:#6b7c71; }
  .sf-stat-card:hover .stat-progress-fill { filter:none; }
  .live-pulse { width:9px; height:9px; border-radius:50%; box-shadow:0 0 0 0 currentColor; animation:sfPulse 1.8s infinite; margin-top:6px; flex:0 0 auto; }
  .sf-stat-tooltip { position:absolute; left:28px; right:28px; bottom:18px; padding:10px 13px; border-radius:14px !important; background:rgba(15,23,18,.96); color:#effff3; font-size:12px; line-height:1.35; pointer-events:none; opacity:0; transform:translateY(5px); transition:opacity .2s ease, transform .2s ease; box-shadow:0 10px 24px rgba(0,0,0,.18); z-index:5; }
  .sf-stat-card:hover .sf-stat-tooltip { opacity:1; transform:translateY(0); }
  .theme-light .sf-stat-tooltip { background:#173b28; }

  .page > div:first-child { gap:24px !important; }
  .sf-stat-card + .sf-stat-card { margin:0; }
  .weather-panel { display:flex; align-items:center; gap:18px; padding:18px; border-radius:18px !important; background:#f1f8f3; border:1px solid #dcebe0; }
  .weather-main-icon { width:72px; height:72px; flex:0 0 72px; border-radius:20px !important; display:grid; place-items:center; color:#f59e0b; background:#fff7d6; }
  .weather-location { display:flex; align-items:center; gap:5px; color:#64756b; font-size:13px; }
  .weather-temp { font-size:30px; font-weight:800; color:#173b28; margin-top:3px; }
  .weather-desc { color:#64756b; font-size:13px; }
  .forecast-row { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:10px; margin-top:14px; }
  .forecast-item { min-width:0; padding:12px; border-radius:15px !important; border:1px solid #e0e9e2; background:#f8fbf9; display:grid; gap:6px; font-size:11px; color:#5e7065; }
  .forecast-item svg { color:#3b82f6; }
  .forecast-item strong { color:#203a2a; font-size:12px; }
  .forecast-item b { color:#203a2a; font-size:11px; }
  .button-hover { border-radius:14px !important; transition:transform .2s ease, box-shadow .2s ease, background .2s ease; }
  .button-hover:hover { transform:translateY(-2px); box-shadow:0 9px 20px rgba(0,0,0,.13); }
  .popup-animate { animation:sfPop .24s ease-out; border-radius:16px !important; }
  @keyframes sfPulse { 0% { box-shadow:0 0 0 0 rgba(34,197,94,.45); } 70% { box-shadow:0 0 0 8px rgba(34,197,94,0); } 100% { box-shadow:0 0 0 0 rgba(34,197,94,0); } }
  @keyframes sfPop { from { opacity:0; transform:translateY(7px) scale(.98); } to { opacity:1; transform:translateY(0) scale(1); } }
  @media (max-width:900px) { .forecast-row { grid-template-columns:repeat(2,1fr); } .sf-stat-card { min-height:250px; padding:22px !important; } .stat-circle-wrap { width:94px; height:94px; flex-basis:94px; } .stat-circle { width:94px; height:94px; } }
`

const navButtonStyle = {
  background: "transparent",
  border: 0,
  width: "100%",
  font: "inherit",
  color: "inherit",
  textAlign: "left",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const styles = {
  page: {
    display: "grid",
    gap: 24,
  },

  grid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit,minmax(250px,1fr))",
    gap: 24,
  },

  card: {
    background: "white",
    border: "1px solid #dfe7e1",
    borderRadius: 16,
    padding: 24,
    boxSizing: "border-box",
  },

  error: {
    marginBottom: 18,
    padding: "12px 16px",
    borderRadius: 10,
    background: "#fff1f2",
    color: "#b91c1c",
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
  },

  big: {
    fontSize: 34,
    fontWeight: 750,
    margin: "10px 0",
  },

  muted: {
    color: "#64748b",
  },

  button: {
    border: "1px solid #cbd5d1",
    borderRadius: 10,
    padding: "10px 16px",
    background: "white",
    cursor: "pointer",
    fontWeight: 650,
  },

  primary: {
    border: 0,
    borderRadius: 10,
    padding: "10px 16px",
    background: "#16a34a",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  },
};

const chatButtonStyle = {
  position: "fixed",
  right: 24,
  bottom: 24,
  width: 58,
  height: 58,
  borderRadius: "50%",
  border: 0,
  background: "#15803d",
  color: "white",
  boxShadow: "0 10px 30px rgba(0,0,0,.2)",
  cursor: "pointer",
  zIndex: 1000,
  display: "grid",
  placeItems: "center",
};

const chatWindowStyle = {
  position: "fixed",
  right: 24,
  bottom: 24,
  width: "min(410px, calc(100vw - 32px))",
  height: "min(680px, calc(100vh - 48px))",
  background: "white",
  border: "1px solid #dfe7e1",
  borderRadius: 18,
  boxShadow: "0 20px 60px rgba(0,0,0,.22)",
  zIndex: 1000,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const chatHeaderStyle = {
  padding: "16px 18px",
  background: "#15803d",
  color: "white",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const closeButtonStyle = {
  background: "transparent",
  border: 0,
  color: "white",
  cursor: "pointer",
};

const quickQuestionsStyle = {
  padding: 10,
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  borderBottom: "1px solid #eef2ef",
};

const quickQuestionStyle = {
  border: "1px solid #cbd5d1",
  borderRadius: 10,
  padding: "7px 9px",
  background: "white",
  cursor: "pointer",
  fontSize: 12,
};

const chatMessagesStyle = {
  flex: 1,
  overflowY: "auto",
  padding: 14,
  background: "#f8faf8",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const chatBubbleStyle = {
  maxWidth: "88%",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: "10px 12px",
  lineHeight: 1.45,
  fontSize: 14,
  whiteSpace: "pre-wrap",
};

const chatInputStyle = {
  padding: 10,
  borderTop: "1px solid #e5e7eb",
  display: "flex",
  gap: 8,
};

const chatTextInputStyle = {
  flex: 1,
  minWidth: 0,
  border: "1px solid #cbd5d1",
  borderRadius: 10,
  padding: "11px 12px",
  outline: "none",
};

function Page({ children }) {
  return <div style={styles.page}>{children}</div>;
}

function Card({ title, subtitle, children, action }) {
  return (
    <section className="sf-card" style={styles.card}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 18,
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>{title}</h2>

          {subtitle && (
            <p
              style={{
                ...styles.muted,
                margin: "6px 0 0",
              }}
            >
              {subtitle}
            </p>
          )}
        </div>

        {action}
      </div>

      {children}
    </section>
  );
}

function AnimatedValue({ value }) {
  // Values are intentionally static. Only the progress bar represents the percentage.
  return <>{String(value ?? "—")}</>;
}

function Stat({ icon, title, value, status }) {
  const palette = {
    "Soil Moisture": { color: "#22c55e", bg: "#dcfce7", max: 100, get: () => Number.parseFloat(value) || 0 },
    Temperature: { color: "#f97316", bg: "#ffedd5", max: 100, get: () => ((Number.parseFloat(value) || 0) + 100) / 2 },
    Humidity: { color: "#06b6d4", bg: "#cffafe", max: 100, get: () => Number.parseFloat(value) || 0 },
    "Rain Status": { color: "#3b82f6", bg: "#dbeafe", max: 100, get: () => String(value).toLowerCase().includes("rain") ? 100 : 0 },
    "Soil pH": { color: "#a855f7", bg: "#f3e8ff", max: 14, get: () => Number.parseFloat(value) || 0 },
    Light: { color: "#eab308", bg: "#fef9c3", max: 1000, get: () => Number.parseFloat(value) || 0 },
    "Water Tank Level": { color: "#0ea5e9", bg: "#e0f2fe", max: 100, get: () => Number.parseFloat(value) || 0 },
  }[title] || { color: "#16a34a", bg: "#dcfce7", max: 100, get: () => 0 };

  const raw = palette.get();
  const progress = title === "Temperature"
    ? Math.max(0, Math.min(100, raw))
    : Math.max(0, Math.min(100, (raw / palette.max) * 100));

  return (
    <div className="sf-stat-card">
      <div className="stat-topline">
        <div
          className="stat-icon"
          style={{
            background: palette.bg,
            color: palette.color,
            boxShadow: `0 8px 22px ${palette.color}22`,
          }}
        >
          {icon}
        </div>
        <span className="live-pulse" style={{ backgroundColor: palette.color, color: palette.color }} />
      </div>

      <div className="stat-copy" style={{ marginTop: 28 }}>
        <div className="stat-value" style={{ color: palette.color }}>
          <AnimatedValue value={value} />
        </div>
        <div className="stat-title">{title}</div>
        <div className="stat-progress">
          <div
            className="stat-progress-fill"
            style={{ width: `${progress}%`, background: palette.color, boxShadow: `0 2px 8px ${palette.color}44` }}
          />
        </div>
        <div className="stat-progress-meta">
          <span style={{ color: palette.color }}>{status}</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>
    </div>
  );
}
function Info({ title, value }) {
  return (
    <div
      style={{
        padding: 16,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
      }}
    >
      <small style={styles.muted}>{title}</small>

      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          marginTop: 6,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Table({ headers, rows }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          minWidth: 700,
        }}
      >
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "12px 10px",
                  borderBottom: "2px solid #e5e7eb",
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.length ? (
            rows.map((row, i) => (
              <tr key={i}>
                {row.map((value, j) => (
                  <td
                    key={j}
                    style={{
                      padding: "12px 10px",
                      borderBottom:
                        "1px solid #eef2ef",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {String(value)}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={headers.length}
                style={{
                  padding: 20,
                  textAlign: "center",
                  color: "#64748b",
                }}
              >
                No data yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Dashboard({
  sensor,
  ai,
  pump,
  fertilizer,
  alerts,
  backendOnline,
  weather,
  rainProbability,
  waterNeed,
  aiDecision,
  aiReason,
  startPump,
  stopPump,
  busy,
  fertilizerInfo,
  waterInfo,
}) {
  return (
    <Page>
      <div style={styles.grid}>
        <Stat
          icon={<Leaf />}
          title="Soil Moisture"
          value={`${Math.round(sensor.soilMoisture)}%`}
          status={statusFor(
            sensor.soilMoisture,
            30,
            55
          )}
        />

        <Stat
          icon={<Droplets />}
          title="Water Tank Level"
          value={`${Math.round(sensor.waterLevel)}%`}
          status={
            sensor.waterLevel >= 95
              ? "Full"
              : sensor.waterLevel <= 20
              ? "Low"
              : "Normal"
          }
        />

        <Stat
          icon={<Thermometer />}
          title="Temperature"
          value={`${sensor.temperature.toFixed(1)}°C`}
          status={
            sensor.temperature > 35
              ? "High"
              : sensor.temperature > 30
              ? "Warm"
              : "Normal"
          }
        />

        <Stat
          icon={<Waves />}
          title="Humidity"
          value={`${Math.round(sensor.humidity)}%`}
          status={statusFor(
            sensor.humidity,
            35,
            80
          )}
        />

        <Stat
          icon={<CloudRain />}
          title="Rain Status"
          value={
            sensor.rain
              ? "Rain Detected"
              : "No Rain"
          }
          status={
            sensor.rain
              ? "Wet conditions"
              : "Dry conditions"
          }
        />

        <Stat
          icon={<Gauge />}
          title="Soil pH"
          value={sensor.ph.toFixed(1)}
          status={
            sensor.ph < 5.5
              ? "Acidic"
              : sensor.ph > 7.5
              ? "Alkaline"
              : "Normal"
          }
        />

        <Stat
          icon={<Sun />}
          title="Light"
          value={`${Math.round(sensor.light)} lux`}
          status="Sensor active"
        />
      </div>

      <div style={styles.grid}>
        <Card
          title="Weather Forecast"
          subtitle={weather?.location?.name ? `${weather.location.name} • live forecast service` : "GPS / Coimbatore • live forecast service"}
        >
          <div className="weather-panel">
            <div className="weather-main-icon">
              <CloudSun size={44} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="weather-location">
                <MapPin size={15} />
                {weather?.location?.name ||
                  (location?.source === "browser_geolocation"
                    ? "GPS location"
                    : "Coimbatore fallback")}
              </div>
              <div className="weather-temp">
                {weather?.current?.temperature != null
                  ? `${Number(weather.current.temperature).toFixed(1)}°C`
                  : "—"}
              </div>
              <div className="weather-desc">
                {weather?.current?.condition ||
                  weather?.current?.description ||
                  "Waiting for weather data"}
              </div>
              <div className="weather-current-details">
                <span>💧 Humidity: {weather?.current?.humidity ?? "—"}%</span>
                <span>🌧️ Rain now: {weather?.current?.rain ? "Yes" : "No"}</span>
                <span>🌦️ Precip: {weather?.current?.precipitation ?? 0} mm</span>
              </div>
            </div>
          </div>

          <div className="weather-detail-strip">
            <div>
              <small>Location</small>
              <strong>
                {weather?.location?.name || "Coimbatore"}
              </strong>
            </div>
            <div>
              <small>GPS</small>
              <strong>
                {weather?.location?.latitude != null
                  ? `${Number(weather.location.latitude).toFixed(4)}, ${Number(weather.location.longitude).toFixed(4)}`
                  : "Fallback location"}
              </strong>
            </div>
            <div>
              <small>Forecast source</small>
              <strong>{weather?.source || "Open-Meteo"}</strong>
            </div>
          </div>

          <div className="forecast-row">
            {(weather?.forecast || weather?.daily || []).slice(0, 3).map((day, i) => (
              <div className="forecast-item" key={`${day.date}-${i}`}>
                <Cloud size={20} />
                <strong>{day.day || day.date}</strong>
                <span>{day.condition || "Forecast"}</span>
                <span>{day.rain_probability ?? 0}% rain</span>
                <b>{day.max_c ?? "—"}° / {day.min_c ?? "—"}°</b>
                <small>{day.precipitation ?? 0} mm expected</small>
              </div>
            ))}
          </div>
        </Card>

        <Card
          title="AI Rain Prediction"
          subtitle="Forecast first • sensor fallback if weather is unavailable"
        >
          <div style={styles.big}>
            {rainProbability}%
          </div>

          <p>
            {ai?.rain_prediction?.label ||
              "Waiting for data"}
          </p>

          <div
            style={{
              height: 10,
              background: "#e5e7eb",
              borderRadius: 10,
            }}
          >
            <div
              style={{
                width: `${Math.min(
                  100,
                  Math.max(0, rainProbability)
                )}%`,
                height: "100%",
                background: "#16a34a",
                borderRadius: 10,
              }}
            />
          </div>
        </Card>

        <Card
          title="AI Water Decision"
          subtitle="Automatic irrigation intelligence"
        >
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={styles.big}>
                {aiDecision}
              </div>

              <p>{aiReason}</p>
            </div>

            <Droplets size={42} />
          </div>

          <p>
            <strong>Water need:</strong>{" "}
            {waterNeed}%
          </p>

          {waterInfo.amount && (
            <p>
              <strong>Estimated water:</strong>{" "}
              {waterInfo.amount.toFixed(0)} L
            </p>
          )}

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <button
              className="button-hover"
              style={styles.primary}
              onClick={() => startPump("dashboard_manual")}
              disabled={
                busy || pump.running
              }
            >
              💧{" "}
              {pump.running
                ? "Pump Running"
                : "Start Pump"}
            </button>

            <button
              className="button-hover"
              style={styles.button}
              onClick={() => stopPump("dashboard_manual")}
              disabled={
                busy || !pump.running
              }
            >
              Stop Pump
            </button>
          </div>
        </Card>
      </div>

      <div style={styles.grid}>
        <Card
          title="Fertilizer Recommendation"
          subtitle="AI-assisted crop management"
        >
          <div style={styles.big}>
            {fertilizerInfo.name}
          </div>

          <p>
            {fertilizer?.reason ||
              "No recommendation yet."}
          </p>

          <strong>
            Urgency:{" "}
            {fertilizer?.urgency || "—"}
          </strong>

          {fertilizerInfo.npk && (
            <p>
              <strong>NPK:</strong>{" "}
              {fertilizerInfo.npk}
            </p>
          )}

          {fertilizerInfo.rate > 0 && (
            <p>
              <strong>Rate:</strong>{" "}
              {fertilizerInfo.rate} kg/ha
            </p>
          )}

          {fertilizerInfo.amount && (
            <p>
              <strong>Estimated amount:</strong>{" "}
              {fertilizerInfo.amount.toFixed(2)} kg
            </p>
          )}

          {fertilizerInfo.items && (
            <p>
              <strong>Items:</strong>{" "}
              {Array.isArray(
                fertilizerInfo.items
              )
                ? fertilizerInfo.items.join(", ")
                : fertilizerInfo.items}
            </p>
          )}

          {!fertilizerInfo.rate &&
            !fertilizerInfo.amount && (
              <p style={styles.muted}>
                Exact fertilizer dosing needs
                crop stage, field area and soil
                N/P/K information.
              </p>
            )}
        </Card>

        <Card
          title="AI Alerts"
          subtitle={`${alerts.length} current system events`}
        >
          {alerts.slice(0, 5).map((a, i) => (
            <div
              key={a.id ?? i}
              style={{
                padding: "12px 0",
                borderBottom:
                  "1px solid #eef2ef",
              }}
            >
              <strong>{a.title}</strong>
              <div style={styles.muted}>
                {a.message}
              </div>
            </div>
          ))}

          {!alerts.length && (
            <p>No active alerts.</p>
          )}
        </Card>
      </div>

      <Card
        title="System Intelligence"
        subtitle={`Last sensor update: ${
          sensor.timestamp
            ? new Date(
                sensor.timestamp
              ).toLocaleString()
            : "Waiting"
        }`}
      >
        <div style={styles.grid}>
          <Info
            title="Rain Prediction"
            value={`${rainProbability}%`}
          />
          <Info
            title="Water Need"
            value={`${waterNeed}%`}
          />
          <Info
            title="Pump"
            value={
              pump.running
                ? "RUNNING"
                : "STOPPED"
            }
          />
          <Info
            title="Backend"
            value={
              backendOnline
                ? "ONLINE"
                : "OFFLINE"
            }
          />
        </div>
      </Card>
    </Page>
  );
}

function Monitoring({ sensor, history, refresh }) {
  return (
    <Page>
      <Card
        title="Live Monitoring"
        subtitle="Current sensor values"
        action={
          <button
            style={styles.button}
            onClick={refresh}
          >
            <RefreshCw size={16} /> Refresh
          </button>
        }
      >
        <div style={styles.grid}>
          <Info
            title="Soil Moisture"
            value={`${sensor.soilMoisture}%`}
          />
          <Info
            title="Temperature"
            value={`${sensor.temperature} °C`}
          />
          <Info
            title="Humidity"
            value={`${sensor.humidity}%`}
          />
          <Info
            title="pH"
            value={sensor.ph}
          />
          <Info
            title="Light"
            value={`${sensor.light} lux`}
          />
          <Info
            title="Water Tank"
            value={`${sensor.waterLevel}%`}
          />
          <Info
            title="Rain"
            value={
              sensor.rain ? "YES" : "NO"
            }
          />
        </div>
      </Card>

      <Card
        title="Sensor History"
        subtitle={`${history.length} readings`}
      >
        <Table
          headers={[
            "Time",
            "Soil",
            "Temperature",
            "Humidity",
            "pH",
            "Light",
            "Rain",
          ]}
          rows={history
            .slice()
            .reverse()
            .map((x) => [
              new Date(
                x.timestamp
              ).toLocaleString(),
              `${x.soil_moisture}%`,
              `${x.temperature}°C`,
              `${x.humidity}%`,
              x.ph,
              x.light,
              x.rain ? "Yes" : "No",
            ])}
        />
      </Card>
    </Page>
  );
}

function AIDecisions({
  ai,
  sensor,
  pump,
  fertilizer,
  rainProbability,
  waterNeed,
  aiDecision,
  aiReason,
  fertilizerInfo,
  waterInfo,
}) {
  return (
    <Page>
      <Card
        title="AI Decision Center"
        subtitle="Predictions and automated decisions"
      >
        <div style={styles.grid}>
          <Info
            title="Rain Probability"
            value={`${rainProbability}%`}
          />

          <Info
            title="Water Need"
            value={`${waterNeed}%`}
          />

          <Info
            title="Pump"
            value={
              pump.running
                ? "RUNNING"
                : "STOPPED"
            }
          />

          <Info
            title="Decision"
            value={aiDecision}
          />
        </div>

        <div
          className="ai-reason-box"
          style={{
            marginTop: 20,
            padding: 18,
            background: "#f0fdf4",
            borderRadius: 12,
          }}
        >
          <strong>AI Reason</strong>
          <p>{aiReason}</p>
        </div>
      </Card>

      <Card title="Water Recommendation">
        <div style={styles.grid}>
          <Info
            title="Water Need"
            value={`${waterNeed}%`}
          />

          <Info
            title="Estimated Volume"
            value={
              waterInfo.amount
                ? `${waterInfo.amount.toFixed(
                    0
                  )} L`
                : "Not supplied"
            }
          />

          <Info
            title="Pump"
            value={
              pump.running
                ? "RUNNING"
                : "STOPPED"
            }
          />
        </div>

        <p style={styles.muted}>
          An exact water amount should come
          from a calibrated irrigation rate,
          field area and crop requirement.
        </p>
      </Card>

      <Card title="Fertilizer AI">
        <div style={styles.grid}>
          <Info
            title="Recommended Item"
            value={fertilizerInfo.name}
          />

          <Info
            title="NPK"
            value={
              fertilizerInfo.npk || "Not supplied"
            }
          />

          <Info
            title="Rate"
            value={
              fertilizerInfo.rate
                ? `${fertilizerInfo.rate} kg/ha`
                : "Not supplied"
            }
          />

          <Info
            title="Amount"
            value={
              fertilizerInfo.amount
                ? `${fertilizerInfo.amount.toFixed(
                    2
                  )} kg`
                : "Needs rate/area"
            }
          />
        </div>

        <p>
          <strong>Urgency:</strong>{" "}
          {fertilizer?.urgency || "—"}
        </p>

        <p>{fertilizer?.reason || ""}</p>

        {!fertilizerInfo.rate &&
          !fertilizerInfo.amount && (
            <p style={styles.muted}>
              The current backend does not
              provide an exact dose. Do not
              invent a fertilizer quantity from
              moisture alone; add soil N/P/K,
              crop stage and field area for
              precise recommendations.
            </p>
          )}
      </Card>

      <Card title="Current Inputs">
        <div style={styles.grid}>
          <Info
            title="Soil Moisture"
            value={`${sensor.soilMoisture}%`}
          />
          <Info
            title="Temperature"
            value={`${sensor.temperature}°C`}
          />
          <Info
            title="Humidity"
            value={`${sensor.humidity}%`}
          />
          <Info
            title="pH"
            value={sensor.ph}
          />
          <Info
            title="Rain"
            value={
              sensor.rain
                ? "Detected"
                : "Not detected"
            }
          />
        </div>
      </Card>
    </Page>
  );
}

function Irrigation({
  pump,
  sensor,
  ai,
  history,
  startPump,
  stopPump,
  busy,
  refresh,
}) {
  return (
    <Page>
      <Card
        title="Irrigation Control"
        subtitle="Automatic and manual pump control"
      >
        <div style={styles.grid}>
          <Info
            title="Pump"
            value={
              pump.running
                ? "RUNNING"
                : "STOPPED"
            }
          />

          <Info
            title="Mode"
            value={pump.mode || "AUTO"}
          />

          <Info
            title="Hardware"
            value={
              pump.hardware_enabled
                ? "CONNECTED"
                : "SIMULATION"
            }
          />

          <Info
            title="Water Need"
            value={`${ai?.water_need?.score_percent ?? 0}%`}
          />
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 22,
          }}
        >
          <button
            style={styles.primary}
            onClick={() => startPump("dashboard_manual")}
            disabled={
              busy || pump.running
            }
          >
            Start Pump
          </button>

          <button
            style={styles.button}
            onClick={() => stopPump("dashboard_manual")}
            disabled={
              busy || !pump.running
            }
          >
            Stop Pump
          </button>
        </div>

        <p
          style={{
            ...styles.muted,
            marginTop: 16,
          }}
        >
          Rain:{" "}
          {sensor.rain
            ? "Detected — automatic watering should be blocked"
            : "Not detected"}
        </p>
      </Card>

      <Card
        title="Irrigation History"
        action={
          <button
            style={styles.button}
            onClick={refresh}
          >
            Refresh
          </button>
        }
      >
        <Table
          headers={[
            "Time",
            "Status",
            "Source",
            "Duration",
          ]}
          rows={history
            .slice()
            .reverse()
            .map((x) => [
              new Date(
                x.timestamp
              ).toLocaleString(),
              x.status ||
                (x.running
                  ? "Running"
                  : "Stopped"),
              x.source || "—",
              x.duration_minutes
                ? `${x.duration_minutes} min`
                : "—",
            ])}
        />
      </Card>
    </Page>
  );
}

function Fertilizer({
  fertilizer,
  usage,
  form,
  setForm,
  submit,
  busy,
  refresh,
  fertilizerInfo,
  crop,
  setCrop,
  fieldAreaHa,
  setFieldAreaHa,
}) {
  return (
    <Page>
      <div style={styles.grid}>
        <Card
          title="AI Recommendation"
          subtitle="Crop and soil based recommendation"
        >
          <div style={styles.big}>
            {fertilizerInfo.name}
          </div>

          <p>
            {fertilizer?.reason ||
              "No recommendation yet."}
          </p>

          <strong>
            Urgency:{" "}
            {fertilizer?.urgency || "—"}
          </strong>

          {fertilizerInfo.npk && (
            <p>
              <strong>NPK:</strong>{" "}
              {fertilizerInfo.npk}
            </p>
          )}

          {fertilizerInfo.rate > 0 && (
            <p>
              <strong>Rate:</strong>{" "}
              {fertilizerInfo.rate} kg/ha
            </p>
          )}

          {fertilizerInfo.amount && (
            <p>
              <strong>Estimated amount:</strong>{" "}
              {fertilizerInfo.amount.toFixed(2)} kg
            </p>
          )}

          {fertilizerInfo.items && (
            <p>
              <strong>Items/materials:</strong>{" "}
              {Array.isArray(
                fertilizerInfo.items
              )
                ? fertilizerInfo.items.join(", ")
                : fertilizerInfo.items}
            </p>
          )}

          <p style={styles.muted}>
            Field area used for planning:
            {" "}
            {fieldAreaHa} ha
          </p>
        </Card>

        <Card title="Farm Information">
          <div
            style={{
              display: "grid",
              gap: 12,
            }}
          >
            <label>
              Crop
              <input
                value={crop}
                onChange={(e) =>
                  setCrop(e.target.value)
                }
                style={inputStyle}
              />
            </label>

            <label>
              Field Area (ha)
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={fieldAreaHa}
                onChange={(e) =>
                  setFieldAreaHa(
                    Number(e.target.value)
                  )
                }
                style={inputStyle}
              />
            </label>
          </div>
        </Card>

        <Card title="Record Fertilizer Use">
          <form
            onSubmit={submit}
            style={{
              display: "grid",
              gap: 12,
            }}
          >
            <label>
              Fertilizer
              <input
                value={form.fertilizer}
                onChange={(e) =>
                  setForm({
                    ...form,
                    fertilizer: e.target.value,
                  })
                }
                style={inputStyle}
              />
            </label>

            <label>
              Amount (kg)
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.amount_kg}
                onChange={(e) =>
                  setForm({
                    ...form,
                    amount_kg: e.target.value,
                  })
                }
                style={inputStyle}
              />
            </label>

            <label>
              Crop
              <input
                value={form.crop}
                onChange={(e) =>
                  setForm({
                    ...form,
                    crop: e.target.value,
                  })
                }
                style={inputStyle}
              />
            </label>

            <label>
              Field
              <input
                value={form.field}
                onChange={(e) =>
                  setForm({
                    ...form,
                    field: e.target.value,
                  })
                }
                style={inputStyle}
              />
            </label>

            <label>
              Notes
              <textarea
                value={form.notes}
                onChange={(e) =>
                  setForm({
                    ...form,
                    notes: e.target.value,
                  })
                }
                style={inputStyle}
              />
            </label>

            <button
              className="button-hover"
              style={styles.primary}
              disabled={busy}
            >
              Record Usage
            </button>
          </form>
        </Card>
      </div>

      <Card
        title="Fertilizer Usage"
        subtitle={`${usage.count} records • ${usage.total_kg} kg total`}
        action={
          <button
            style={styles.button}
            onClick={refresh}
          >
            Refresh
          </button>
        }
      >
        <Table
          headers={[
            "Time",
            "Fertilizer",
            "Amount",
            "Crop",
            "Field",
            "Notes",
          ]}
          rows={usage.data
            .slice()
            .reverse()
            .map((x) => [
              x.timestamp
                ? new Date(
                    x.timestamp
                  ).toLocaleString()
                : "—",
              x.fertilizer || "—",
              `${x.amount_kg ?? 0} kg`,
              x.crop || "General",
              x.field || "Farm Alpha",
              x.notes || "",
            ])}
        />
      </Card>
    </Page>
  );
}

function Alerts({ alerts, sensor }) {
  return (
    <Page>
      <Card
        title="Alerts"
        subtitle="AI and system events"
      >
        <div
          style={{
            display: "grid",
            gap: 10,
          }}
        >
          {alerts.length ? (
            alerts.map((a, i) => (
              <div
                key={a.id ?? i}
                style={{
                  padding: 16,
                  border:
                    "1px solid #e5e7eb",
                  borderRadius: 12,
                }}
              >
                <strong>
                  {a.title}
                </strong>

                <p
                  style={{
                    margin: "6px 0",
                    ...styles.muted,
                  }}
                >
                  {a.message}
                </p>

                <small>
                  {a.timestamp
                    ? new Date(
                        a.timestamp
                      ).toLocaleString()
                    : ""}
                </small>
              </div>
            ))
          ) : (
            <p>No active alerts.</p>
          )}
        </div>
      </Card>

      <Card title="Current Safety State">
        <p>
          Rain:{" "}
          <strong>
            {sensor.rain
              ? "Detected — automatic irrigation blocked"
              : "Not detected"}
          </strong>
        </p>

        <p>
          Soil moisture:{" "}
          <strong>
            {sensor.soilMoisture}%
          </strong>
        </p>
      </Card>
    </Page>
  );
}

function SettingsPage({
  backendOnline,
  autoIrrigation,
  setAutoIrrigation,
  refreshSeconds,
  setRefreshSeconds,
  reload,
  crop,
  setCrop,
  fieldAreaHa,
  setFieldAreaHa,
  requestNotificationPermission,
}) {
  return (
    <Page>
      <Card
        title="System Settings"
        subtitle="Local dashboard controls"
      >
        <label style={settingRow}>
          <span>
            <strong>
              Automatic irrigation
            </strong>
            <br />
            <small style={styles.muted}>
              Allow AI decisions to control
              the pump.
            </small>
          </span>

          <input
            type="checkbox"
            checked={autoIrrigation}
            onChange={(e) =>
              setAutoIrrigation(
                e.target.checked
              )
            }
          />
        </label>

        <label style={settingRow}>
          <span>
            <strong>
              Refresh interval
            </strong>
          </span>

          <select
            value={refreshSeconds}
            onChange={(e) =>
              setRefreshSeconds(
                Number(e.target.value)
              )
            }
          >
            <option value={1}>
              1 second
            </option>
            <option value={3}>
              3 seconds
            </option>
            <option value={5}>
              5 seconds
            </option>
            <option value={10}>
              10 seconds
            </option>
          </select>
        </label>

        <label style={settingRow}>
          <span>
            <strong>Crop</strong>
          </span>

          <input
            value={crop}
            onChange={(e) =>
              setCrop(e.target.value)
            }
            style={inputStyleSmall}
          />
        </label>

        <label style={settingRow}>
          <span>
            <strong>
              Field area (ha)
            </strong>
          </span>

          <input
            type="number"
            min="0.01"
            step="0.01"
            value={fieldAreaHa}
            onChange={(e) =>
              setFieldAreaHa(
                Number(e.target.value)
              )
            }
            style={inputStyleSmall}
          />
        </label>

        <p>
          Backend:{" "}
          <strong>
            {backendOnline
              ? "ONLINE"
              : "OFFLINE"}
          </strong>
        </p>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button
            style={styles.primary}
            onClick={reload}
          >
            Test / Refresh Backend
          </button>

          <button
            style={styles.button}
            onClick={
              requestNotificationPermission
            }
          >
            <BellRing size={16} /> Enable
            Notifications
          </button>
        </div>
      </Card>

      <Card title="Architecture">
        <p style={styles.muted}>
          Real sensor hardware only needs to
          POST readings to{" "}
          <code>/api/sensors</code>. The
          dashboard reads the backend APIs.
          This keeps future ESP32/sensor
          integration separate from the
          frontend.
        </p>
      </Card>
    </Page>
  );
}

const inputStyle = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  marginTop: 6,
  padding: "10px 12px",
  border: "1px solid #cbd5d1",
  borderRadius: 9,
};

const inputStyleSmall = {
  padding: "8px 10px",
  border: "1px solid #cbd5d1",
  borderRadius: 8,
};

const settingRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 20,
  padding: "14px 0",
};
