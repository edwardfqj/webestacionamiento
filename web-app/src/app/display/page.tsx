'use client';

import { useState, useEffect, useRef } from 'react';

type GateStatus = {
  open: boolean;
  placa: string | null;
  status: string;
  updated_at: string | null;
  message: string | null;
  message_type: 'success' | 'error' | 'info';
};

export default function DisplayPage() {
  const [gateData, setGateData] = useState<GateStatus | null>(null);
  const [debugLog, setDebugLog] = useState<string>('Iniciando...');
  const [audioUnlocked, setAudioUnlocked] = useState<boolean>(false);
  const lastUpdateRef = useRef<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hasSpokenRef = useRef<string | null>(null);

  const speakMessage = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error('Error al reproducir voz:', e);
    }
  };

  const unlockAudio = () => {
    setAudioUnlocked(true);
    speakMessage('Sistema de voz habilitado.');
  };

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/gate-status?t=${Date.now()}`, { cache: 'no-store' });
        
        if (!res.ok) {
          setDebugLog(`Error HTTP ${res.status}: ${res.statusText}`);
          return;
        }

        const data: GateStatus = await res.json();
        setDebugLog(`OK | msg: "${data.message || 'Sin mensaje'}" | type: ${data.message_type} | updated: ${data.updated_at}`);

        // Si hay un nuevo mensaje válido (updated_at cambió y message no es nulo)
        if (data.updated_at && data.updated_at !== lastUpdateRef.current && data.message) {
          lastUpdateRef.current = data.updated_at;
          setGateData(data);

          // Reproducir audio solo una vez para este timestamp
          if (hasSpokenRef.current !== data.updated_at) {
            hasSpokenRef.current = data.updated_at;
            speakMessage(data.message);
          }

          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            setGateData(null);
          }, 10000);
        }
      } catch (e: any) {
        setDebugLog(`CATCH: ${e?.message || e}`);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  // Pantalla de espera (standby)
  if (!gateData || !gateData.message) {
    return (
      <div 
        onClick={unlockAudio}
        style={{
          height: '100vh',
          width: '100vw',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-base)',
          color: 'var(--text-primary)',
          textAlign: 'center',
          padding: '2rem',
          cursor: audioUnlocked ? 'default' : 'pointer'
        }}
      >
        <img src="/facultad-logo.png" alt="Logo Facultad" style={{ maxWidth: '80%', maxHeight: '160px', objectFit: 'contain', marginBottom: '2rem' }} />
        <h1 style={{ fontSize: '3.5rem', fontWeight: 800, marginBottom: '1rem', color: 'var(--accent-primary)' }}>
          SISTEMA AUTOMÁTICO
        </h1>
        <p style={{ fontSize: '2rem', color: 'var(--text-secondary)', marginBottom: '3rem' }}>
          Acerque su vehículo a la barrera para escanear su placa
        </p>

        {!audioUnlocked ? (
          <button 
            onClick={unlockAudio}
            style={{
              padding: '12px 28px',
              fontSize: '1.2rem',
              fontWeight: 600,
              backgroundColor: 'var(--accent-primary)',
              color: 'white',
              border: 'none',
              borderRadius: '30px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              animation: 'pulse 2s infinite'
            }}
          >
            🔊 Toca aquí para activar la voz del sistema
          </button>
        ) : (
          <div style={{ fontSize: '1rem', color: 'var(--color-success)', fontWeight: 600 }}>
            ✓ Voz del sistema activada
          </div>
        )}

        <div style={{ 
          position: 'fixed', bottom: '1rem', left: '1rem', right: '1rem',
          background: 'rgba(0,0,0,0.8)', color: '#0f0', fontFamily: 'monospace',
          padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.8rem', textAlign: 'left'
        }}>
          DEBUG: {debugLog} | Audio: {audioUnlocked ? 'Activo' : 'Bloqueado por navegador'}
        </div>
      </div>
    );
  }

  const isSuccess = gateData.message_type === 'success';

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isSuccess ? 'var(--color-success)' : 'var(--color-error)',
      color: '#ffffff',
      textAlign: 'center',
      padding: '4rem',
      transition: 'background-color 0.5s ease'
    }}>
      <h2 style={{ fontSize: '3rem', fontWeight: 700, opacity: 0.9, letterSpacing: '0.1em' }}>
        {gateData.placa || 'VEHÍCULO DETECTADO'}
      </h2>
      <h1 style={{ 
        fontSize: '5rem', 
        fontWeight: 800, 
        marginTop: '2rem',
        lineHeight: 1.1,
        textShadow: '0 4px 12px rgba(0,0,0,0.2)'
      }}>
        {gateData.message}
      </h1>
      <div style={{ marginTop: '4rem', opacity: 0.8, fontSize: '1.5rem' }}>
        {isSuccess ? 'BARRERA ABIERTA - PUEDE AVANZAR' : 'BARRERA CERRADA - POR FAVOR REGRESE'}
      </div>
    </div>
  );
}
