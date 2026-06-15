import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// GET /api/clients — lista todos los clientes
export async function GET() {
  try {
    const rows = await sql`
      SELECT id, cedula, nombre, placa, pagado, created_at, updated_at
      FROM clientes
      ORDER BY nombre ASC
    `;
    return NextResponse.json({ clients: rows });
  } catch (error) {
    console.error('Error fetching clients:', error);
    return NextResponse.json({ error: 'Error al obtener clientes' }, { status: 500 });
  }
}

// POST /api/clients — crear nuevo cliente
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cedula, nombre, placa, pagado = false } = body;

    if (!cedula || !nombre || !placa) {
      return NextResponse.json(
        { error: 'Cédula, nombre y placa son requeridos' },
        { status: 400 }
      );
    }

    const placaUpper = placa.toUpperCase().trim();
    const cedulaTrim = cedula.trim();

    const rows = await sql`
      INSERT INTO clientes (cedula, nombre, placa, pagado)
      VALUES (${cedulaTrim}, ${nombre.trim()}, ${placaUpper}, ${pagado})
      RETURNING *
    `;

    return NextResponse.json({ client: rows[0] }, { status: 201 });
  } catch (error: unknown) {
    const dbError = error as { code?: string };
    if (dbError?.code === '23505') {
      return NextResponse.json(
        { error: 'La cédula o placa ya están registradas' },
        { status: 409 }
      );
    }
    console.error('Error creating client:', error);
    return NextResponse.json({ error: 'Error al crear cliente' }, { status: 500 });
  }
}
