import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// GET /api/accesos — últimos accesos registrados
export async function GET() {
  try {
    const rows = await sql`
      SELECT id, placa, cedula, nombre, resultado, metodo, created_at
      FROM accesos
      ORDER BY created_at DESC
      LIMIT 50
    `;
    return NextResponse.json({ accesos: rows });
  } catch (error) {
    console.error('Error fetching accesos:', error);
    return NextResponse.json({ error: 'Error al obtener accesos' }, { status: 500 });
  }
}
