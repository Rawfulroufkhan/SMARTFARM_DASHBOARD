const API_BASE = "http://127.0.0.1:8000";

async function request(endpoint, options = {}) {const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {"Content-Type": "application/json",...(options.headers || {}),
    },
    ...options,});

if (!response.ok) {
    throw new Error(`API Error ${response.status}: ${response.statusText}`
    );}

return response.json();
}

// ===============================
// SENSOR APIs
// ===============================

export async function getSensorData() {
return request("/api/sensors");
}

export async function getSensorHistory() {
return request("/api/sensors/history");
}

// ===============================
// AI APIs
// ===============================

export async function getIrrigationRecommendation() {
return request("/api/ai/irrigation");
}

// ===============================
// IRRIGATION APIs
// ===============================

export async function getIrrigationStatus() {
return request("/api/irrigation");
}

export async function startIrrigation(minutes = 10) {
return request("/api/irrigation/start", {
    method: "POST",
    body: JSON.stringify({duration_minutes: minutes,
    }),
});
}

export async function stopIrrigation() {
return request("/api/irrigation/stop", {
    method: "POST",
    body: JSON.stringify({}),
});
}

export async function getIrrigationHistory() {
  return request("/api/irrigation/history");
}

// ===============================
// FERTILIZER APIs
// ===============================

export async function getFertilizerRecommendation() {
  return request("/api/fertilizer/recommendation");
}

export async function recordFertilizerUse(data) {
  return request("/api/fertilizer/use", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getFertilizerUsage() {
  return request("/api/fertilizer/usage");
}

// ===============================
// ALERT APIs
// ===============================

export async function getAlerts() {
  return request("/api/alerts");
}

// ===============================
// SYSTEM STATUS
// ===============================

export async function getSystemStatus() {
  return request("/api/status");
}