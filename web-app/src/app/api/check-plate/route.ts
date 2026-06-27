import { NextRequest, NextResponse } from 'next/server';
import { getSQL } from '@/lib/db';

// POST /api/check-plate — Recibe JSON con la placa ganadora y actualiza la BD y la barrera
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { placa: detectedPlate, score } = body;

    if (!detectedPlate) {
      return NextResponse.json({ error: 'No se recibió una placa válida' }, { status: 400 });
    }

    const sql = getSQL();
    
    // Asegurarse de que la columna hora_entrada exista
    try {
      await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS hora_entrada TIMESTAMP;`;
    } catch(e) {}

    // Buscar en base de datos
    const rows = await sql`
      SELECT id, cedula, nombre, placa, pagado, hora_entrada
      FROM clientes
      WHERE placa = ${detectedPlate}
    `;

    let cliente = rows[0] as { id: number; cedula: string; nombre: string; placa: string; pagado: boolean; hora_entrada: Date | null } | undefined;
    
    let approved = false;
    let finalMessage = '';
    let messageType = 'info';

    // Verificar si es un visitante
    const isVisitor = cliente ? (cliente.cedula.startsWith('VISITANTE-') || cliente.nombre === 'Visitante') : true;

    // Si NO existe en BD, lo auto-registramos como Visitante (ENTRANDO)
    if (!cliente) {
      const tempCedula = 'VISITANTE-' + detectedPlate;
      const res = await sql`
        INSERT INTO clientes (cedula, nombre, placa, pagado, hora_entrada)
        VALUES (${tempCedula}, 'Visitante', ${detectedPlate}, false, NOW())
        RETURNING id, cedula, nombre, placa, pagado, hora_entrada
      `;
      cliente = res[0] as typeof cliente;
      
      approved = true;
      finalMessage = `Bienvenido Visitante. Recuerde pasar por caja a pagar su parqueo antes de salir.`;
      messageType = 'success';
    } else {
      // Si existe y NO tiene hora_entrada, está ENTRANDO
      if (!cliente.hora_entrada) {
        if (isVisitor) {
          await sql`UPDATE clientes SET hora_entrada = NOW(), pagado = false WHERE id = ${cliente.id}`;
          approved = true;
          finalMessage = `Bienvenido Visitante. Recuerde pasar por caja a cancelar antes de salir.`;
        } else {
          // Cliente Registrado: NO modificamos su estado de mensualidad (pagado)
          await sql`UPDATE clientes SET hora_entrada = NOW() WHERE id = ${cliente.id}`;
          approved = true;
          if (!cliente.pagado) {
            finalMessage = `Bienvenido ${cliente.nombre}. Recuerde cancelar su mensualidad antes de salir.`;
          } else {
            finalMessage = `Bienvenido ${cliente.nombre}`;
          }
        }
        messageType = 'success';
      } 
      // Si existe y TIENE hora_entrada, está SALIENDO
      else {
        if (cliente.pagado) {
          // Ha pagado (horas de visitante o mensualidad de cliente) -> Puede salir
          if (isVisitor) {
            // Eliminar al visitante de la BD al salir
            await sql`DELETE FROM clientes WHERE id = ${cliente.id}`;
          } else {
            // Cliente registrado -> Reseteamos su hora de entrada, pero CONSERVAMOS su mensualidad pagada (pagado = true)
            await sql`UPDATE clientes SET hora_entrada = NULL WHERE id = ${cliente.id}`;
          }
          approved = true;
          finalMessage = `Buen viaje ${cliente.nombre}`;
          messageType = 'success';
        } else {
          // No ha pagado -> Denegado
          approved = false;
          if (isVisitor) {
            finalMessage = `Acceso denegado. Diríjase a la caja para cancelar las horas de parqueo.`;
          } else {
            finalMessage = `Acceso denegado. Diríjase a la caja para cancelar su mensualidad.`;
          }
          messageType = 'error';
        }
      }
    }

    const resultado = approved ? 'permitido' : 'denegado';

    // Registrar acceso en el log
    await sql`
      INSERT INTO accesos (placa, cedula, nombre, resultado, metodo)
      VALUES (
        ${detectedPlate},
        ${cliente?.cedula ?? null},
        ${cliente?.nombre ?? null},
        ${resultado},
        ${'camara_ia'}
      )
    `;

    // Asegurar que las columnas existen antes de actualizar
    try {
      await sql`ALTER TABLE gate_status ADD COLUMN IF NOT EXISTS message VARCHAR(255);`;
      await sql`ALTER TABLE gate_status ADD COLUMN IF NOT EXISTS message_type VARCHAR(20);`;
    } catch(e) {}

    // Actualizar pantalla pública (y abrir barrera si corresponde)
    if (approved) {
      await sql`
        UPDATE gate_status
        SET status = 'open', placa_scan = ${detectedPlate}, message = ${finalMessage}, message_type = ${messageType}, updated_at = NOW()
        WHERE id = 1
      `;
    } else {
      // Solo actualizamos el mensaje, sin abrir
      await sql`
        UPDATE gate_status
        SET placa_scan = ${detectedPlate}, message = ${finalMessage}, message_type = ${messageType}, updated_at = NOW()
        WHERE id = 1
      `;
    }

    return NextResponse.json({
      approved,
      placa: detectedPlate,
      confidence: score,
      cliente: cliente ? { nombre: cliente.nombre, cedula: cliente.cedula } : null,
      message: finalMessage,
    });

  } catch (error: any) {
    console.error('Error en process-plate:', error);
    return NextResponse.json({ error: error.message || 'Error interno procesando en base de datos' }, { status: 500 });
  }
}
