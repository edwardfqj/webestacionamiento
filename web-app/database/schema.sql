-- ============================================================
-- SISTEMA DE ESTACIONAMIENTO - Schema de Base de Datos
-- Ejecutar este script en Vercel Postgres (Neon) una sola vez
-- ============================================================

-- Tabla de clientes / vehículos registrados
CREATE TABLE IF NOT EXISTS clientes (
  id          SERIAL PRIMARY KEY,
  cedula      VARCHAR(20)  UNIQUE NOT NULL,
  nombre      VARCHAR(100) NOT NULL,
  placa       VARCHAR(10)  UNIQUE NOT NULL,
  pagado      BOOLEAN      DEFAULT FALSE,
  created_at  TIMESTAMP    DEFAULT NOW(),
  updated_at  TIMESTAMP    DEFAULT NOW()
);

-- Tabla de estado de la barrera (solo 1 fila siempre)
CREATE TABLE IF NOT EXISTS gate_status (
  id          INTEGER PRIMARY KEY DEFAULT 1,
  status      VARCHAR(10)  DEFAULT 'closed',  -- 'open' | 'closed'
  placa_scan  VARCHAR(10),                    -- última placa escaneada
  updated_at  TIMESTAMP    DEFAULT NOW(),
  CONSTRAINT  single_row CHECK (id = 1)
);

-- Insertar fila inicial de estado de barrera
INSERT INTO gate_status (id, status) VALUES (1, 'closed')
ON CONFLICT (id) DO NOTHING;

-- Tabla de registro/log de accesos
CREATE TABLE IF NOT EXISTS accesos (
  id          SERIAL PRIMARY KEY,
  placa       VARCHAR(10),
  cedula      VARCHAR(20),
  nombre      VARCHAR(100),
  resultado   VARCHAR(10),  -- 'permitido' | 'denegado'
  metodo      VARCHAR(20),  -- 'camara' | 'pulsador'
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Datos de prueba (opcional, comentar en producción)
INSERT INTO clientes (cedula, nombre, placa, pagado) VALUES
  ('1234567890', 'Juan Pérez',    'ABC123', TRUE),
  ('0987654321', 'María García',  'XYZ789', FALSE),
  ('1111111111', 'Carlos López',  'DEF456', TRUE)
ON CONFLICT DO NOTHING;
