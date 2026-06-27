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

#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <esp_wifi.h>
#if __has_include("esp_eap_client.h")
#include "esp_eap_client.h" // ESP32 Core v3.x+ (Elimina el aviso deprecated)
#else
#include "esp_wpa2.h"       // ESP32 Core v2.x
#endif

// ============================================================
// CONFIGURACIÓN DE RED WIFI (Elige Normal o Universitaria)
// ============================================================
// Descomenta (quita las //) de la siguiente línea si vas a usar WiFi de Universidad con Usuario/Contraseña:
#define WIFI_UNIVERSIDAD

#ifdef WIFI_UNIVERSIDAD
  const char *WIFI_SSID    = "UCE";       // Nombre de la red WiFi de la universidad
  const char *EAP_IDENTITY = "ceduque@uce.edu.ec";     // Identidad anónima o correo institucional
  const char *EAP_USERNAME = "ceduque";                // Tu usuario institucional
  const char *EAP_PASSWORD = "cedm2022*";          // Contraseña del correo/universidad
#else
  const char *WIFI_SSID     = "Galaxy A316AF9";        // Nombre de tu red WiFi normal
  const char *WIFI_PASSWORD = "lufx0428";              // Contraseña de tu red WiFi normal
#endif

// URL de tu servidor en Vercel (Internet)
const char *SERVER_URL = "https://webestacionamiento-six.vercel.app";

// API Key (debe coincidir con ESP32_API_KEY en las variables de entorno de
// Vercel)
const char *API_KEY = "clinica2026";

// ============================================================
// PINES
// ============================================================
#define PIN_SERVO 18          // Señal PWM del servomotor
#define PIN_ULTRASONIC_TRIG 5 // Trigger del HC-SR04
#define PIN_ULTRASONIC_ECHO 4 // Echo del HC-SR04
#define PIN_BUTTON 15         // Pulsador de override manual
#define PIN_LED 2             // LED indicador (LED interno ESP32)

// ============================================================
// PARÁMETROS DEL SISTEMA
// ============================================================
// CONFIGURACIÓN PARA SERVO (180 Grados Estándar)
#define SERVO_OPEN_ANGLE 90  // Ángulo exacto para barrera abierta
#define SERVO_CLOSE_ANGLE 10 // Ángulo exacto para barrera cerrada

#define GATE_OPEN_TIME                                                         \
  5000 // Tiempo que permanece abierta la barrera (ms) = 10 segundos
#define OBSTACLE_DISTANCE                                                      \
  10 // Distancia en cm para considerar que hay un auto (0 a 10cm = hay auto)
#define POLL_INTERVAL 1000   // Intervalo de polling a la API (ms)
#define ULTRASONIC_SAMPLES 3 // Número de mediciones para promediar

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
  pinMode(PIN_BUTTON, INPUT_PULLUP); // Pull-up interno: LOW cuando se presiona
  pinMode(PIN_LED, OUTPUT);

  // Conectar WiFi PRIMERO antes de intentar enviar peticiones HTTP
  connectWiFi();

  // Inicializar servo
  barrierServo.attach(PIN_SERVO, 500, 2400);
  closeGate(); // Asegurarse que la barrera esté cerrada al inicio

  // Parpadeo inicial del LED
  for (int i = 0; i < 3; i++) {
    digitalWrite(PIN_LED, HIGH);
    delay(200);
    digitalWrite(PIN_LED, LOW);
    delay(200);
  }
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
    delay(50); // Debounce
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
  Serial.printf("[WIFI] Conectando a %s...\n", WIFI_SSID);
  WiFi.disconnect(true);
  WiFi.mode(WIFI_STA);

#ifdef WIFI_UNIVERSIDAD
  Serial.println("[WIFI] Configurando autenticación WPA2 Enterprise (Universidad)...");
  
  // Si EAP_IDENTITY está vacío "", usamos EAP_USERNAME por defecto (vital en servidores RADIUS universitarios como UCE)
  const char* id_to_use = (strlen(EAP_IDENTITY) > 0) ? EAP_IDENTITY : EAP_USERNAME;
  
#if __has_include("esp_eap_client.h")
  esp_eap_client_clear_identity();
  esp_eap_client_set_identity((uint8_t *)id_to_use, strlen(id_to_use));
  esp_eap_client_set_username((uint8_t *)EAP_USERNAME, strlen(EAP_USERNAME));
  esp_eap_client_set_password((uint8_t *)EAP_PASSWORD, strlen(EAP_PASSWORD));
  esp_wifi_sta_enterprise_enable();
#else
  esp_wifi_sta_wpa2_ent_clear_identity();
  esp_wifi_sta_wpa2_ent_set_identity((uint8_t *)id_to_use, strlen(id_to_use));
  esp_wifi_sta_wpa2_ent_set_username((uint8_t *)EAP_USERNAME, strlen(EAP_USERNAME));
  esp_wifi_sta_wpa2_ent_set_password((uint8_t *)EAP_PASSWORD, strlen(EAP_PASSWORD));
  esp_wifi_sta_wpa2_ent_enable();
