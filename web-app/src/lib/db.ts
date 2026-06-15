import { neon, NeonQueryFunction } from '@neondatabase/serverless';

// Conexión lazy — solo se crea cuando se usa por primera vez
// Esto evita errores durante el build de Next.js donde las env vars no están disponibles
let sqlInstance: NeonQueryFunction<false, false> | null = null;

export function getSQL() {
  if (!sqlInstance) {
    const databaseUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('POSTGRES_URL o DATABASE_URL no está configurada en las variables de entorno');
    }
    sqlInstance = neon(databaseUrl);
  }
  return sqlInstance;
}

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
