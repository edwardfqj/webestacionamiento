import { NextRequest, NextResponse } from 'next/server';

function extractPlate(rawText: string): string {
  const cleaned = rawText
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase();

  return cleaned.slice(0, 8);
}

// POST /api/recognize — Solo procesa la imagen con IA y devuelve el resultado, SIN tocar base de datos
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;

    if (!imageFile) {
      return NextResponse.json({ error: 'No se recibió imagen' }, { status: 400 });
    }

    const PLATE_RECOGNIZER_TOKEN = process.env.PLATE_RECOGNIZER_TOKEN || 'c9bce59d79aac07bccc3f330bc5273a3eeef8db9';

    const prFormData = new FormData();
    prFormData.append('upload', imageFile);

    const prResponse = await fetch('https://api.platerecognizer.com/v1/plate-reader/', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${PLATE_RECOGNIZER_TOKEN}`,
      },
      body: prFormData
    });

    if (!prResponse.ok) {
      const errorText = await prResponse.text();
      throw new Error(`Error API Reconocimiento: ${prResponse.status}`);
    }

    const prData = await prResponse.json();
    const results = prData.results || [];

    if (results.length === 0) {
      return NextResponse.json({
        valid: false,
        message: 'No se detectó ninguna placa clara',
      }, { status: 200 });
    }

    // Filtrar al 85% de confianza mínima
    const validResults = results
      .filter((r: any) => {
        const plateStr = extractPlate(r.plate);
        return plateStr && plateStr.length >= 4 && r.score >= 0.85;
      })
      .sort((a: any, b: any) => b.score - a.score);

    if (validResults.length === 0) {
      const debugScores = results.map((r:any) => `${r.plate}: ${(r.score*100).toFixed(1)}%`).join(' | ');
      return NextResponse.json({
        valid: false,
        message: `Filtro Activo. Detectado: ${debugScores}`,
      }, { status: 200 });
    }

    const bestMatch = validResults[0];
    const detectedPlate = extractPlate(bestMatch.plate);

    return NextResponse.json({
      valid: true,
      placa: detectedPlate,
      score: bestMatch.score,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error interno procesando imagen' }, { status: 500 });
  }
}
