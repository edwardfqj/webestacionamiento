import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// GET /api/gate-status — el ESP32 consulta este endpoint para saber si debe abrir
export async function GET(request: NextRequest) {
  try {
    // Verificar API key del ESP32 (seguridad básica)
    const apiKey = request.headers.get('x-api-key');
    const validKey = process.env.ESP32_API_KEY;

    if (validKey && apiKey !== validKey) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const rows = await sql`
      SELECT status, placa_scan, updated_at
      FROM gate_status
      WHERE id = 1
    `;

    const gate = rows[0] as { status: string; placa_scan: string | null; updated_at: string } | undefined;
    const isOpen = gate?.status === 'open';

    return NextResponse.json({
      open: isOpen,
      placa: gate?.placa_scan ?? null,
      status: gate?.status ?? 'closed',
      updated_at: gate?.updated_at ?? null,
    });
  } catch (error) {
    console.error('Error getting gate status:', error);
    return NextResponse.json({ open: false, status: 'closed' }, { status: 500 });
  }
}

// POST /api/gate-status — reset: el ESP32 avisa que cerró la barrera
export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key');
    const validKey = process.env.ESP32_API_KEY;

    if (validKey && apiKey !== validKey) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    await sql`
      UPDATE gate_status
      SET status = 'closed', updated_at = NOW()
      WHERE id = 1
    `;

    return NextResponse.json({ message: 'Barrera cerrada correctamente' });
  } catch (error) {
    console.error('Error resetting gate:', error);
    return NextResponse.json({ error: 'Error al resetear barrera' }, { status: 500 });
  }
}
