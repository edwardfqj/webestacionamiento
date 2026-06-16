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

export default function ScanPage() {
  const webcamRef = useRef<Webcam>(null);
  const isScanningRef = useRef(false);

  const [status, setStatus] = useState<ScanStatus>('idle');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [isScanningBg, setIsScanningBg] = useState(false);

  const startCamera = () => {
    setErrorMsg('');
    setStatus('camera');
    setIsAutoMode(true);
  };

  const stopCamera = () => {
    setStatus('idle');
    setIsAutoMode(false);
  };

  const reset = useCallback(() => {
    setStatus('camera');
    setResult(null);
    setErrorMsg('');
    setIsAutoMode(true);
  }, []);

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

      const response = await fetch('/api/check-plate', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();

      if (isBackground) {
        if (data.placa) {
          setResult(data);
          setStatus('result');
          setIsAutoMode(false);
          if (data.approved) setTimeout(reset, 8000);
        }
      } else {
        setResult(data);
        setStatus('result');
      }
    } catch {
      if (!isBackground) {
        setResult({ approved: false, placa: null, message: 'Connection Error' });
        setStatus('result');
      }
    } finally {
      isScanningRef.current = false;
      setIsScanningBg(false);
    }
  }, [reset]);

  useEffect(() => {
    if (status !== 'camera' || !isAutoMode) return;
    const timer = setInterval(() => captureAndSend(true), 4000);
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
              Sistema de reconocimiento automático de placas. Coloque la cámara apuntando hacia el acceso vehicular.
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
              {isAutoMode && (
                <div className="scan-status-pill">
                  <div className="scan-dot" />
                  {isScanningBg ? 'Analyzing' : 'Standby'}
                </div>
              )}
            </div>
            
            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button className="btn btn-secondary" onClick={stopCamera}>Suspender</button>
              <button className="btn btn-primary" onClick={() => captureAndSend(false)} disabled={isScanningBg}>
                Forzar Escaneo
              </button>
            </div>
          </div>
        )}

        {status === 'processing' && (
          <div style={{ textAlign: 'center' }}>
            <div className="scan-dot" style={{ width: 16, height: 16, margin: '0 auto 1.5rem auto' }} />
            <h3 style={{ fontWeight: 500 }}>Procesando frame...</h3>
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
                {result.approved ? 'ACCESO AUTORIZADO' : 'ACCESO DENEGADO'}
              </h2>
              {result.placa && <div className="result-placa">{result.placa}</div>}
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{result.message}</p>
              
              {result.approved && result.cliente && (
                <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Propietario Identificado</div>
                  <div style={{ fontWeight: 500, fontSize: '1rem', marginTop: '4px' }}>{result.cliente.nombre}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>ID: {result.cliente.cedula}</div>
                </div>
              )}
            </div>

            <div style={{ marginTop: '2rem' }}>
              {result.approved ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Restableciendo sistema automáticamente...</p>
              ) : (
                <button className="btn btn-secondary" style={{ width: '100%' }} onClick={reset}>Continuar Escaneo</button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
