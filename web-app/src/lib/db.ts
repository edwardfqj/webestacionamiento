import { sql } from '@vercel/postgres';

export { sql };

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
