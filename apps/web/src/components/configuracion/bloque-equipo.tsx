'use client';

import React, { useState, useEffect } from 'react';
import {
  Plus,
  Send,
  Phone,
  Mail,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Lock,
  UserMinus,
  X,
} from 'lucide-react';
import {
  listarMiembrosEquipoApi,
  listarRolesAgenciaApi,
  invitarMiembroApi,
  darDeBajaMiembroApi,
  formatearFechaIngreso,
  ErrorMiembrosApi,
  interpretarErrorInvitacion,
  type MiembroEquipo,
  type RolAgencia,
  type ErrorInvitacion,
} from '../../lib/equipo-api';
import { useFocoModal } from '../../lib/use-foco-modal';
import { esModoDemo } from '../../lib/modo-demo';
import { DistintivoDatosDemo } from '../comun/distintivo-datos-demo';

export function BloqueEquipo() {
  const [miembros, setMiembros] = useState<MiembroEquipo[]>([]);
  const [roles, setRoles] = useState<RolAgencia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorLista, setErrorLista] = useState<{ sinPermiso: boolean; mensaje: string } | null>(
    null,
  );
  const [esDemo, setEsDemo] = useState(false);
  const [bajaPendiente, setBajaPendiente] = useState<string | null>(null);
  const [errorBaja, setErrorBaja] = useState<string | null>(null);
  const [modalInvitar, setModalInvitar] = useState(false);

  // Formulario de invitación
  const [correo, setCorreo] = useState('');
  const [rolId, setRolId] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errorInvitacion, setErrorInvitacion] = useState<ErrorInvitacion | null>(null);
  const [exitoInvitacion, setExitoInvitacion] = useState<string | null>(null);

  const modalRef = useFocoModal<HTMLDivElement>({
    abierto: modalInvitar,
    alCerrar: () => setModalInvitar(false),
  });

  const cargarDatos = async () => {
    setEsDemo(esModoDemo());
    setErrorLista(null);
    try {
      const rolesRes = await listarRolesAgenciaApi();
      setRoles(rolesRes);
      if (rolesRes.length > 0 && !rolId) {
        const defaultRol = rolesRes.find((r) => r.clave === 'ASESOR') ?? rolesRes[0];
        if (defaultRol) setRolId(defaultRol.id);
      }
      setMiembros(await listarMiembrosEquipoApi());
    } catch (err) {
      setMiembros([]);
      if (err instanceof ErrorMiembrosApi && err.estado === 403) {
        setErrorLista({ sinPermiso: true, mensaje: 'No tienes permiso para ver el equipo.' });
      } else {
        setErrorLista({
          sinPermiso: false,
          mensaje: err instanceof Error ? err.message : 'No se pudo cargar el equipo.',
        });
      }
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarDatos();
  }, []);

  const confirmarBaja = async (id: string) => {
    setErrorBaja(null);
    try {
      await darDeBajaMiembroApi(id);
      setBajaPendiente(null);
      await cargarDatos();
    } catch (err) {
      setErrorBaja(err instanceof Error ? err.message : 'No se pudo dar de baja al miembro.');
    }
  };

  const totalDuenos = miembros.filter(
    (m) => m.rolClave === 'DUENO' && m.estado === 'ACTIVO',
  ).length;
  const totalAsesores = miembros.filter(
    (m) => m.rolClave === 'ASESOR' && m.estado === 'ACTIVO',
  ).length;
  const totalInvitados = miembros.filter((m) => m.estado === 'INVITADO').length;

  const handleEnviarInvitacion = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorInvitacion(null);
    setExitoInvitacion(null);

    if (!correo.trim()) {
      setErrorInvitacion({
        codigo: 'CORREO_REQUERIDO',
        mensaje: 'El correo electrónico es obligatorio para enviar la invitación.',
        queHacer: 'Escribe el correo del nuevo asesor.',
      });
      return;
    }

    setEnviando(true);
    try {
      await invitarMiembroApi({
        correo: correo.trim(),
        rolId: rolId || (roles[0]?.id ?? ''),
        ...(nombre.trim() ? { nombre: nombre.trim() } : {}),
        ...(telefono.trim() ? { telefono: telefono.trim() } : {}),
      });

      setExitoInvitacion(
        'Invitación despachada a ' +
          correo.trim() +
          '. El asesor podrá ingresar mediante su enlace seguro.',
      );
      setCorreo('');
      setNombre('');
      setTelefono('');
      setModalInvitar(false);
      await cargarDatos();
    } catch (err) {
      setErrorInvitacion(interpretarErrorInvitacion(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tarjetas Resumen */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            Total Usuarios
          </span>
          <p className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">
            {miembros.length}
          </p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            Dueños Activos
          </span>
          <p className="mt-1 text-2xl font-bold text-purple-600 dark:text-purple-400">
            {totalDuenos}
          </p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            Asesores Activos
          </span>
          <p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">
            {totalAsesores}
          </p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            Invitaciones Pendientes
          </span>
          <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {totalInvitados}
          </p>
        </div>
      </div>

      {exitoInvitacion && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{exitoInvitacion}</span>
        </div>
      )}

      {/* Cabecera y Botón Invitar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-neutral-900 dark:text-white">
            Equipo y Permisos de la Agencia (T-027)
          </h2>
          <DistintivoDatosDemo visible={esDemo} />
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Control de asesores con acceso al canal de WhatsApp y cotizador.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalInvitar(true)}
          data-testid="btn-abrir-modal-invitar"
          className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-purple-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-purple-800 focus:outline-hidden"
        >
          <Plus className="h-4 w-4" />
          <span>Invitar Asesor</span>
        </button>
      </div>

      {errorBaja && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-200"
        >
          {errorBaja}
        </div>
      )}

      {/* Tabla de Miembros Responsive (sin scroll forzado a 375 px) */}
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Estado</th>
              <th className="hidden px-4 py-3 sm:table-cell">Fecha Alta</th>
              <th className="px-4 py-3 text-right">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {cargando ? (
              [0, 1, 2].map((i) => (
                <tr key={i} aria-hidden="true" data-testid="esqueleto-miembro">
                  <td colSpan={5} className="px-4 py-3.5">
                    <div className="h-9 w-full animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800" />
                  </td>
                </tr>
              ))
            ) : errorLista?.sinPermiso ? (
              <tr>
                <td colSpan={5} className="px-4 py-8">
                  <div
                    role="alert"
                    data-testid="equipo-sin-permiso"
                    className="mx-auto flex max-w-md flex-col items-center gap-1 text-center text-xs text-neutral-600 dark:text-neutral-300"
                  >
                    <Lock className="h-5 w-5 text-neutral-400" />
                    <p className="font-semibold">No tienes permiso para ver el equipo.</p>
                    <p className="text-neutral-500">
                      Hace falta el permiso «usuarios.administrar». Pide a un Dueño de la agencia
                      que te lo habilite.
                    </p>
                  </div>
                </td>
              </tr>
            ) : errorLista ? (
              <tr>
                <td colSpan={5} className="px-4 py-8">
                  <div
                    role="alert"
                    data-testid="equipo-error"
                    className="mx-auto flex max-w-md flex-col items-center gap-2 text-center text-xs text-rose-800 dark:text-rose-300"
                  >
                    <p className="font-semibold">No se pudo cargar el equipo.</p>
                    <p>{errorLista.mensaje}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setCargando(true);
                        void cargarDatos();
                      }}
                      className="min-h-[44px] rounded-xl border border-neutral-300 px-4 py-2 font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                      Reintentar
                    </button>
                  </div>
                </td>
              </tr>
            ) : miembros.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-xs text-neutral-400">
                  No hay miembros registrados en la agencia.
                </td>
              </tr>
            ) : (
              miembros.map((m) => (
                <tr key={m.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-100 font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                        {m.avatarIniciales}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-neutral-900 dark:text-white">{m.nombre}</p>
                        <p className="truncate text-[11px] text-neutral-500">{m.email}</p>
                        {m.telefono && (
                          <p className="cifra flex items-center gap-1 text-[10px] text-neutral-400 sm:hidden">
                            <Phone className="h-3 w-3" />
                            <span>{m.telefono}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        m.rolClave === 'DUENO'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                      }`}
                    >
                      {m.rolNombre}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        m.estado === 'ACTIVO'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                          : m.estado === 'INACTIVO'
                            ? 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          m.estado === 'ACTIVO'
                            ? 'bg-emerald-500'
                            : m.estado === 'INACTIVO'
                              ? 'bg-neutral-400'
                              : 'bg-amber-500'
                        }`}
                      />
                      {m.estado === 'ACTIVO'
                        ? 'Activo'
                        : m.estado === 'INACTIVO'
                          ? 'Inactivo'
                          : 'Invitación Enviada'}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3.5 text-neutral-500 sm:table-cell dark:text-neutral-400">
                    {formatearFechaIngreso(m.fechaIngreso)}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    {m.estado === 'ACTIVO' &&
                      (bajaPendiente === m.id ? (
                        <span className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void confirmarBaja(m.id)}
                            className="min-h-[44px] rounded-lg bg-rose-700 px-3 text-[11px] font-bold text-white hover:bg-rose-800"
                          >
                            Confirmar baja
                          </button>
                          <button
                            type="button"
                            onClick={() => setBajaPendiente(null)}
                            className="min-h-[44px] rounded-lg px-3 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                          >
                            Cancelar
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setErrorBaja(null);
                            setBajaPendiente(m.id);
                          }}
                          aria-label={`Dar de baja a ${m.nombre}`}
                          className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-3 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                          Dar de baja
                        </button>
                      ))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Banner de Gobierno de Identidad */}
      <div className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
        <ShieldCheck className="h-5 w-5 shrink-0 text-purple-600 dark:text-purple-400" />
        <div className="text-xs text-neutral-600 dark:text-neutral-400">
          <p className="font-semibold text-neutral-900 dark:text-white">
            Aislamiento de Datos por Agencia (RLS R1 y Permiso «usuarios.administrar»):
          </p>
          <p className="mt-0.5">
            Las invitaciones solo pueden ser emitidas por usuarios con rol de administración. Cada
            miembro nuevo queda vinculado exclusivamente a esta agencia, garantizando que sus
            conversaciones y cotizaciones no se mezclen con otras agencias del sistema.
          </p>
        </div>
      </div>

      {/* Modal Invitar Miembro */}
      {modalInvitar && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-modal-invitar"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
        >
          <div
            ref={modalRef}
            className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl sm:p-6 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                  <Mail className="h-4 w-4" />
                </span>
                <h3
                  id="titulo-modal-invitar"
                  className="text-base font-bold text-neutral-900 dark:text-white"
                >
                  Invitar Asesor a la Agencia
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalInvitar(false)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                aria-label="Cerrar modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              Se despachará un correo con un enlace criptográfico seguro para que la persona active
              su cuenta.
            </p>

            {/* Alerta de Error con «Qué hacer» */}
            {errorInvitacion && (
              <div
                role="alert"
                className="mt-3.5 space-y-1.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-200"
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                  <span>{errorInvitacion.mensaje}</span>
                </div>
                {errorInvitacion.queHacer && (
                  <p className="pl-5 text-[11px] text-rose-700 dark:text-rose-300">
                    <strong>Qué hacer:</strong> {errorInvitacion.queHacer}
                  </p>
                )}
              </div>
            )}

            <form
              onSubmit={(e) => {
                void handleEnviarInvitacion(e);
              }}
              className="mt-4 space-y-3.5"
            >
              <div>
                <label
                  htmlFor="input-invitar-correo"
                  className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                >
                  Correo Electrónico *
                </label>
                <input
                  id="input-invitar-correo"
                  type="email"
                  required
                  placeholder="asesor@turismocartagena.com"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-purple-600 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="select-invitar-rol"
                  className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                >
                  Rol Asignado
                </label>
                <select
                  id="select-invitar-rol"
                  value={rolId}
                  onChange={(e) => setRolId(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-purple-600 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
                {roles.find((r) => r.id === rolId)?.descripcion && (
                  <p className="mt-1 text-[11px] text-neutral-500">
                    {roles.find((r) => r.id === rolId)?.descripcion}
                  </p>
                )}
              </div>

              {esDemo && (
                <div>
                  <label
                    htmlFor="input-invitar-nombre"
                    className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                  >
                    Nombre Completo (opcional)
                  </label>
                  <input
                    id="input-invitar-nombre"
                    type="text"
                    placeholder="Ej: Laura Restrepo"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-purple-600 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              )}

              {esDemo && (
                <div>
                  <label
                    htmlFor="input-invitar-telefono"
                    className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                  >
                    Teléfono WhatsApp (opcional)
                  </label>
                  <input
                    id="input-invitar-telefono"
                    type="tel"
                    placeholder="+573001234567"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-purple-600 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setModalInvitar(false)}
                  className="min-h-[44px] rounded-xl border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviando}
                  className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-purple-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-purple-800 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{enviando ? 'Enviando...' : 'Enviar Invitación'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
