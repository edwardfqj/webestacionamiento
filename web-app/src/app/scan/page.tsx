'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import Webcam from 'react-webcam';

type ScanResult = {
  approved: boolean;
  placa: string | null;
  message: string;
  cliente?: { nombre: string; cedula: string } | null;
  error?: string;
};

type ScanStatus = 'idle' | 'camera' | 'processing' | 'result';

export default function ScanPage() {
  const webcamRef = useRef<Webcam>(null);
  const isScanningRef = useRef(false); // Para evitar solapamientos en modo auto

  const [status, setStatus] = useState<ScanStatus>('idle');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Estados del Modo Automático
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [isScanningBg, setIsScanningBg] = useState(false);

  const startCamera = () => {
    setErrorMsg('');
    setStatus('camera');
    setIsAutoMode(true); // Siempre encender auto-mode al abrir la cámara
  };

  const stopCamera = () => {
    setStatus('idle');
    setIsAutoMode(false);
  };

  const reset = useCallback(() => {
    setStatus('camera'); // Regresar directo a la cámara para el siguiente auto
    setResult(null);
    setCapturedImage(null);
    setProgress(0);
    setErrorMsg('');
    setIsAutoMode(true);
  }, []);

  const captureAndSend = useCallback(async (isBackground = false) => {
    if (!webcamRef.current) return;
    if (isScanningRef.current) return;

    const imageSrc = webcamRef.current.getScreenshot({ width: 1280, height: 720 });
    if (!imageSrc) {
      if (!isBackground) setErrorMsg('No se pudo capturar la imagen. Intenta de nuevo.');
      return;
    }

    isScanningRef.current = true;
    let interval: NodeJS.Timeout | undefined;

    if (!isBackground) {
      setCapturedImage(imageSrc);
      setStatus('processing');
      let prog = 0;
      interval = setInterval(() => {
        prog += Math.random() * 15;
        if (prog > 90) { clearInterval(interval); prog = 90; }
        setProgress(Math.min(prog, 90));
      }, 200);
    } else {
      setIsScanningBg(true);
    }

    try {
      const res = await fetch(imageSrc);
      const blob = await res.blob();
      const formData = new FormData();
      formData.append('image', blob, 'plate.jpg');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch('/api/check-plate', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      if (interval) clearInterval(interval);
      if (!isBackground) setProgress(100);

      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }

      const data = await response.json();

      if (isBackground) {
        // En modo fondo, solo interrumpir si encontró una placa válida
        if (data.placa) {
          setCapturedImage(imageSrc);
          setResult(data);
          setStatus('result');
          setIsAutoMode(false); // Apagar radar mientras mostramos resultado
          
          // Si el acceso es permitido, volver automáticamente a escanear después de 8 segundos (tiempo que tarda el auto en pasar)
          if (data.approved) {
            setTimeout(() => {
              reset();
            }, 8000);
          }
        }
      } else {
        setResult(data);
        setStatus('result');
      }
    } catch (err: any) {
      if (interval) clearInterval(interval);
      console.error("Fetch Error:", err);
      
      if (!isBackground) {
        const isTimeout = err.name === 'AbortError';
        setResult({
          approved: false,
          placa: null,
          message: isTimeout 
            ? 'Los servidores de IA están saturados (Tiempo excedido). Intenta de nuevo.' 
            : 'Error de conexión con el servidor. Revisa tu internet.',
          error: isTimeout ? 'timeout' : 'network_error',
        });
        setStatus('result');
      }
    } finally {
      isScanningRef.current = false;
      setIsScanningBg(false);
    }
  }, [reset]);

  // Bucle del Modo Automático
  useEffect(() => {
    if (status !== 'camera' || !isAutoMode) return;

    // Ejecutar cada 4 segundos para respetar el límite de Gemini (15 RPM)
    const timer = setInterval(() => {
      captureAndSend(true);
    }, 4000);

    return () => clearInterval(timer);
  }, [status, isAutoMode, captureAndSend]);

  const videoConstraints = {
    facingMode: 'environment',
    width: { ideal: 1920 },
    height: { ideal: 1080 }
  };

  return (
    <div className="scan-container">
      {/* Header */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(10,14,26,0.9)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 1.5rem', height: 56,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>📷</span>
          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Radar Automático</span>
        </div>
        <Link href="/" className="btn btn-secondary btn-sm">← Panel</Link>
      </div>

      <div style={{ marginTop: 56, width: '100%', maxWidth: 480, padding: '1.5rem' }}>

        {/* ESTADO: IDLE */}
        {status === 'idle' && (
          <div className="scan-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '5rem', marginBottom: '1.5rem', lineHeight: 1 }}>🚗</div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 8 }}>
              Control de Acceso
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '2rem' }}>
              El sistema utilizará la cámara para escanear placas automáticamente.
            </p>

            {errorMsg && (
              <div style={{
                background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)',
                borderRadius: 'var(--radius-md)', padding: '12px 16px',
                color: 'var(--accent-red)', fontSize: '0.875rem', marginBottom: '1rem',
              }}>
                ⚠️ {errorMsg}
              </div>
            )}

            <button
              className="btn btn-primary"
              onClick={startCamera}
              style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: '1rem' }}
            >
              📡 Activar Radar Automático
            </button>
          </div>
        )}

        {/* ESTADO: CAMERA */}
        {status === 'camera' && (
          <div className="scan-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                🎯 Enfoca la placa
              </h3>
              {isAutoMode && (
                <div style={{ 
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'rgba(204, 255, 0, 0.1)', padding: '4px 8px',
                  borderRadius: 20, border: '1px solid rgba(204, 255, 0, 0.3)',
                  color: 'var(--accent-cyan)', fontSize: '0.75rem', fontWeight: 700
                }}>
                  <div className={`pulse-dot ${isScanningBg ? 'active' : ''}`} />
                  {isScanningBg ? 'Analizando...' : 'Radar Activo'}
                </div>
              )}
            </div>

            <div style={{ position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={videoConstraints}
                onUserMediaError={(err) => {
                  setStatus('idle');
                  setErrorMsg('No se pudo acceder a la cámara. Revisa permisos.');
                  console.error('Webcam Error:', err);
                }}
                className="camera-preview"
              />
              
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: 260, height: 80,
                  border: `2px solid ${isScanningBg ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.5)'}`,
                  borderRadius: 8,
                  boxShadow: isScanningBg ? 'var(--shadow-cyan)' : 'none',
                  position: 'relative', overflow: 'hidden',
                  transition: 'all 0.3s ease'
                }}>
                  {isScanningBg && <div className="scan-line" />}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: '1rem' }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={stopCamera}
              >
                ✕ Apagar Radar
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center', background: 'rgba(255,255,255,0.1)' }}
                onClick={() => captureAndSend(false)}
                disabled={isScanningBg}
              >
                📸 Forzar Captura
              </button>
            </div>
          </div>
        )}

        {/* ESTADO: PROCESSING (Solo para captura manual) */}
        {status === 'processing' && (
          <div className="scan-card" style={{ textAlign: 'center' }}>
            {capturedImage && (
              <img
                src={capturedImage}
                alt="Foto capturada"
                style={{ width: '100%', borderRadius: 'var(--radius-lg)', marginBottom: '1.5rem', maxHeight: 200, objectFit: 'cover' }}
              />
            )}
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔍</div>
            <h3 style={{ fontWeight: 700, marginBottom: 8 }}>Procesamiento Manual...</h3>
            
            <div style={{
              height: 6, background: 'var(--border)',
              borderRadius: 99, overflow: 'hidden', marginBottom: 8, marginTop: '1rem'
            }}>
              <div style={{
                height: '100%', width: `${progress}%`,
                background: 'var(--gradient-primary)',
                borderRadius: 99, transition: 'width 0.2s ease',
              }} />
            </div>
          </div>
        )}

        {/* ESTADO: RESULT */}
        {status === 'result' && result && (
          <div className="scan-card">
            {capturedImage && (
              <img
                src={capturedImage}
                alt="Foto capturada"
                style={{ width: '100%', borderRadius: 'var(--radius-lg)', marginBottom: '1rem', maxHeight: 180, objectFit: 'cover' }}
              />
            )}

            <div className={`result-card ${result.approved ? 'approved' : 'denied'}`}>
              <div className="result-icon">
                {result.approved ? '✅' : '❌'}
              </div>
              <div className={`result-title ${result.approved ? 'approved' : 'denied'}`}>
                {result.approved ? 'Acceso Permitido' : 'Acceso Denegado'}
              </div>

              {result.placa && (
                <div style={{ margin: '12px 0' }}>
                  <span className="placa-display" style={{ fontSize: '1.2rem', padding: '6px 16px' }}>
                    {result.placa}
                  </span>
                </div>
              )}

              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                {result.message || result.error || 'Ocurrió un problema inesperado.'}
              </p>

              {result.approved && result.cliente && (
                <div style={{
                  marginTop: 12, padding: '10px 16px',
                  background: 'rgba(0,255,136,0.05)', borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8rem', color: 'var(--text-muted)',
                }}>
                  👤 {result.cliente.nombre} · CC {result.cliente.cedula}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: '1rem' }}>
              {result.approved ? (
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 8, fontSize: '0.8rem', color: 'var(--accent-green)',
                  background: 'rgba(0,255,136,0.08)', borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(0,255,136,0.2)', padding: '12px', textAlign: 'center'
                }}>
                  <span>⏱️</span>
                  <span>Barrera abriendo... Volviendo al radar en unos segundos.</span>
                </div>
              ) : (
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={reset}
                >
                  🔄 Volver al Radar
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Estilos adicionales para animación */}
      <style dangerouslySetInnerHTML={{__html: `
        .pulse-dot {
          width: 8px; height: 8px; background: rgba(204,255,0,0.5); borderRadius: 50%;
        }
        .pulse-dot.active {
          background: var(--accent-cyan);
          box-shadow: 0 0 8px var(--accent-cyan);
          animation: pulse 1s infinite alternate;
        }
        @keyframes pulse {
          0% { opacity: 0.5; transform: scale(1); }
          100% { opacity: 1; transform: scale(1.5); }
        }
      `}} />
    </div>
  );
}
