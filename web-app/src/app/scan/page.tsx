'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import Webcam from 'react-webcam';

type ScanResult = {
  approved: boolean;
  placa: string | null;
  message: string;
  cliente?: { nombre: string; cedula: string } | null;
};

type ScanStatus = 'idle' | 'camera' | 'processing' | 'result';

type PlateReading = {
  placa: string;
  score: number;
};

export default function ScanPage() {
  const webcamRef = useRef<Webcam>(null);
  const isScanningRef = useRef(false);
  const bufferTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [status, setStatus] = useState<ScanStatus>('idle');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [isScanningBg, setIsScanningBg] = useState(false);

  // Buffer de lecturas
  const [scanBuffer, setScanBuffer] = useState<PlateReading[]>([]);
  const [debugText, setDebugText] = useState('');

  const startCamera = () => {
    setErrorMsg('');
    setStatus('camera');
    setIsAutoMode(true);
    setScanBuffer([]);
  };

  const stopCamera = () => {
    setStatus('idle');
    setIsAutoMode(false);
    setScanBuffer([]);
    if (bufferTimeoutRef.current) clearTimeout(bufferTimeoutRef.current);
  };

  const reset = useCallback(() => {
    setStatus('camera');
    setResult(null);
    setErrorMsg('');
    setIsAutoMode(true);
    setScanBuffer([]);
    setDebugText('');
  }, []);

  const evaluateBufferAndProcess = async (finalBuffer: PlateReading[], isBackground: boolean) => {
    // 1. Lógica de votación
    const counts: Record<string, number> = {};
    let maxCount = 0;
    
    finalBuffer.forEach(r => {
      counts[r.placa] = (counts[r.placa] || 0) + 1;
      if (counts[r.placa] > maxCount) maxCount = counts[r.placa];
    });

    let winningPlate = '';
    let winningScore = 0;

    if (maxCount >= 2) {
      // Gana por mayoría
      winningPlate = Object.keys(counts).find(k => counts[k] === maxCount)!;
      // Tomar el score más alto de la placa ganadora
      winningScore = Math.max(...finalBuffer.filter(r => r.placa === winningPlate).map(r => r.score));
    } else {
      // Todas son diferentes (maxCount === 1), gana el mayor porcentaje
      const bestReading = finalBuffer.reduce((prev, current) => (prev.score > current.score) ? prev : current);
      winningPlate = bestReading.placa;
      winningScore = bestReading.score;
    }

    setDebugText(`Evaluando... Ganador: ${winningPlate} (${(winningScore * 100).toFixed(1)}%)`);

    // 2. Enviar a base de datos
    try {
      if (!isBackground) setStatus('processing');

      const response = await fetch('/api/check-plate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa: winningPlate, score: winningScore })
      });

      if (!response.ok) {
        let errStr = 'Error desconocido del servidor BD';
        try { const errData = await response.json(); errStr = errData.error || errStr; } catch(e) {}
        throw new Error(errStr);
      }
      
      const data = await response.json();
      setResult(data);
      setStatus('result');
      setIsAutoMode(false);
      setScanBuffer([]);
      
      if (isBackground) {
        setTimeout(reset, 5000); // Volver a escanear tras 5 seg
      }
    } catch (err: any) {
      setResult({ approved: false, placa: null, message: err?.message || 'Error Procesando Accesos (500)' });
      setStatus('result');
      setIsAutoMode(false);
      setTimeout(reset, 8000);
    }
  };

  const captureAndSend = useCallback(async (isBackground = false) => {
    if (!webcamRef.current || isScanningRef.current) return;

    const imageSrc = webcamRef.current.getScreenshot({ width: 1280, height: 720 });
    if (!imageSrc) {
      if (!isBackground) setErrorMsg('Error de captura local.');
      return;
    }

    isScanningRef.current = true;
    if (!isBackground) setStatus('processing');
    else setIsScanningBg(true);

    try {
      const res = await fetch(imageSrc);
      const blob = await res.blob();
      const formData = new FormData();
      formData.append('image', blob, 'plate.jpg');

      // Solo reconocer texto
      const response = await fetch('/api/recognize', { method: 'POST', body: formData });
      if (!response.ok) {
        let errStr = 'Error desconocido del servidor OCR';
        try { const errData = await response.json(); errStr = errData.error || errStr; } catch(e) {}
        throw new Error(errStr);
      }
      
      const data = await response.json();

      if (data.valid && data.placa) {
        // Encontramos una placa válida
        const newReading = { placa: data.placa, score: data.score };
        
        // Actualizar UI
        setDebugText(`Leído: ${data.placa} (${(data.score * 100).toFixed(1)}%)`);
        
        setScanBuffer(prev => {
          const newBuffer = [...prev, newReading];
          
          if (newBuffer.length >= 3) {
            // Ya tenemos 3 lecturas, procesar acceso
            evaluateBufferAndProcess(newBuffer, isBackground);
            return []; // Vaciar memoria visualmente de inmediato
          }
          
          // Resetear temporizador de olvido (si el carro se va a medias)
          if (bufferTimeoutRef.current) clearTimeout(bufferTimeoutRef.current);
          bufferTimeoutRef.current = setTimeout(() => {
            setScanBuffer([]);
            setDebugText('Memoria limpiada por inactividad.');
          }, 10000);

          return newBuffer;
        });

      } else {
        if (data.message) {
          setDebugText(data.message); // Mostrar por qué el filtro falló
        }
        
        if (!isBackground) {
          // Si el usuario forzó y no se detectó nada
          setResult({ approved: false, placa: null, message: data.message || 'No se detectó placa' });
          setStatus('result');
        }
      }
    } catch (err: any) {
      setResult({ approved: false, placa: null, message: err?.message || 'Error Interno del Servidor (500)' });
      setStatus('result');
      setIsAutoMode(false);
      setTimeout(reset, 8000);
    } finally {
      isScanningRef.current = false;
      setIsScanningBg(false);
    }
  }, [reset]);

  useEffect(() => {
    if (status !== 'camera' || !isAutoMode) return;
    // Escanear rápido: cada 1.5 segundos para recolectar 3 muestras rápido
    const timer = setInterval(() => captureAndSend(true), 1500);
    return () => clearInterval(timer);
  }, [status, isAutoMode, captureAndSend]);

  return (
    <div className="scan-wrapper">
      <nav className="navbar">
        <Link href="/" className="navbar-brand">
          <div className="navbar-logo">P</div>
          <div><div className="navbar-title">Scanner Node</div></div>
        </Link>
        <div className="navbar-nav">
          <Link href="/" className="nav-link">Dashboard</Link>
          <Link href="/scan" className="nav-link active">Scanner</Link>
        </div>
      </nav>

      <main className="scan-main">
        {status === 'idle' && (
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <h2 className="page-title" style={{ marginBottom: '1rem' }}>ALPR System</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
              Sistema de reconocimiento con Múltiple Verificación (Mejor de 3).
            </p>
            {errorMsg && <div style={{ color: 'var(--color-error)', marginBottom: '1rem', fontSize: '0.85rem' }}>{errorMsg}</div>}
            <button className="btn btn-primary" style={{ width: '100%', padding: '12px' }} onClick={startCamera}>
              Inicializar Módulo
            </button>
          </div>
        )}

        {status === 'camera' && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="camera-box">
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={{ facingMode: 'environment', width: 1920, height: 1080 }}
                className="camera-video"
              />
              <div className="camera-overlay">
                <div className="focus-frame" />
              </div>
              
              {/* Indicador de progreso de lecturas */}
              <div className="scan-status-pill" style={{ top: '1rem' }}>
                <div className="scan-dot" />
                {isScanningBg ? 'Analyzing' : 'Standby'}
              </div>
              
              {/* Progreso del buffer (Mejor de 3) */}
              {scanBuffer.length > 0 && (
                <div style={{
                  position: 'absolute', top: '3.5rem', left: '50%', transform: 'translateX(-50%)',
                  background: 'var(--accent-primary)', color: 'white', padding: '6px 16px',
                  borderRadius: 'var(--radius-full)', fontSize: '0.85rem', fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}>
                  Recolectando: {scanBuffer.length}/3
                </div>
              )}
            </div>
            
            {/* Debug Texto para entender qué está viendo la IA */}
            <div style={{ marginTop: '1rem', height: '20px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {debugText}
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={stopCamera}>Suspender</button>
              <button className="btn btn-primary" onClick={() => captureAndSend(false)} disabled={isScanningBg}>
                Forzar Lectura Única
              </button>
            </div>
          </div>
        )}

        {status === 'processing' && (
          <div style={{ textAlign: 'center' }}>
            <div className="scan-dot" style={{ width: 16, height: 16, margin: '0 auto 1.5rem auto' }} />
            <h3 style={{ fontWeight: 500 }}>Procesando acceso...</h3>
          </div>
        )}

        {status === 'result' && result && (
          <div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
            <div style={{ 
              padding: '2rem', 
              borderRadius: 'var(--radius-lg)', 
              background: 'var(--bg-elevated)', 
              border: `1px solid ${result.approved ? 'var(--color-success)' : 'var(--color-error)'}` 
            }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: result.approved ? 'var(--color-success)' : 'var(--color-error)' }}>
                {result.approved ? 'ACCESO AUTORIZADO' : 'VISITANTE / PAGO PENDIENTE'}
              </h2>
              {result.placa && <div className="result-placa">{result.placa}</div>}
              <p style={{ color: 'var(--text-primary)', fontSize: '1.1rem', marginTop: '1rem', fontWeight: 500 }}>
                {result.message}
              </p>
              
              {result.approved && result.cliente && (
                <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Propietario Identificado</div>
                  <div style={{ fontWeight: 500, fontSize: '1rem', marginTop: '4px' }}>{result.cliente.nombre}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>ID: {result.cliente.cedula}</div>
                </div>
              )}
            </div>

            <div style={{ marginTop: '2rem' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Restableciendo sistema automǭticamente...</p>
              {!isAutoMode && (
                <button className="btn btn-secondary" style={{ width: '100%', marginTop: '1rem' }} onClick={reset}>Forzar Escaneo Continuo</button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