#endif
  
  WiFi.begin(WIFI_SSID);
#else
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
#endif

  int attempts = 0;
  // Las redes universitarias (802.1X RADIUS) tardan más en negociar los certificados, damos 25 segundos (50 intentos)
  while (WiFi.status() != WL_CONNECTED && attempts < 50) {
    delay(500);
    Serial.print(".");
    attempts++;
    digitalWrite(PIN_LED, !digitalRead(PIN_LED));
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WIFI] ✓ Conectado!");
    Serial.printf("[WIFI] IP: %s\n", WiFi.localIP().toString().c_str());
    digitalWrite(PIN_LED, HIGH); // LED encendido = conectado
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
  String serverStr = String(SERVER_URL);
  if (serverStr.endsWith("/")) {
    serverStr = serverStr.substring(0, serverStr.length() - 1);
  }
  String url = serverStr + "/api/gate-status";

  WiFiClientSecure client;
  client.setInsecure(); // Permitir HTTPS sin certificado fijo
  HTTPClient http;

  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  http.begin(client, url);
  http.addHeader("x-api-key", API_KEY);
  http.setTimeout(8000);

  int httpCode = http.GET();

  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();

    // Parsear JSON
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, payload);

    if (!error) {
      bool shouldOpen = doc["open"].as<bool>();
      const char *placa = doc["placa"] | "";

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
    Serial.printf("[API] Error HTTP GET: %d\n", httpCode);
  }

  http.end();
}

// ============================================================
// ABRIR LA BARRERA
// ============================================================
void openGate(String method) {
  Serial.println("[GATE] 🔓 Abriendo barrera...");

  // Servo 180: Ir al ángulo exacto
  barrierServo.attach(PIN_SERVO, 500, 2400);
  barrierServo.write(SERVO_OPEN_ANGLE);
  delay(500); // Darle medio segundo para llegar a la posición

  gateIsOpen = true;
  gateOpenedAt = millis();

  // Notificar al servidor que la barrera fue abierta manualmente o por cámara
  notifyGateStatus("open", method);

  // Encender LED con parpadeo
  Serial.printf("[GATE] Barrera abierta por %d segundos\n",
                GATE_OPEN_TIME / 1000);
}

// ============================================================
// CERRAR LA BARRERA
// ============================================================
void closeGate() {
  Serial.println("[GATE] 🔒 Cerrando barrera...");

  // Servo 180: Ir al ángulo exacto
  barrierServo.attach(PIN_SERVO, 500, 2400);
  barrierServo.write(SERVO_CLOSE_ANGLE);
  delay(500); // Darle medio segundo para llegar a la posición

  gateIsOpen = false;

  // Notificar al servidor que la barrera fue cerrada
  notifyGateStatus("closed", "sensor");

  digitalWrite(PIN_LED, HIGH); // LED fijo = normal
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

    if (distance <= OBSTACLE_DISTANCE && distance > 0) {
      // HAY AUTO EN LA MITAD — NO CERRAR
      Serial.printf("[SENSOR] ⚠️  Auto detectado a %.1f cm — Manteniendo "
                    "barrera abierta\n",
                    distance);
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
    long duration = pulseIn(PIN_ULTRASONIC_ECHO, HIGH, 30000); // Timeout 30ms

    if (duration > 0) {
      float distance = (duration * 0.0343) / 2; // cm
      if (distance > 0 && distance < 400) {     // Rango válido: 0-400 cm
        totalDistance += distance;
        validReadings++;
      }
    }

    delay(50); // Pequeña pausa entre mediciones
  }

  if (validReadings == 0)
    return -1.0; // Error de lectura
  return totalDistance / validReadings;
}

// ============================================================
// NOTIFICAR AL SERVIDOR EL ESTADO DE LA BARRERA
// ============================================================
void notifyGateStatus(String status, String method) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[API] No se pudo notificar estado, WiFi desconectado");
    return;
  }

  String serverStr = String(SERVER_URL);
  if (serverStr.endsWith("/")) {
    serverStr = serverStr.substring(0, serverStr.length() - 1);
  }
  String url = serverStr + "/api/gate-status";

  WiFiClientSecure client;
  client.setInsecure(); // Permitir HTTPS sin certificado fijo
  HTTPClient http;

  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", API_KEY);
  http.setTimeout(8000);

  // Crear JSON a mano para máxima eficiencia
  String payload =
      "{\"status\":\"" + status + "\",\"method\":\"" + method + "\"}";
  int httpCode = http.POST(payload);

  if (httpCode == HTTP_CODE_OK) {
    Serial.printf("[API] ✓ Servidor notificado: barrera %s\n", status.c_str());
  } else {
    Serial.printf("[API] Error notificando estado HTTP POST: %d\n", httpCode);
  }

  http.end();
}
