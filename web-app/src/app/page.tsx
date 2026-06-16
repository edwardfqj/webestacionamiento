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
  const [form, setForm] = useState({ cedula: '', nombre: '', placa: '', pagado: false });

  const showToast = useCallback((type: Toast['type'], message: string) => {
    const id = toastId + 1;
    setToastId(id);
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
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
      showToast('error', 'Error al cargar los datos de la base de datos');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredClients = clients.filter(c =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    c.placa.toLowerCase().includes(search.toLowerCase()) ||
    c.cedula.includes(search)
  );

  const totalClientes = clients.length;
  const pagados = clients.filter(c => c.pagado).length;
  const noPagados = totalClientes - pagados;
  const accessosHoy = accesos.filter(a => new Date(a.created_at).toDateString() === new Date().toDateString()).length;

  const handleTogglePagado = async (client: Cliente) => {
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagado: !client.pagado }),
      });
      if (!res.ok) throw new Error();
      setClients(prev => prev.map(c => c.id === client.id ? { ...c, pagado: !c.pagado } : c));
    } catch {
      showToast('error', 'No se pudo actualizar el estado');
    }
  };

  const handleDelete = async (client: Cliente) => {
    if (!confirm(`¿Eliminar al cliente ${client.nombre}? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/clients/${client.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setClients(prev => prev.filter(c => c.id !== client.id));
      showToast('success', 'Cliente eliminado');
    } catch {
      showToast('error', 'No se pudo eliminar al cliente');
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
      const method = modalMode === 'add' ? 'POST' : 'PATCH';
      const url = modalMode === 'add' ? '/api/clients' : `/api/clients/${editingClient!.id}`;
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      if (modalMode === 'add') {
        setClients(prev => [...prev, data.client]);
        showToast('success', 'Cliente registrado');
      } else {
        setClients(prev => prev.map(c => c.id === editingClient!.id ? data.client : c));
        showToast('success', 'Información actualizada');
      }
      setModalMode(null);
    } catch (err: any) {
      showToast('error', err.message || 'Error guardando datos');
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <>
      <nav className="navbar">
        <Link href="/" className="navbar-brand">
          <div className="navbar-logo">P</div>
          <div>
            <div className="navbar-title">ParkSystem</div>
          </div>
        </Link>
        <div className="navbar-nav">
          <Link href="/" className="nav-link active">Dashboard</Link>
          <Link href="/scan" className="nav-link">Scanner</Link>
        </div>
      </nav>

      <main className="main-container">
        <header className="page-header">
          <div>
            <h1 className="page-title">Overview</h1>
            <p className="page-subtitle">Sistema de Control de Acceso ALPR</p>
          </div>
        </header>

        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">TOTAL VEHÍCULOS</div>
            <div className="stat-value">{totalClientes}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">PAGOS AL DÍA</div>
            <div className="stat-value">{pagados}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">PAGOS PENDIENTES</div>
            <div className="stat-value" style={{ color: noPagados > 0 ? 'var(--text-primary)' : 'inherit' }}>
              {noPagados}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">ESCANÉOS HOY</div>
            <div className="stat-value">{accessosHoy}</div>
          </div>
        </section>

        <section className="table-section">
          <div className="table-header">
            <div className="navbar-nav" style={{ padding: '2px', background: 'var(--bg-base)' }}>
              <button className={`nav-link ${activeTab === 'clientes' ? 'active' : ''}`} style={{ border: 'none', background: activeTab === 'clientes' ? 'var(--text-primary)' : 'transparent' }} onClick={() => setActiveTab('clientes')}>Directorio</button>
              <button className={`nav-link ${activeTab === 'accesos' ? 'active' : ''}`} style={{ border: 'none', background: activeTab === 'accesos' ? 'var(--text-primary)' : 'transparent' }} onClick={() => setActiveTab('accesos')}>Logs de Acceso</button>
            </div>
            
            {activeTab === 'clientes' && (
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <input type="text" className="search-input" placeholder="Buscar cédula o placa..." value={search} onChange={e => setSearch(e.target.value)} />
                <button className="btn btn-primary" onClick={openAddModal}>Registrar</button>
              </div>
            )}
          </div>

          <div className="table-container">
            {loading ? (
              <div className="empty-state">Cargando base de datos...</div>
            ) : activeTab === 'clientes' ? (
              filteredClients.length === 0 ? (
                <div className="empty-state"><p>No se encontraron registros.</p></div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Identificación</th>
                      <th>Propietario</th>
                      <th>Placa</th>
                      <th>Status de Pago</th>
                      <th>Registro</th>
                      <th style={{ textAlign: 'right' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map(client => (
                      <tr key={client.id}>
                        <td style={{ color: 'var(--text-secondary)' }}>{client.cedula}</td>
                        <td style={{ fontWeight: 500 }}>{client.nombre}</td>
                        <td className="placa-mono">{client.placa}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <button className={`toggle ${client.pagado ? 'active' : ''}`} onClick={() => handleTogglePagado(client)} aria-label="Toggle pago" />
                            {client.pagado ? <span className="badge badge-success">Saldado</span> : <span className="badge badge-neutral">Pendiente</span>}
                          </div>
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{formatDate(client.created_at)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-icon" onClick={() => openEditModal(client)}>Edit</button>
                          <button className="btn btn-icon btn-danger" onClick={() => handleDelete(client)}>Del</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              accesos.length === 0 ? (
                <div className="empty-state"><p>No hay eventos registrados.</p></div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Placa Detectada</th>
                      <th>Sujeto Identificado</th>
                      <th>Decisión del Sistema</th>
                      <th>Trigger</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accesos.map(acceso => (
                      <tr key={acceso.id}>
                        <td style={{ color: 'var(--text-muted)' }}>{formatDate(acceso.created_at)}</td>
                        <td className="placa-mono">{acceso.placa}</td>
                        <td>{acceso.nombre || <span style={{ color: 'var(--text-muted)' }}>Desconocido</span>}</td>
                        <td>
                          {acceso.resultado === 'permitido' ? <span className="badge badge-success">Authorized</span> : <span className="badge badge-danger">Denied</span>}
                        </td>
                        <td><span className="badge badge-neutral">{acceso.metodo}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>
        </section>
      </main>

      {modalMode && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModalMode(null); }}>
          <div className="modal">
            <h2 className="modal-title">{modalMode === 'add' ? 'Nuevo Registro' : 'Actualizar Datos'}</h2>
            <form className="form-group" onSubmit={handleSubmit}>
              <div className="form-group" style={{ marginBottom: '8px' }}>
                <label className="form-label">Cédula</label>
                <input className="form-input" required value={form.cedula} onChange={e => setForm({...form, cedula: e.target.value})} />
              </div>
              <div className="form-group" style={{ marginBottom: '8px' }}>
                <label className="form-label">Nombre Completo</label>
                <input className="form-input" required value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} />
              </div>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Placa (Alfanumérico)</label>
                <input className="form-input" required style={{ fontFamily: 'monospace', textTransform: 'uppercase' }} value={form.placa} onChange={e => setForm({...form, placa: e.target.value.toUpperCase()})} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <button type="button" className={`toggle ${form.pagado ? 'active' : ''}`} onClick={() => setForm({...form, pagado: !form.pagado})} />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Marcar como solvencia pagada</span>
              </div>
              
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalMode(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
        ))}
      </div>
    </>
  );
}
