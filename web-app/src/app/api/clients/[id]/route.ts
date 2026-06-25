import { NextRequest, NextResponse } from 'next/server';
import { getSQL } from '@/lib/db';

// PATCH /api/clients/[id] — actualizar cliente (pagado, nombre, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const body = await request.json();
    const { pagado, nombre, cedula, placa } = body;

    const sql = getSQL();

    // Actualizar solo los campos enviados
    if (pagado !== undefined) {
      if (pagado === true) {
        await sql`
          UPDATE clientes
          SET pagado = true, hora_entrada = NULL, updated_at = NOW()
          WHERE id = ${id}
        `;
      } else {
        await sql`
          UPDATE clientes
          SET pagado = false, updated_at = NOW()
          WHERE id = ${id}
        `;
      }
    }

    if (nombre || cedula || placa) {
      await sql`
        UPDATE clientes SET
          nombre     = COALESCE(${nombre ?? null}, nombre),
          cedula     = COALESCE(${cedula ?? null}, cedula),
          placa      = COALESCE(${placa ? placa.toUpperCase().trim() : null}, placa),
          updated_at = NOW()
        WHERE id = ${id}
      `;
    }

    const rows = await sql`
      SELECT * FROM clientes WHERE id = ${id}
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ client: rows[0] });
  } catch (error: unknown) {
    const dbError = error as { code?: string };
    if (dbError?.code === '23505') {
      return NextResponse.json(
        { error: 'La cédula o placa ya están en uso' },
        { status: 409 }
      );
    }
    console.error('Error updating client:', error);
    return NextResponse.json({ error: 'Error al actualizar cliente' }, { status: 500 });
  }
}

// DELETE /api/clients/[id] — eliminar cliente
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const sql = getSQL();
    const rows = await sql`
      DELETE FROM clientes WHERE id = ${id} RETURNING id
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Cliente eliminado correctamente' });
  } catch (error) {
    console.error('Error deleting client:', error);
    return NextResponse.json({ error: 'Error al eliminar cliente' }, { status: 500 });
  }
}
