'use client';

import { useState } from 'react';
import { ShieldCheck, Lock, ArrowRight, LoaderCircle, AlertTriangle, Eye, EyeOff, UserCheck } from 'lucide-react';
import { TEAM_OPTIONS } from '../lib/auth-users';

function Bowl({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M10 31h44c-2 15-10 24-22 24S12 46 10 31Z" stroke="currentColor" strokeWidth="3" />
      <path d="M8 31h48M20 58h24M16 22l38-9M14 15l37-9M24 24c-5-5 5-7 0-12M33 24c-5-5 5-7 0-12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

interface LoginScreenProps {
  onSuccess: () => Promise<void>;
  initialError?: string;
}

export default function LoginScreen({ onSuccess, initialError = '' }: LoginScreenProps) {
  const [selectedUser, setSelectedUser] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);

  const currentUser = TEAM_OPTIONS.find((u) => u.key === selectedUser);
  const isAdmin = currentUser?.isAdmin || selectedUser === 'admin';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!selectedUser) {
      setError('Por favor selecciona tu usuario en el menú desplegable.');
      return;
    }

    if (isAdmin && !password.trim()) {
      setError('Por favor ingresa la contraseña de Administrador.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userKey: selectedUser,
          password: isAdmin ? password : '',
        }),
      });

      const data = (await res.json()) as any;
      if (!res.ok) {
        throw new Error(data.error || 'Error al iniciar sesión.');
      }

      // Ensure cookie is available on client side as well
      document.cookie = `auth_user=${encodeURIComponent(selectedUser)}; path=/; max-age=31536000; SameSite=Lax`;

      // Success - reload application state
      await onSuccess();
    } catch (err: any) {
      setError(err.message || 'Error de autenticación. Intenta nuevamente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="access-screen">
      <section className="access-card" style={{ maxWidth: '440px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--red, #b6372a)', marginBottom: '14px' }}>
          <Bowl size={48} />
        </div>
        <div className="access-brand">
          SHIMAYA
          <small>RAMEN · INVENTARIOS</small>
        </div>

        <h1 style={{ fontSize: '22px', marginTop: '18px', marginBottom: '8px' }}>Iniciar Sesión</h1>
        <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '22px' }}>
          Selecciona tu usuario en el botón desplegable para ingresar al sistema.
        </p>

        {error && (
          <div
            className="error"
            role="alert"
            style={{
              padding: '12px 14px',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '12px',
              marginBottom: '18px',
            }}
          >
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ textAlign: 'left' }}>
          {/* Menú Desplegable con el Equipo */}
          <div className="field" style={{ marginTop: '0' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#333' }}>
              Usuario del equipo:
            </span>
            <select
              aria-label="Selecciona tu usuario"
              value={selectedUser}
              onChange={(e) => {
                setSelectedUser(e.target.value);
                setPassword('');
                setError('');
              }}
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: '14px',
                borderRadius: '8px',
                border: '1px solid #c9d2c5',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              <option value="">-- Selecciona tu usuario --</option>
              {TEAM_OPTIONS.map((member) => (
                <option key={member.key} value={member.key}>
                  {member.isAdmin ? '👑 ' : '👤 '} {member.name}
                </option>
              ))}
            </select>
          </div>

          {/* Campo de Contraseña SOLO para ADMIN */}
          {isAdmin && (
            <div className="field" style={{ marginTop: '16px' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#333' }}>
                Contraseña de Administrador:
              </span>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Ingresa la contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  required
                  style={{
                    width: '100%',
                    padding: '12px 42px 12px 14px',
                    fontSize: '14px',
                    borderRadius: '8px',
                    border: '1px solid #c9d2c5',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <small style={{ color: 'var(--muted)', fontSize: '11px', marginTop: '6px', display: 'block' }}>
                Acceso maestro con todas las opciones del sistema.
              </small>
            </div>
          )}

          {/* Mensaje informativo para usuarios del equipo (sin contraseña) */}
          {selectedUser && !isAdmin && (
            <div
              style={{
                marginTop: '16px',
                padding: '12px 14px',
                background: '#f2f7ef',
                border: '1px solid #d5e4cf',
                borderRadius: '8px',
                fontSize: '12px',
                color: 'var(--green, #3d6550)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <UserCheck size={18} style={{ flexShrink: 0 }} />
              <span>
                <strong>Acceso sin contraseña:</strong> Tendrás habilitadas las opciones de <strong>Pedido</strong>, <strong>Despacho</strong> y <strong>Stock</strong>.
              </span>
            </div>
          )}

          <button
            type="submit"
            className="btn full"
            disabled={busy || !selectedUser}
            style={{
              marginTop: '22px',
              padding: '14px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {busy ? (
              <>
                <LoaderCircle className="spin" size={17} />
                <span>Verificando acceso…</span>
              </>
            ) : (
              <>
                <span>
                  {isAdmin
                    ? 'Ingresar como Administrador'
                    : selectedUser
                    ? `Ingresar como ${currentUser?.name || selectedUser}`
                    : 'Selecciona un usuario'}
                </span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
      </section>
    </main>
  );
}
