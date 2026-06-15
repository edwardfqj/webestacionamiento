import { neon } from '@neondatabase/serverless';

// Crear cliente SQL usando la variable de entorno de Neon/Vercel Postgres
// La variable POSTGRES_URL se configura automáticamente al conectar Neon en Vercel
// También puede llamarse DATABASE_URL según la configuración
function getSQL() {
  const databaseUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('POSTGRES_URL o DATABASE_URL no está configurada en las variables de entorno');
  }
  return neon(databaseUrl);
}

export const sql = getSQL();

export type Cliente = {
  id: number;
  cedula: string;
  nombre: string;
  placa: string;
  pagado: boolean;
  created_at: string;
  updated_at: string;
};

export type GateStatus = {
  id: number;
  status: 'open' | 'closed';
  placa_scan: string | null;
  updated_at: string;
};

export type Acceso = {
  id: number;
  placa: string;
  cedula: string | null;
  nombre: string | null;
  resultado: 'permitido' | 'denegado';
  metodo: 'camara' | 'pulsador';
  created_at: string;
};
