import { NextRequest, NextResponse } from 'next/server';
import { getSQL } from '@/lib/db';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Inicializar la API de Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Función para limpiar y normalizar el texto de la placa
function extractPlate(rawText: string): string {
  const cleaned = rawText
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase();

  const platePatterns = [
    /[A-Z]{3}\d{3}/,   // Colombia estándar
    /[A-Z]{2}\d{4}/,   
    /[A-Z]{3}\d{2}[A-Z]/, // Motos Colombia
    /[A-Z0-9]{5,8}/,   
  ];

  for (const pattern of platePatterns) {
    const match = cleaned.match(pattern);
    if (match) return match[0];
  }

  return cleaned.slice(0, 8);
}

// POST /api/check-plate — recibe imagen, usa IA, verifica pago
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;

    if (!imageFile) {
      return NextResponse.json({ error: 'No se recibió imagen' }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Falta la clave GEMINI_API_KEY en el servidor.' }, { status: 500 });
    }

    // Convertir a base64 para Gemini
    const arrayBuffer = await imageFile.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');

    // Modelos ultra-rápidos de tu cuenta en orden de prioridad
    const modelNames = ['gemini-flash-latest', 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'];
    
    let text = '';
    let success = false;
    let lastError = null;

    for (const modelName of modelNames) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const prompt = "You are an ALPR (Automatic License Plate Recognition) system. Analyze this image and extract ONLY the alphanumeric text of the license plate of the vehicle. Do not include spaces, hyphens, or any other punctuation. If you cannot clearly see a license plate, return strictly 'NULL'. Provide absolutely no other explanation or text.";
        
        const imagePart = {
          inlineData: {
            data: base64Image,
            mimeType: 'image/jpeg',
          },
        };

        const result = await model.generateContent([prompt, imagePart]);
        text = result.response.text().trim();
        success = true;
        break; // Salir si tuvimos éxito
      } catch (e: any) {
        console.warn(`Gemini (${modelName}) falló:`, e.message);
        lastError = e;
      }
    }

    if (!success) {
      throw lastError || new Error("Todos los modelos de IA fallaron.");
    }

    if (text === 'NULL' || text === '') {
      return NextResponse.json({
        approved: false,
        error: 'La IA no detectó ninguna placa clara',
        raw_text: text,
        placa: null,
      }, { status: 200 });
    }

    const detectedPlate = extractPlate(text);

    if (!detectedPlate || detectedPlate.length < 4) {
      return NextResponse.json({
        approved: false,
        error: 'La IA leyó texto inválido o muy corto',
        raw_text: text,
        placa: null,
      }, { status: 200 });
    }

    // Buscar en base de datos
    const sql = getSQL();
    const rows = await sql`
      SELECT id, cedula, nombre, placa, pagado
      FROM clientes
      WHERE placa = ${detectedPlate}
    `;

    const cliente = rows[0] as { id: number; cedula: string; nombre: string; placa: string; pagado: boolean } | undefined;
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

    return NextResponse.json({
      approved,
      placa: detectedPlate,
      raw_text: text,
      cliente: approved && cliente ? { nombre: cliente.nombre, cedula: cliente.cedula } : null,
      message: approved && cliente
        ? `✅ Acceso permitido — ${cliente.nombre}`
        : cliente
          ? '❌ Vehículo no ha pagado'
          : '❌ Placa no registrada en el sistema',
    });

  } catch (error: any) {
    console.error('Error en check-plate (IA):', error);
    return NextResponse.json({ error: error.message || 'Error interno en la IA procesando la imagen' }, { status: 500 });
  }
}
