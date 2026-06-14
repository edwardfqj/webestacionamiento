'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

type Cliente = {
  id: number;
  cedula: string;
  nombre: string;
  placa: string;
  pagado: boolean;
  created_at: string;
  updated_at: string;
};

type Acceso = {
  id: number;
  placa: string;
  nombre: string | null;
  resultado: 'permitido' | 'denegado';
  metodo: string;
  created_at: string;
};

type Toast = { id: number; type: 'success' | 'error' | 'info'; message: string };

type ModalMode = 'add' | 'edit' | null;

export default function HomePage() {
  const [clients, setClients] = useState<Cliente[]>([]);
  const [accesos, setAccesos] = useState<Acceso[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'clientes' | 'accesos'>('clientes');
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editingClient, setEditingClient] = useState<Cliente | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [toastId, setToastId] = useState(0);
  const [gateOpen, setGateOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Form state
  const [form, setForm] = useState({ cedula: '', nombre: '', placa: '', pagado: false });

  const showToast = useCallback((type: Toast['type'], message: string) => {
    const id = toastId + 1;
    setToastId(id);
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, [toastId]);

  const fetchData = useCallback(async () => {
    try {
      const [clientsRes, accesosRes] = await Promise.all([
        fetch('/api/clients'),
        fetch('/api/accesos'),
      ]);
      const clientsData = await clientsRes.json();
      const accesosData = await accesosRes.json();
      setClients(clientsData.clients || []);
      setAccesos(accesosData.accesos || []);
    } catch {
      showToast('error', 'Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const fetchGateStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/gate-status');
      const data = await res.json();
      setGateOpen(data.open);
    } catch {}
  }, []);

  useEffect(() => {
    fetchData();
    fetchGateStatus();
    const interval = setInterval(fetchGateStatus, 2000);
    return () => clearInterval(interval);
  }, [fetchData, fetchGateStatus]);

  // Filtrar clientes
  const filteredClients = clients.filter(c =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    c.placa.toLowerCase().includes(search.toLowerCase()) ||
    c.cedula.includes(search)
  );

  // Stats
  const totalClientes = clients.length;
  const pagados = clients.filter(c => c.pagado).length;
  const noPagados = totalClientes - pagados;
  const accessosHoy = accesos.filter(a => {
    const today = new Date().toDateString();
    return new Date(a.created_at).toDateString() === today;
  }).length;

  const handleTogglePagado = async (client: Cliente) => {
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagado: !client.pagado }),
      });
      if (!res.ok) throw new Error();
      setClients(prev => prev.map(c =>
        c.id === client.id ? { ...c, pagado: !c.pagado } : c
      ));
      showToast('success', `${client.nombre}: estado ${!client.pagado ? 'PAGADO' : 'PENDIENTE'}`);
    } catch {
      showToast('error', 'Error al actualizar el estado');
    }
  };

  const handleDelete = async (client: Cliente) => {
    if (!confirm(`¿Eliminar a ${client.nombre}?`)) return;
    setDeletingId(client.id);
    try {
      const res = await fetch(`/api/clients/${client.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setClients(prev => prev.filter(c => c.id !== client.id));
      showToast('success', `${client.nombre} eliminado correctamente`);
    } catch {
      showToast('error', 'Error al eliminar cliente');
    } finally {
      setDeletingId(null);
    }
  };

  const openAddModal = () => {
    setForm({ cedula: '', nombre: '', placa: '', pagado: false });
    setEditingClient(null);
    setModalMode('add');
  };

  const openEditModal = (client: Cliente) => {
    setForm({ cedula: client.cedula, nombre: client.nombre, placa: client.placa, pagado: client.pagado });
    setEditingClient(client);
    setModalMode('edit');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (modalMode === 'add') {
        const res = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setClients(prev => [...prev, data.client]);
        showToast('success', `${form.nombre} registrado correctamente`);
      } else if (editingClient) {
        const res = await fetch(`/api/clients/${editingClient.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setClients(prev => prev.map(c => c.id === editingClient.id ? data.client : c));
        showToast('success', 'Cliente actualizado');
      }
      setModalMode(null);
    } catch (err: any) {
      showToast('error', err.message || 'Error al guardar');
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <>
      {/* NAVBAR */}
      <nav className="navbar">
        <a href="/" className="navbar-brand">
          <div className="navbar-logo">🅿️</div>
          <div>
            <div className="navbar-title">ParkSystem Pro</div>
            <div className="navbar-subtitle">Panel de Administración</div>
          </div>
        </a>
        <div className="navbar-nav">
          <Link href="/" className="nav-link active">🏠 Panel</Link>
          <Link href="/scan" className="nav-link">📷 Escáner</Link>
        </div>
      </nav>

      <main className="main-container">
        {/* HEADER */}
        <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="page-title">Panel de Control</h1>
            <p className="page-subtitle">Gestiona los vehículos y el estado de la barrera</p>
          </div>
          {/* Gate Status */}
          <div className={`gate-indicator ${gateOpen ? 'open' : 'closed'}`}>
            <div className={`gate-dot ${gateOpen ? 'open' : 'closed'}`} />
            <span>Barrera: {gateOpen ? 'ABIERTA' : 'CERRADA'}</span>
          </div>
        </div>

        {/* STATS */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">🚗</div>
            <div className="stat-value">{totalClientes}</div>
            <div className="stat-label">Total Vehículos</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">✅</div>
            <div className="stat-value">{pagados}</div>
            <div className="stat-label">Pagados</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">⏳</div>
            <div className="stat-value">{noPagados}</div>
            <div className="stat-label">Pendientes</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">📋</div>
            <div className="stat-value">{accessosHoy}</div>
            <div className="stat-label">Accesos Hoy</div>
          </div>
        </div>

        {/* TABS */}
        <div className="card">
          <div className="card-header">
            <div className="tabs">
              <button
                className={`tab ${activeTab === 'clientes' ? 'active' : ''}`}
                onClick={() => setActiveTab('clientes')}
              >🚗 Clientes</button>
              <button
                className={`tab ${activeTab === 'accesos' ? 'active' : ''}`}
                onClick={() => setActiveTab('accesos')}
              >📋 Historial</button>
            </div>

            {activeTab === 'clientes' && (
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="search-bar">
                  <span className="search-icon">🔍</span>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Buscar por nombre, placa o cédula..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ paddingLeft: '40px', width: '260px' }}
                    id="search-input"
                  />
                </div>
                <button className="btn btn-primary" onClick={openAddModal} id="btn-add-client">
                  ＋ Agregar Cliente
                </button>
              </div>
            )}
          </div>

          {/* TABLA CLIENTES */}
          {activeTab === 'clientes' && (
            <div className="table-container">
              {loading ? (
                <div className="empty-state">
                  <div className="loading-spinner" style={{ width: 40, height: 40, margin: '0 auto' }} />
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">🔍</div>
                  <div className="empty-state-text">No se encontraron clientes</div>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Cédula</th>
                      <th>Nombre</th>
                      <th>Placa</th>
                      <th>Estado</th>
                      <th>Registrado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map(client => (
                      <tr key={client.id}>
                        <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                          {client.cedula}
                        </td>
                        <td>
                          <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                            {client.nombre}
                          </span>
                        </td>
                        <td>
                          <span className="placa-display">{client.placa}</span>
                        </td>
                        <td>
                          <div
                            className="toggle-container"
                            onClick={() => handleTogglePagado(client)}
                            title={client.pagado ? 'Marcar como no pagado' : 'Marcar como pagado'}
                          >
                            <button
                              className={`toggle ${client.pagado ? 'active' : ''}`}
                              id={`toggle-${client.id}`}
                              aria-label="Toggle pagado"
                            />
                            <span className={`badge ${client.pagado ? 'badge-success' : 'badge-danger'}`}>
                              {client.pagado ? '✓ Pagado' : '✗ Pendiente'}
                            </span>
                          </div>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          {formatDate(client.created_at)}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => openEditModal(client)}
                              id={`btn-edit-${client.id}`}
                              title="Editar"
                            >✏️</button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleDelete(client)}
                              disabled={deletingId === client.id}
                              id={`btn-delete-${client.id}`}
                              title="Eliminar"
                            >
                              {deletingId === client.id ? '...' : '🗑️'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TABLA ACCESOS */}
          {activeTab === 'accesos' && (
            <div className="table-container">
              {accesos.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📋</div>
                  <div className="empty-state-text">No hay registros de acceso aún</div>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Fecha/Hora</th>
                      <th>Placa</th>
                      <th>Nombre</th>
                      <th>Resultado</th>
                      <th>Método</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accesos.map(acceso => (
                      <tr key={acceso.id}>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          {formatDate(acceso.created_at)}
                        </td>
                        <td>
                          <span className="placa-display">{acceso.placa}</span>
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>
                          {acceso.nombre || '—'}
                        </td>
                        <td>
                          <span className={`badge ${acceso.resultado === 'permitido' ? 'badge-success' : 'badge-danger'}`}>
                            {acceso.resultado === 'permitido' ? '✓ Permitido' : '✗ Denegado'}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-info">
                            {acceso.metodo === 'camara' ? '📷 Cámara' : '🔘 Pulsador'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </main>

      {/* MODAL ADD/EDIT */}
      {modalMode && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModalMode(null); }}>
          <div className="modal">
            <h2 className="modal-title">
              {modalMode === 'add' ? '➕ Agregar Cliente' : '✏️ Editar Cliente'}
            </h2>
            <form className="modal-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="modal-cedula">Cédula</label>
                <input
                  id="modal-cedula"
                  type="text"
                  className="form-input"
                  placeholder="Ej: 1234567890"
                  value={form.cedula}
                  onChange={e => setForm(f => ({ ...f, cedula: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="modal-nombre">Nombre Completo</label>
                <input
                  id="modal-nombre"
                  type="text"
                  className="form-input"
                  placeholder="Ej: Juan Pérez"
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="modal-placa">Placa del Vehículo</label>
                <input
                  id="modal-placa"
                  type="text"
                  className="form-input"
                  placeholder="Ej: ABC123"
                  value={form.placa}
                  onChange={e => setForm(f => ({ ...f, placa: e.target.value.toUpperCase() }))}
                  required
                  style={{ fontFamily: 'monospace', letterSpacing: '0.1em', fontWeight: 700 }}
                  maxLength={8}
                />
              </div>
              <div className="toggle-container" onClick={() => setForm(f => ({ ...f, pagado: !f.pagado }))}>
                <button
                  type="button"
                  className={`toggle ${form.pagado ? 'active' : ''}`}
                  aria-label="Pagado"
                />
                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  {form.pagado ? '✅ Marcado como pagado' : '⏳ Pendiente de pago'}
                </span>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalMode(null)} id="btn-modal-cancel">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" id="btn-modal-save">
                  {modalMode === 'add' ? 'Registrar' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TOASTS */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <span>{toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'}</span>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}
