import { NextRequest, NextResponse } from 'next/server';
import { getSQL } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/gate-status — el ESP32 consulta este endpoint para saber si debe abrir
export async function GET(request: NextRequest) {
  try {
    // Verificar API key del ESP32 (seguridad básica)
    const apiKey = request.headers.get('x-api-key');
    const validKey = process.env.ESP32_API_KEY;

    if (validKey && apiKey !== validKey) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const sql = getSQL();
    
    // Migración perezosa
    try {
      await sql`ALTER TABLE gate_status ADD COLUMN IF NOT EXISTS message VARCHAR(255);`;
      await sql`ALTER TABLE gate_status ADD COLUMN IF NOT EXISTS message_type VARCHAR(20);`;
    } catch(e) {}

    const rows = await sql`
      SELECT status, placa_scan, updated_at, message, message_type
      FROM gate_status
      WHERE id = 1
    `;

    const gate = rows[0] as { status: string; placa_scan: string | null; updated_at: string; message: string | null; message_type: string | null } | undefined;
    const isOpen = gate?.status === 'open';

    return NextResponse.json({
      open: isOpen,
      placa: gate?.placa_scan ?? null,
      status: gate?.status ?? 'closed',
      updated_at: gate?.updated_at ?? null,
      message: gate?.message ?? null,
      message_type: gate?.message_type ?? 'info',
    });
  } catch (error) {
    console.error('Error getting gate status:', error);
    return NextResponse.json({ open: false, status: 'closed' }, { status: 500 });
  }
}

// POST /api/gate-status — reset: el ESP32 avisa si abrió (pulsador) o cerró la barrera
export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key');
    const validKey = process.env.ESP32_API_KEY;

    if (validKey && apiKey !== validKey) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const newStatus = body.status === 'open' ? 'open' : 'closed';
    const method = body.method || 'desconocido';

    const sql = getSQL();
    await sql`
      UPDATE gate_status
      SET status = ${newStatus}, updated_at = NOW()
      WHERE id = 1
    `;

    // Si fue abierto por pulsador manual, registramos el evento en accesos
    if (newStatus === 'open' && method === 'pulsador') {
      await sql`
        INSERT INTO accesos (placa, nombre, resultado, metodo)
        VALUES ('MANUAL', 'Apertura por Botón', 'permitido', 'pulsador')
      `;
    }

    return NextResponse.json({ message: `Barrera actualizada a ${newStatus}` });
  } catch (error) {
    console.error('Error updating gate:', error);
    return NextResponse.json({ error: 'Error al actualizar barrera' }, { status: 500 });
  }
}
