'use client';

import { useState, useEffect, useCallback } from 'react';

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
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      // Evitar agresivamente el caché del navegador
      const res = await fetch(`/api/gate-status?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data: GateStatus = await res.json();
      
      // Si hay un nuevo mensaje basado en la fecha de actualización
      if (data.updated_at && data.updated_at !== lastUpdate && data.message) {
        setGateData(data);
        setLastUpdate(data.updated_at);
        
        // Reproducir audio
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(data.message);
          utterance.lang = 'es-ES';
          utterance.rate = 0.9;
          window.speechSynthesis.speak(utterance);
        }

        // Volver a standby después de 8 segundos
        setTimeout(() => {
          setGateData(null);
        }, 8000);
      }
    } catch (e) {
      console.error('Error fetching gate status', e);
    }
  }, [lastUpdate]);

  useEffect(() => {
    const timer = setInterval(fetchStatus, 2000);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  // Si no hay mensaje reciente, mostrar pantalla de espera
  if (!gateData || !gateData.message) {
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-base)',
        color: 'var(--text-primary)',
        textAlign: 'center',
        padding: '2rem'
      }}>
        <h1 style={{ fontSize: '4rem', fontWeight: 800, marginBottom: '1rem', color: 'var(--accent-primary)' }}>
          SISTEMA AUTOMÁTICO
        </h1>
        <p style={{ fontSize: '2rem', color: 'var(--text-secondary)' }}>
          Acerque su vehículo a la barrera para escanear su placa
        </p>
      </div>
    );
  }

  // Mostrar mensaje de éxito o error
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
      color: '#ffffff', // Siempre blanco sobre fondo rojo/azul
      textAlign: 'center',
      padding: '4rem',
      transition: 'background-color 0.5s ease'
    }}>
      <h2 style={{ fontSize: '3rem', fontWeight: 700, opacity: 0.9, letterSpacing: '0.1em' }}>
        {gateData.placa || 'VEHÍCULO DETECTADO'}
      </h2>
      <h1 style={{ 
        fontSize: '6rem', 
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
