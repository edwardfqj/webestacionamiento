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

    // Filtrar placas con longitud válida y confianza de al menos 85% (0.85)
    // (Ajustado a 85% para mayor tolerancia)
    const validResults = results
      .filter((r: any) => {
        const plateStr = extractPlate(r.plate);
        return plateStr && plateStr.length >= 4 && r.score >= 0.85;
      })
      .sort((a: any, b: any) => b.score - a.score);

    if (validResults.length === 0) {
      const debugScores = results.map((r:any) => `${r.plate}: ${(r.score*100).toFixed(1)}%`).join(' | ');
      return NextResponse.json({
        approved: false,
        error: 'Confianza menor al 85% o placa muy corta',
        message: `Filtro Activo. Detectado: ${debugScores}`,
        raw_text: results[0] ? results[0].plate : 'NULL',
        placa: null,
      }, { status: 200 });
    }

    // Tomar la placa válida con mayor nivel de confianza
    const bestMatch = validResults[0];
    const rawPlateText = bestMatch.plate;
    const detectedPlate = extractPlate(rawPlateText);

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

    // Si NO existe, lo auto-registramos como Visitante (ENTRANDO)
    if (!cliente) {
      const tempCedula = 'VISITANTE-' + detectedPlate;
      const res = await sql`
        INSERT INTO clientes (cedula, nombre, placa, pagado, hora_entrada)
        VALUES (${tempCedula}, 'Visitante', ${detectedPlate}, false, NOW())
        RETURNING id, cedula, nombre, placa, pagado, hora_entrada
      `;
      cliente = res[0] as typeof cliente;
      
      approved = true; // Puede entrar
      finalMessage = `Bienvenido Visitante. Su placa es ${detectedPlate}.`;
      messageType = 'success';
    } else {
      // Si existe y NO tiene hora_entrada, está ENTRANDO
      if (!cliente.hora_entrada) {
        await sql`UPDATE clientes SET hora_entrada = NOW() WHERE id = ${cliente.id}`;
        approved = true;
        finalMessage = `Bienvenido ${cliente.nombre}`;
        messageType = 'success';
      } 
      // Si existe y TIENE hora_entrada, está SALIENDO
      else {
        if (cliente.pagado) {
          // Ha pagado -> Puede salir, reseteamos su ciclo
          await sql`UPDATE clientes SET hora_entrada = NULL WHERE id = ${cliente.id}`;
          approved = true;
          finalMessage = `Buen viaje ${cliente.nombre}`;
          messageType = 'success';
        } else {
          // No ha pagado -> Denegado
          approved = false;
          finalMessage = `Acceso denegado. Diríjase a la caja para cancelar su parqueo.`;
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
