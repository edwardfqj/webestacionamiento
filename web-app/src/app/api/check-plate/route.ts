import { NextRequest, NextResponse } from 'next/server';
import { createWorker } from 'tesseract.js';
import { sql } from '@/lib/db';

// Función para limpiar y normalizar el texto de la placa
function extractPlate(rawText: string): string {
  // Remover espacios, saltos de línea, caracteres especiales
  const cleaned = rawText
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase();

  // Buscar patrón de placa colombiana: 3 letras + 3 números (ej: ABC123)
  // También acepta otros formatos comunes
  const platePatterns = [
    /[A-Z]{3}\d{3}/,   // ABC123 - Colombia estándar
    /[A-Z]{2}\d{4}/,   // AB1234
    /[A-Z]{3}\d{2}[A-Z]/, // ABC12D - motos Colombia
    /[A-Z0-9]{5,8}/,   // Cualquier alfanumérico de 5-8 chars
  ];

  for (const pattern of platePatterns) {
    const match = cleaned.match(pattern);
    if (match) return match[0];
  }

  // Retornar los primeros 6 caracteres alfanuméricos si no hay match
  return cleaned.slice(0, 8);
}

// POST /api/check-plate — recibe imagen, hace OCR, verifica pago
export async function POST(request: NextRequest) {
  let worker = null;
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;

    if (!imageFile) {
      return NextResponse.json({ error: 'No se recibió imagen' }, { status: 400 });
    }

    // Convertir File a Buffer
    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // OCR con Tesseract.js
    worker = await createWorker('spa+eng', 1, {
      logger: () => {}, // silenciar logs
    });

    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      tessedit_pageseg_mode: '8', // Tratar como una sola palabra
    });

    const { data: { text } } = await worker.recognize(buffer);
    await worker.terminate();

    const detectedPlate = extractPlate(text);

    if (!detectedPlate || detectedPlate.length < 4) {
      return NextResponse.json({
        approved: false,
        error: 'No se pudo leer la placa',
        raw_text: text,
        placa: null,
      }, { status: 200 });
    }

    // Buscar en base de datos
    const { rows } = await sql`
      SELECT id, cedula, nombre, placa, pagado
      FROM clientes
      WHERE placa = ${detectedPlate}
    `;

    const cliente = rows[0];
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
        'camara'
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

    return NextResponse.json({
      approved,
      placa: detectedPlate,
      raw_text: text,
      cliente: approved ? { nombre: cliente.nombre, cedula: cliente.cedula } : null,
      message: approved
        ? `✅ Acceso permitido — ${cliente.nombre}`
        : cliente
          ? '❌ Vehículo no ha pagado'
          : '❌ Placa no registrada en el sistema',
    });

  } catch (error) {
    if (worker) {
      try { await (worker as any).terminate(); } catch {}
    }
    console.error('Error en check-plate:', error);
    return NextResponse.json({ error: 'Error procesando la imagen' }, { status: 500 });
  }
}
