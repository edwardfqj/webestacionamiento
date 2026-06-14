/*
 * ============================================================
 * SISTEMA DE ESTACIONAMIENTO AUTOMÁTICO
 * Firmware para ESP32
 * 
 * Componentes:
 *   - Servomotor (barrera)      → GPIO 18
 *   - HC-SR04 TRIG              → GPIO 5
 *   - HC-SR04 ECHO              → GPIO 4
 *   - Pulsador de override      → GPIO 15 (con pull-up interno)
 *   - LED indicador (opcional)  → GPIO 2 (LED interno ESP32)
 * 
 * Librerías requeridas (instalar en Arduino IDE):
 *   - ESP32Servo   (búscala en Library Manager)
 *   - HTTPClient   (incluida con ESP32)
 *   - ArduinoJson  (v7.x, buscar en Library Manager)
 * 
 * ============================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>

// ============================================================
// CONFIGURACIÓN - EDITAR ESTOS VALORES
// ============================================================
const char* WIFI_SSID     = "TU_RED_WIFI";           // Nombre de tu red WiFi
const char* WIFI_PASSWORD = "TU_CONTRASEÑA_WIFI";    // Contraseña de tu red WiFi

// URL de tu app en Vercel (sin / al final)
const char* SERVER_URL    = "https://tu-app.vercel.app";

// API Key (debe coincidir con ESP32_API_KEY en las variables de entorno de Vercel)
const char* API_KEY       = "mi-clave-secreta-123";

// ============================================================
// PINES
// ============================================================
#define PIN_SERVO         18    // Señal PWM del servomotor
#define PIN_ULTRASONIC_TRIG  5  // Trigger del HC-SR04
#define PIN_ULTRASONIC_ECHO  4  // Echo del HC-SR04
#define PIN_BUTTON        15    // Pulsador de override manual
#define PIN_LED           2     // LED indicador (LED interno ESP32)

// ============================================================
// PARÁMETROS DEL SISTEMA
// ============================================================
#define SERVO_OPEN_ANGLE    90    // Ángulo del servo para barrera ABIERTA (ajustar según tu servo)
#define SERVO_CLOSE_ANGLE   0     // Ángulo del servo para barrera CERRADA
#define GATE_OPEN_TIME      10000 // Tiempo que permanece abierta la barrera (ms) = 10 segundos
#define OBSTACLE_DISTANCE   30    // Distancia en cm para considerar que hay un auto (< 30cm = hay auto)
#define POLL_INTERVAL       1000  // Intervalo de polling a la API (ms)
#define ULTRASONIC_SAMPLES  3     // Número de mediciones para promediar

// ============================================================
// VARIABLES GLOBALES
// ============================================================
Servo barrierServo;
bool gateIsOpen = false;
unsigned long gateOpenedAt = 0;
unsigned long lastPollTime = 0;
int buttonLastState = HIGH;

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n============================================");
  Serial.println("  Sistema de Estacionamiento - ESP32");
  Serial.println("============================================\n");

  // Configurar pines
  pinMode(PIN_ULTRASONIC_TRIG, OUTPUT);
  pinMode(PIN_ULTRASONIC_ECHO, INPUT);
  pinMode(PIN_BUTTON, INPUT_PULLUP);  // Pull-up interno: LOW cuando se presiona
  pinMode(PIN_LED, OUTPUT);

  // Inicializar servo
  barrierServo.attach(PIN_SERVO, 500, 2400);  // 500µs - 2400µs (ajustar si es necesario)
  closeGate();  // Asegurarse que la barrera esté cerrada al inicio

  // Parpadeo inicial del LED
  for (int i = 0; i < 3; i++) {
    digitalWrite(PIN_LED, HIGH);
    delay(200);
    digitalWrite(PIN_LED, LOW);
    delay(200);
  }

  // Conectar WiFi
  connectWiFi();
}

// ============================================================
// LOOP PRINCIPAL
// ============================================================
void loop() {
  // 1. Verificar conexión WiFi
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI] Conexión perdida, reconectando...");
    connectWiFi();
    return;
  }

  // 2. Verificar pulsador de override manual
  int buttonState = digitalRead(PIN_BUTTON);
  if (buttonState == LOW && buttonLastState == HIGH) {
    // Botón presionado (flanco descendente)
    Serial.println("[BUTTON] Pulsador presionado → Apertura manual");
    if (!gateIsOpen) {
      openGate("pulsador");
    }
    delay(50);  // Debounce
  }
  buttonLastState = buttonState;

  // 3. Si la barrera está abierta, manejar la lógica de cierre
  if (gateIsOpen) {
    manageOpenGate();
    return;
  }

  // 4. Polling a la API (solo si la barrera está cerrada)
  unsigned long now = millis();
  if (now - lastPollTime >= POLL_INTERVAL) {
    lastPollTime = now;
    pollGateStatus();
  }
}

// ============================================================
// CONECTAR WIFI
// ============================================================
void connectWiFi() {
  Serial.printf("[WIFI] Conectando a %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
    // Parpadeo rápido mientras conecta
    digitalWrite(PIN_LED, !digitalRead(PIN_LED));
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WIFI] ✓ Conectado!");
    Serial.printf("[WIFI] IP: %s\n", WiFi.localIP().toString().c_str());
    digitalWrite(PIN_LED, HIGH);  // LED encendido = conectado
  } else {
    Serial.println("\n[WIFI] ✗ Error al conectar. Reiniciando en 5s...");
    delay(5000);
    ESP.restart();
  }
}

// ============================================================
// POLLING A LA API DE VERCEL
// ============================================================
void pollGateStatus() {
  HTTPClient http;
  String url = String(SERVER_URL) + "/api/gate-status";

  http.begin(url);
  http.addHeader("x-api-key", API_KEY);
  http.setTimeout(5000);

  int httpCode = http.GET();

  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();

    // Parsear JSON
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, payload);

    if (!error) {
      bool shouldOpen = doc["open"].as<bool>();
      const char* placa = doc["placa"] | "";

      if (shouldOpen) {
        Serial.printf("[API] Barrera debe abrirse — Placa: %s\n", placa);
        openGate("camara");
      } else {
        Serial.println("[API] Barrera cerrada — sin vehículo autorizado");
      }
    } else {
      Serial.printf("[API] Error parseando JSON: %s\n", error.c_str());
    }
  } else if (httpCode == 401) {
    Serial.println("[API] Error 401: API Key incorrecta");
  } else {
    Serial.printf("[API] Error HTTP: %d\n", httpCode);
  }

  http.end();
}

// ============================================================
// ABRIR LA BARRERA
// ============================================================
void openGate(String method) {
  Serial.println("[GATE] 🔓 Abriendo barrera...");

  // Mover servo a posición abierta
  barrierServo.write(SERVO_OPEN_ANGLE);
  delay(500);  // Dar tiempo al servo para moverse

  gateIsOpen = true;
  gateOpenedAt = millis();

  // Encender LED con parpadeo
  Serial.printf("[GATE] Barrera abierta por %d segundos\n", GATE_OPEN_TIME / 1000);
}

// ============================================================
// CERRAR LA BARRERA
// ============================================================
void closeGate() {
  Serial.println("[GATE] 🔒 Cerrando barrera...");
  barrierServo.write(SERVO_CLOSE_ANGLE);
  delay(500);

  gateIsOpen = false;

  // Notificar al servidor que la barrera fue cerrada
  notifyGateClosed();

  digitalWrite(PIN_LED, HIGH);  // LED fijo = normal
  Serial.println("[GATE] Barrera cerrada correctamente");
}

// ============================================================
// MANEJO DE BARRERA ABIERTA
// Verificar tiempo y sensor ultrasónico
// ============================================================
void manageOpenGate() {
  // Parpadeo del LED mientras está abierta
  static unsigned long lastLedBlink = 0;
  if (millis() - lastLedBlink > 300) {
    digitalWrite(PIN_LED, !digitalRead(PIN_LED));
    lastLedBlink = millis();
  }

  // ¿Ya pasaron los 10 segundos?
  unsigned long elapsed = millis() - gateOpenedAt;
  if (elapsed >= GATE_OPEN_TIME) {
    Serial.println("[GATE] Tiempo cumplido. Verificando si hay auto...");

    float distance = measureDistance();
    Serial.printf("[SENSOR] Distancia medida: %.1f cm\n", distance);

    if (distance < OBSTACLE_DISTANCE && distance > 0) {
      // HAY AUTO EN LA MITAD — NO CERRAR
      Serial.printf("[SENSOR] ⚠️  Auto detectado a %.1f cm — Manteniendo barrera abierta\n", distance);
      // Reiniciar temporizador para volver a verificar en 2 segundos
      gateOpenedAt = millis() - (GATE_OPEN_TIME - 2000);
    } else {
      // CAMINO LIBRE — CERRAR
      Serial.println("[SENSOR] ✓ Camino libre — Cerrando barrera");
      closeGate();
    }
  }
}

// ============================================================
// MEDIR DISTANCIA CON HC-SR04
// Retorna distancia en cm (-1 si error)
// ============================================================
float measureDistance() {
  float totalDistance = 0;
  int validReadings = 0;

  for (int i = 0; i < ULTRASONIC_SAMPLES; i++) {
    // Enviar pulso de 10µs
    digitalWrite(PIN_ULTRASONIC_TRIG, LOW);
    delayMicroseconds(2);
    digitalWrite(PIN_ULTRASONIC_TRIG, HIGH);
    delayMicroseconds(10);
    digitalWrite(PIN_ULTRASONIC_TRIG, LOW);

    // Medir duración del echo
    long duration = pulseIn(PIN_ULTRASONIC_ECHO, HIGH, 30000);  // Timeout 30ms

    if (duration > 0) {
      float distance = (duration * 0.0343) / 2;  // cm
      if (distance > 0 && distance < 400) {       // Rango válido: 0-400 cm
        totalDistance += distance;
        validReadings++;
      }
    }

    delay(50);  // Pequeña pausa entre mediciones
  }

  if (validReadings == 0) return -1.0;  // Error de lectura
  return totalDistance / validReadings;
}

// ============================================================
// NOTIFICAR AL SERVIDOR QUE LA BARRERA FUE CERRADA
// ============================================================
void notifyGateClosed() {
  HTTPClient http;
  String url = String(SERVER_URL) + "/api/gate-status";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", API_KEY);
  http.setTimeout(5000);

  int httpCode = http.POST("{}");

  if (httpCode == HTTP_CODE_OK) {
    Serial.println("[API] ✓ Servidor notificado: barrera cerrada");
  } else {
    Serial.printf("[API] Error notificando cierre: %d\n", httpCode);
  }

  http.end();
}
