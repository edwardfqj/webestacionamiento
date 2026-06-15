'use client';

import { useState, useRef, useCallback } from 'react';
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

  const [status, setStatus] = useState<ScanStatus>('idle');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const startCamera = () => {
    setErrorMsg('');
    setStatus('camera');
  };

  const stopCamera = () => {
    setStatus('idle');
  };

  const captureAndSend = useCallback(async () => {
    if (!webcamRef.current) return;

    // Obtener la imagen en base64 usando react-webcam
    const imageSrc = webcamRef.current.getScreenshot({ width: 1920, height: 1080 });
    if (!imageSrc) {
      setErrorMsg('No se pudo capturar la imagen. Intenta de nuevo.');
      return;
    }

    setCapturedImage(imageSrc);
    setStatus('processing');

    // Animación de progreso
    let prog = 0;
    const interval = setInterval(() => {
      prog += Math.random() * 15;
      if (prog > 90) { clearInterval(interval); prog = 90; }
      setProgress(Math.min(prog, 90));
    }, 200);

    try {
      // Convertir dataURL a Blob
      const res = await fetch(imageSrc);
      const blob = await res.blob();

      const formData = new FormData();
      formData.append('image', blob, 'plate.jpg');

      const response = await fetch('/api/check-plate', {
        method: 'POST',
        body: formData,
      });

      clearInterval(interval);
      setProgress(100);

      const data = await response.json();
      setResult(data);
      setStatus('result');
    } catch {
      clearInterval(interval);
      setResult({
        approved: false,
        placa: null,
        message: 'Error de conexión. Intenta nuevamente.',
        error: 'network_error',
      });
      setStatus('result');
    }
  }, []);

  const reset = () => {
    setStatus('idle');
    setResult(null);
    setCapturedImage(null);
    setProgress(0);
    setErrorMsg('');
  };

  // Restricciones de cámara: buscar cámara trasera por defecto
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
          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Escáner de Placas</span>
        </div>
        <Link href="/" className="btn btn-secondary btn-sm">← Panel</Link>
      </div>

      <div style={{ marginTop: 56, width: '100%', maxWidth: 480, padding: '1.5rem' }}>

        {/* ESTADO: IDLE */}
        {status === 'idle' && (
          <div className="scan-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '5rem', marginBottom: '1.5rem', lineHeight: 1 }}>🚗</div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 8 }}>
              Verificar Acceso
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '2rem' }}>
              Apunta la cámara hacia la placa del vehículo para verificar si tiene el pago al día.
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
              id="btn-start-camera"
              onClick={startCamera}
              style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: '1rem' }}
            >
              📷 Abrir Cámara
            </button>

            <div style={{
              marginTop: '1.5rem', padding: '1rem',
              background: 'rgba(0,212,255,0.05)', borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(0,212,255,0.1)',
              fontSize: '0.8rem', color: 'var(--text-muted)',
            }}>
              💡 Asegúrate de enfocar bien la placa y que haya buena iluminación
            </div>
          </div>
        )}

        {/* ESTADO: CAMERA */}
        {status === 'camera' && (
          <div className="scan-card">
            <h3 style={{ marginBottom: '1rem', fontWeight: 600, textAlign: 'center', fontSize: '0.95rem' }}>
              🎯 Enfoca la placa del vehículo
            </h3>

            <div style={{ position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              
              {/* COMPONENTE REACT-WEBCAM */}
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={videoConstraints}
                onUserMediaError={(err) => {
                  setStatus('idle');
                  setErrorMsg('No se pudo acceder a la cámara. Revisa permisos o intenta con HTTPS.');
                  console.error('Webcam Error:', err);
                }}
                className="camera-preview"
              />
              
              {/* Overlay con marco de escaneo */}
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: 260, height: 80,
                  border: '2px solid var(--accent-cyan)',
                  borderRadius: 8,
                  boxShadow: '0 0 20px rgba(0,212,255,0.3)',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  <div className="scan-line" />
                  {/* Esquinas */}
                  {[['0','0','1px','0'], ['0','0','0','1px'], ['auto','0','1px','0'], ['auto','0','0','1px'],
                    ['0','auto','1px','0'], ['0','auto','0','1px'], ['auto','auto','1px','0'], ['auto','auto','0','1px']].map((_, i) => (
                    <div key={i} style={{
                      position: 'absolute',
                      top: i < 2 ? 0 : i < 4 ? 0 : i < 6 ? 'auto' : 'auto',
                      bottom: i < 4 ? 'auto' : 0,
                      left: i % 2 === 0 ? 0 : 'auto',
                      right: i % 2 === 0 ? 'auto' : 0,
                      width: 16, height: 16,
                      borderColor: 'var(--accent-cyan)',
                      borderStyle: 'solid',
                      borderWidth: i < 2 ? (i === 0 ? '2px 0 0 2px' : '2px 2px 0 0') :
                                          i < 4 ? (i === 2 ? '0 0 2px 2px' : '0 2px 2px 0') :
                                          i < 6 ? (i === 4 ? '2px 0 0 2px' : '2px 2px 0 0') :
                                                  (i === 6 ? '0 0 2px 2px' : '0 2px 2px 0'),
                    }} />
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: '1rem' }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={stopCamera}
                id="btn-cancel-camera"
              >
                ✕ Cancelar
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 2, justifyContent: 'center', padding: '14px', fontSize: '1rem' }}
                onClick={captureAndSend}
                id="btn-capture"
              >
                📸 Capturar Placa
              </button>
            </div>
          </div>
        )}

        {/* ESTADO: PROCESSING */}
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
            <h3 style={{ fontWeight: 700, marginBottom: 8 }}>Analizando placa...</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              Reconociendo texto y verificando en la base de datos
            </p>

            {/* Progress bar */}
            <div style={{
              height: 6, background: 'var(--border)',
              borderRadius: 99, overflow: 'hidden', marginBottom: 8,
            }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                background: 'var(--gradient-primary)',
                borderRadius: 99,
                transition: 'width 0.2s ease',
                boxShadow: 'var(--shadow-cyan)',
              }} />
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{Math.round(progress)}%</p>
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
                {result.message}
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
              <button
                className="btn btn-secondary"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={reset}
                id="btn-scan-again"
              >
                🔄 Escanear Otra
              </button>
              {result.approved && (
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 8, fontSize: '0.8rem', color: 'var(--accent-green)',
                  background: 'rgba(0,255,136,0.08)', borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(0,255,136,0.2)', padding: '8px',
                }}>
                  <span>⏱️</span>
                  <span>Barrera abriendo...</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
