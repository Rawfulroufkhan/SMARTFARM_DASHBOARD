@"
# 🌱 SmartFarm — AI Agriculture Ecosystem

An intelligent agriculture monitoring and decision-support system that combines **IoT sensors, AI-based decision making, real-time monitoring, automated irrigation, weather information, plant disease detection, and a voice-enabled chatbot** into a single web dashboard.

---

## 🚀 Project Overview

SmartFarm is designed to help farmers monitor field conditions and make better irrigation and agricultural decisions using real-time sensor data.

The system consists of:

- 🌱 Soil moisture monitoring
- 🌡️ Temperature monitoring
- 💧 Humidity monitoring
- 🌧️ Rain detection
- 🧪 Soil/environment parameter monitoring
- 💦 Automated irrigation control
- 🌾 Fertilizer monitoring
- 🤖 AI-based agricultural recommendations
- 🌿 Plant disease detection
- 🎙️ Voice-enabled chatbot assistant
- 📊 Real-time web dashboard
- 📡 ESP32/IoT integration
- 🧪 Wokwi simulation support
- 🌦️ Weather information
- 🚨 Alert and system-status monitoring

---

# 🏗️ System Architecture

```text
                    ┌──────────────────────┐
                    │      ESP32 / IoT     │
                    │                      │
                    │ Sensors + Relay      │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   Wokwi / Hardware   │
                    │      Simulation      │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │    FastAPI Backend   │
                    │      Python          │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
       Sensor Processing   AI Decisions    Irrigation API
              │                │                │
              └────────────────┼────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │    React Dashboard   │
                    │       Vite           │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
          Monitoring       AI Advice       Voice Chatbot
