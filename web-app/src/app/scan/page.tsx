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

  // Zoom de la cámara
  const [zoomLevel, setZoomLevel] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);

  // Contador de llamadas a la API
  const [apiCallCount, setApiCallCount] = useState(0);

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

  // Aplicar zoom a la cámara
  const applyZoom = useCallback(async (zoom: number) => {
    try {
      const video = webcamRef.current?.video;
      if (!video) return;
      const stream = video.srcObject as MediaStream;
      if (!stream) return;
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      
      const capabilities = track.getCapabilities?.();
      if (capabilities?.zoom) {
        const max = (capabilities.zoom as any).max || 1;
        const min = (capabilities.zoom as any).min || 1;
        setMaxZoom(max);
        const clampedZoom = Math.min(Math.max(zoom, min), max);
        await track.applyConstraints({ advanced: [{ zoom: clampedZoom } as any] });
        setZoomLevel(clampedZoom);
      }
    } catch (e) {
      // El navegador o la cámara no soporta zoom
    }
  }, []);

  useEffect(() => {
    if (status !== 'camera') return;
    const timer = setTimeout(() => {
      applyZoom(zoomLevel);
    }, 1500);
    return () => clearTimeout(timer);
  }, [status, applyZoom, zoomLevel]);

  const evaluateBufferAndProcess = async (finalBuffer: PlateReading[], isBackground: boolean) => {
    const counts: Record<string, number> = {};
    let maxCount = 0;
    
    finalBuffer.forEach(r => {
      counts[r.placa] = (counts[r.placa] || 0) + 1;
      if (counts[r.placa] > maxCount) maxCount = counts[r.placa];
    });

    let winningPlate = '';
    let winningScore = 0;

    if (maxCount >= 2) {
      winningPlate = Object.keys(counts).find(k => counts[k] === maxCount)!;
      winningScore = Math.max(...finalBuffer.filter(r => r.placa === winningPlate).map(r => r.score));
    } else {
      const bestReading = finalBuffer.reduce((prev, current) => (prev.score > current.score) ? prev : current);
      winningPlate = bestReading.placa;
      winningScore = bestReading.score;
    }

    setDebugText(`Ganador: ${winningPlate} (${(winningScore * 100).toFixed(1)}%)`);

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
        setTimeout(reset, 6000); // Volver a escanear tras 6 seg
      }
    } catch (err: any) {
      setResult({ approved: false, placa: null, message: err?.message || 'Error Procesando Accesos (500)' });
      setStatus('result');
      setIsAutoMode(false);
      setTimeout(reset, 6000);
    }
  };

  const captureAndSend = useCallback(async (isBackground = false) => {
    if (!webcamRef.current || isScanningRef.current) return;

    const imageSrc = webcamRef.current.getScreenshot({ width: 1920, height: 1080 });
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

      const response = await fetch('/api/recognize', { method: 'POST', body: formData });
      if (!response.ok) {
        let errStr = 'Error desconocido del servidor OCR';
        try { const errData = await response.json(); errStr = errData.error || errStr; } catch(e) {}
        throw new Error(errStr);
      }
      
      setApiCallCount(prev => prev + 1);
      const data = await response.json();

      if (data.valid && data.placa) {
        const newReading = { placa: data.placa, score: data.score };
        setDebugText(`Leído: ${data.placa} (${(data.score * 100).toFixed(1)}%)`);
        
        setScanBuffer(prev => {
          const newBuffer = [...prev, newReading];
          
          if (newBuffer.length >= 3) {
            evaluateBufferAndProcess(newBuffer, isBackground);
            return [];
          }
          
          if (bufferTimeoutRef.current) clearTimeout(bufferTimeoutRef.current);
          bufferTimeoutRef.current = setTimeout(() => {
            setScanBuffer([]);
            setDebugText('Memoria limpiada por inactividad.');
          }, 10000);

          return newBuffer;
        });

      } else {
        if (data.message) {
          setDebugText(data.message);
        }
        
        if (!isBackground) {
          setResult({ approved: false, placa: null, message: data.message || 'No se detectó placa' });
          setStatus('result');
        }
      }
    } catch (err: any) {
      setResult({ approved: false, placa: null, message: err?.message || 'Error Interno del Servidor (500)' });
      setStatus('result');
      setIsAutoMode(false);
      setTimeout(reset, 6000);
    } finally {
      isScanningRef.current = false;
      setIsScanningBg(false);
    }
  }, [reset]);

  useEffect(() => {
    if (status !== 'camera' || !isAutoMode) return;
    // Intervalo constante y predecible de 3.5 segundos sin bloqueos ni detección de auto externa
    const timer = setInterval(() => captureAndSend(true), 3500);
    return () => clearInterval(timer);
  }, [status, isAutoMode, captureAndSend]);

  return (
    <div className="scan-wrapper">
      {status !== 'camera' && (
        <nav className="navbar">
          <Link href="/" className="navbar-brand">
            <img src="/facultad-logo.png" alt="Logo Facultad" style={{ height: '38px', width: 'auto', objectFit: 'contain' }} />
          </Link>
          <div className="navbar-nav">
            <Link href="/" className="nav-link">Dashboard</Link>
            <Link href="/scan" className="nav-link active">Scanner</Link>
          </div>
        </nav>
      )}

      <main className={status === 'camera' ? '' : 'scan-main'}>
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
          <div style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: '#000',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden'
          }}>
            {/* Cámara a pantalla completa y horizontal */}
            <Webcam
              audio={false}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              videoConstraints={{ 
                facingMode: 'environment', 
                width: 1920, 
                height: 1080,
                aspectRatio: 16 / 9,
                focusMode: 'continuous' as any,
              }}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
            />

            {/* Overlay superior: Botón salir, indicador de estado y progreso */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              padding: '1rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)',
              zIndex: 10
            }}>
              <button 
                onClick={stopCamera}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  color: 'white',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  backdropFilter: 'blur(4px)',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                ✕ Suspender
              </button>

              <div style={{
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(4px)',
                border: '1px solid rgba(255,255,255,0.15)',
                padding: '6px 16px',
                borderRadius: '20px',
                fontSize: '0.8rem',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <div className="scan-dot" />
                {isScanningBg ? 'Analizando placa...' : 'Escaneando'}
              </div>

              {scanBuffer.length > 0 ? (
                <div style={{
                  background: 'var(--accent-primary)',
                  color: 'white',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: 700
                }}>
                  {scanBuffer.length}/3
                </div>
              ) : <div style={{ width: 60 }} />}
            </div>

            {/* Guía horizontal central de enfoque para la placa */}
            <div style={{
              position: 'absolute',
              width: '85%',
              maxWidth: '420px',
              height: '120px',
              border: '2px solid rgba(255, 255, 255, 0.6)',
              borderRadius: '12px',
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '0.75rem',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                background: 'rgba(0,0,0,0.6)',
                padding: '4px 10px',
                borderRadius: '4px'
              }}>
                ALINEAR PLACA AQUÍ
              </span>
            </div>

            {/* Overlay inferior: Zoom y controles */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              padding: '1.5rem 1rem',
              background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 100%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              zIndex: 10
            }}>
              {/* Control de Zoom */}
              {maxZoom > 1 && (
                <div style={{ 
                  width: '80%', maxWidth: '300px',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  background: 'rgba(0,0,0,0.6)', padding: '6px 14px', borderRadius: '20px',
                  backdropFilter: 'blur(4px)'
                }}>
                  <span style={{ fontSize: '0.8rem', color: '#fff' }}>🔍</span>
                  <input 
                    type="range" 
                    min="1" 
                    max={maxZoom} 
                    step="0.1"
                    value={zoomLevel}
                    onChange={(e) => applyZoom(parseFloat(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--accent-primary)' }}
                  />
                  <span style={{ fontSize: '0.8rem', color: '#fff', minWidth: '35px', fontWeight: 600 }}>{zoomLevel.toFixed(1)}x</span>
                </div>
              )}

              {/* Debug y conteo de llamadas */}
              <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', textAlign: 'center' }}>
                {debugText || 'Apunte la cámara hacia la placa del vehículo'} {apiCallCount > 0 && `(API: ${apiCallCount})`}
              </div>

              <button 
                className="btn btn-primary" 
                style={{ width: '100%', maxWidth: '320px', padding: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
                onClick={() => captureAndSend(false)} 
                disabled={isScanningBg}
              >
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
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Restableciendo sistema automáticamente...</p>
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
