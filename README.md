# 🅿️ Sistema de Estacionamiento Automático

Sistema de control de acceso vehicular con reconocimiento de placas, control de barrera física y panel web de administración.

## 📁 Estructura del Proyecto

```
├── web-app/          → Aplicación Next.js (deploy en Vercel)
└── esp32-firmware/   → Código Arduino para ESP32
```

---

## 🚀 Guía de Despliegue (GitHub → Vercel)

### Paso 1 — Instalar herramientas necesarias

Descarga e instala las siguientes herramientas:

| Herramienta | URL | Para qué |
|---|---|---|
| **Node.js** (LTS) | https://nodejs.org | Ejecutar la app localmente |
| **Git** | https://git-scm.com | Subir el código a GitHub |

Después de instalar, **cierra y vuelve a abrir** la terminal/PowerShell para que los comandos funcionen.

Verifica la instalación:
```powershell
node --version
git --version
```

---

### Paso 2 — Inicializar el repositorio Git y subir a GitHub

Abre **PowerShell** o la terminal en la carpeta raíz del proyecto y ejecuta:

```powershell
# Ir a la carpeta del proyecto
cd "d:\Fabricio\Pasantias\Sistema de estacionamiento"

# Inicializar git
git init

# Agregar todos los archivos
git add .

# Primer commit
git commit -m "feat: sistema de estacionamiento automatico inicial"

# Conectar con tu repositorio en GitHub
git remote add origin https://github.com/edwardfqj/webestacionamiento.git

# Subir el código
git push -u origin main
```

> ⚠️ Si pide usuario y contraseña de GitHub, usa tu usuario y un **Personal Access Token** (no la contraseña). 
> Puedes crear uno en: GitHub → Settings → Developer settings → Personal access tokens

---

### Paso 3 — Conectar el repositorio a Vercel

1. Ve a https://vercel.com e inicia sesión con tu cuenta de GitHub
2. Haz clic en **"Add New Project"**
3. Selecciona el repositorio **`webestacionamiento`**
4. En **"Root Directory"** escribe: `web-app` ← ¡IMPORTANTE!
5. Haz clic en **"Deploy"**

> ℹ️ Vercel detectará automáticamente que es un proyecto Next.js

---

### Paso 4 — Crear la Base de Datos en Vercel

1. En el Dashboard de Vercel → ve a la pestaña **"Storage"**
2. Haz clic en **"Create Database"** → selecciona **"Postgres"** (Neon)
3. Sigue los pasos y **conecta la base de datos a tu proyecto**
4. Ve a tu base de datos → pestaña **"Query"**
5. Copia y ejecuta el contenido del archivo `web-app/database/schema.sql`

---

### Paso 5 — Configurar Variables de Entorno en Vercel

1. En Vercel → tu proyecto → **"Settings"** → **"Environment Variables"**
2. Agrega esta variable:
   - **Name:** `ESP32_API_KEY`
   - **Value:** `mi-clave-secreta-123` (o cualquier cadena secreta que quieras)
3. Las variables de la base de datos se agregan automáticamente al conectar Postgres

---

### Paso 6 — Hacer el primer deploy

Después de configurar las variables, ve a **"Deployments"** → haz clic en los tres puntos del último deploy → **"Redeploy"**.

Tu app estará disponible en: `https://webestacionamiento.vercel.app` (o similar)

---

### Paso 7 — Instalar dependencias y probar localmente (opcional)

```powershell
cd "d:\Fabricio\Pasantias\Sistema de estacionamiento\web-app"
npm install
npm run dev
```

Abre: http://localhost:3000

> Para esto necesitas copiar las variables de entorno de Vercel a un archivo `.env.local` en `web-app/`

---

### Paso 8 — Configurar el ESP32

1. Abre **Arduino IDE**
2. Instala el soporte para ESP32: https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html
3. Instala las librerías desde Library Manager:
   - `ESP32Servo`
   - `ArduinoJson` (versión 7.x)
4. Abre el archivo `esp32-firmware/parking_system/parking_system.ino`
5. Edita estas líneas con tus datos:
   ```cpp
   const char* WIFI_SSID     = "TU_RED_WIFI";
   const char* WIFI_PASSWORD = "TU_CONTRASEÑA_WIFI";
   const char* SERVER_URL    = "https://webestacionamiento.vercel.app";  // URL de Vercel
   const char* API_KEY       = "mi-clave-secreta-123";                   // Tu API key
   ```
6. Selecciona tu placa **ESP32** y el puerto COM correcto
7. Haz clic en **Subir** (→)

---

## 🔄 Actualizar el código en el futuro

Cada vez que hagas un cambio en el código, sube los cambios a GitHub y Vercel hará el deploy automáticamente:

```powershell
cd "d:\Fabricio\Pasantias\Sistema de estacionamiento"
git add .
git commit -m "descripcion del cambio"
git push
```

---

## 🔌 Diagrama de Conexiones ESP32

```
ESP32          Componente
──────────────────────────
GPIO 18    →   Servo (señal PWM)
GPIO 5     →   HC-SR04 TRIG
GPIO 4     →   HC-SR04 ECHO
GPIO 15    →   Pulsador (otro pin → GND)
GPIO 2     →   LED interno (ya integrado)
GND        →   GND de todos los componentes
3.3V / 5V  →   VCC servo y HC-SR04
```

> ⚠️ El servomotor puede necesitar 5V — conecta el VCC del servo al pin de 5V del ESP32
> y asegúrate de compartir GND.

---

## 📱 Uso del Sistema

| Función | URL |
|---|---|
| Panel de administración | `https://webestacionamiento.vercel.app/` |
| Escáner de placas (celular) | `https://webestacionamiento.vercel.app/scan` |

### Flujo de acceso:
1. Abre `/scan` en tu celular
2. Presiona **"Abrir Cámara"**
3. Apunta la cámara a la placa del vehículo
4. Presiona **"Capturar Placa"**
5. El sistema verifica el pago y abre la barrera automáticamente

### Override manual:
- Presiona el pulsador físico en el ESP32 para abrir la barrera sin verificar placa

---

## 🗄️ Base de Datos

### Tabla `clientes`
| Campo | Tipo | Descripción |
|---|---|---|
| id | SERIAL | ID único |
| cedula | VARCHAR(20) | Número de cédula |
| nombre | VARCHAR(100) | Nombre completo |
| placa | VARCHAR(10) | Placa del vehículo |
| pagado | BOOLEAN | Estado de pago |

### Tabla `accesos`
Registra cada intento de acceso con fecha, placa, resultado y método.
