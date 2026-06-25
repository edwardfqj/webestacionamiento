import { NextRequest, NextResponse } from 'next/server';
import { getSQL } from '@/lib/db';

// Función para limpiar y normalizar el texto de la placa por si Plate Recognizer trae guiones
function extractPlate(rawText: string): string {
  const cleaned = rawText
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase();

  return cleaned.slice(0, 8); // Máximo 8 caracteres
}

// POST /api/check-plate — recibe imagen, usa Plate Recognizer, verifica pago
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;

    if (!imageFile) {
      return NextResponse.json({ error: 'No se recibió imagen' }, { status: 400 });
    }

    // Usar el token del entorno o el hardcodeado por defecto para facilitar pruebas
    const PLATE_RECOGNIZER_TOKEN = process.env.PLATE_RECOGNIZER_TOKEN || 'c9bce59d79aac07bccc3f330bc5273a3eeef8db9';

    // Construir FormData para enviar a Plate Recognizer
    const prFormData = new FormData();
    prFormData.append('upload', imageFile);
    // prFormData.append('regions', 'mx'); // Opcional: especificar regiones para mayor velocidad

    // Llamar a Plate Recognizer API
    const prResponse = await fetch('https://api.platerecognizer.com/v1/plate-reader/', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${PLATE_RECOGNIZER_TOKEN}`,
      },
      body: prFormData
    });

    if (!prResponse.ok) {
      const errorText = await prResponse.text();
      console.error('Error de Plate Recognizer:', errorText);
      throw new Error(`Error de la API de Reconocimiento: ${prResponse.status}`);
    }

    const prData = await prResponse.json();
    
    // Extraer resultados
    const results = prData.results || [];
    if (results.length === 0) {
      return NextResponse.json({
        approved: false,
        error: 'No se detectó ninguna placa clara',
        raw_text: 'NULL',
        placa: null,
      }, { status: 200 });
    }

    // Tomar la placa con mayor nivel de confianza (confidence)
    const bestMatch = results[0];
    const rawPlateText = bestMatch.plate;
    
    // Normalizar a formato mayúscula sin guiones
    const detectedPlate = extractPlate(rawPlateText);

    if (!detectedPlate || detectedPlate.length < 4) {
      return NextResponse.json({
        approved: false,
        error: 'La placa leída es inválida o muy corta',
        raw_text: rawPlateText,
        placa: null,
      }, { status: 200 });
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
    let autoRegistrado = false;

    // Si NO existe, lo auto-registramos como Visitante
    if (!cliente) {
      const tempCedula = 'VISITANTE-' + detectedPlate;
      const res = await sql`
        INSERT INTO clientes (cedula, nombre, placa, pagado, hora_entrada)
        VALUES (${tempCedula}, 'Visitante', ${detectedPlate}, false, NOW())
        RETURNING id, cedula, nombre, placa, pagado, hora_entrada
      `;
      cliente = res[0] as typeof cliente;
      autoRegistrado = true;
    } else {
      // Si existe y no tiene hora de entrada, se la seteamos (acaba de entrar)
      if (!cliente.hora_entrada && !cliente.pagado) {
        await sql`UPDATE clientes SET hora_entrada = NOW() WHERE id = ${cliente.id}`;
      }
    }

    const approved = cliente?.pagado === true;
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

    // Si está autorizado, abrir la barrera
    if (approved) {
      await sql`
        UPDATE gate_status
        SET status = 'open', placa_scan = ${detectedPlate}, updated_at = NOW()
        WHERE id = 1
      `;
    }

    // Determinar mensaje a mostrar y hablar (TTS)
    let finalMessage = '';
    if (approved) {
      finalMessage = `Bienvenido ${cliente!.nombre}`;
    } else {
      finalMessage = `Recuerde acercarse a pagar al punto de pago antes de salir`;
    }

    return NextResponse.json({
      approved,
      placa: detectedPlate,
      raw_text: rawPlateText, // Placa original devuelta por la API
      confidence: bestMatch.score, // Por si lo quisieras mostrar
      cliente: cliente ? { nombre: cliente.nombre, cedula: cliente.cedula } : null,
      message: finalMessage,
    });

  } catch (error: any) {
    console.error('Error en check-plate (Plate Recognizer):', error);
    return NextResponse.json({ error: error.message || 'Error interno procesando la imagen' }, { status: 500 });
  }
}
