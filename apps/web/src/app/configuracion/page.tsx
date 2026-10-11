'use client';

import React, { useState } from 'react';
import {
  Users,
  MessageSquare,
  Clock,
  Kanban,
  Building2,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Send,
  Plus,
  Save,
  Lock,
  Phone,
} from 'lucide-react';
import { BarraModulos } from '../../components/bandeja/barra-modulos';
import {
  MOCK_MIEMBROS_EQUIPO,
  MOCK_CONFIGURACION_WABA,
  MOCK_CONFIGURACION_SLA,
  MOCK_CONFIGURACION_AGENCIA,
  MOCK_ETAPAS_CONFIGURADAS,
  type MiembroEquipo,
  type ConfiguracionSla,
  type ConfiguracionAgencia,
} from '../../lib/mock-configuracion';
import {
  validarSla,
  validarReglaDuenoActivo,
  verificarSaludConexion,
  validarFormatoNit,
} from '../../lib/configuracion-logica';

type TabConfig = 'equipo' | 'whatsapp' | 'sla' | 'pipeline' | 'agencia';

export default function ConfiguracionPage() {
  const [tabActiva, setTabActiva] = useState<TabConfig>('equipo');
  const [miembros, setMiembros] = useState<MiembroEquipo[]>(MOCK_MIEMBROS_EQUIPO);
  const [waba] = useState(MOCK_CONFIGURACION_WABA);
  const [sla, setSla] = useState<ConfiguracionSla>(MOCK_CONFIGURACION_SLA);
  const [agencia, setAgencia] = useState<ConfiguracionAgencia>(MOCK_CONFIGURACION_AGENCIA);
  const [guardadoExitoso, setGuardadoExitoso] = useState(false);
  const [errorSla, setErrorSla] = useState<string | null>(null);
  const [modalInvitar, setModalInvitar] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoEmail, setNuevoEmail] = useState('');
  const [nuevoTelefono, setNuevoTelefono] = useState('');
  const [nuevoRol, setNuevoRol] = useState<'DUENO' | 'ASESOR'>('ASESOR');

  const saludWaba = verificarSaludConexion(waba);
  const reglaDueno = validarReglaDuenoActivo(miembros);

  const guardarCambiosSla = (e: React.FormEvent) => {
    e.preventDefault();
    const validacion = validarSla(sla.tiempoMaximoPrimeraRespuestaMin, sla.alertaPreventivaMin);
    if (!validacion.valido) {
      setErrorSla(validacion.error ?? 'Parámetros de SLA inválidos');
      return;
    }
    setErrorSla(null);
    setGuardadoExitoso(true);
    setTimeout(() => setGuardadoExitoso(false), 3000);
  };

  const guardarCambiosAgencia = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validarFormatoNit(agencia.nit)) {
      alert('Formato de NIT no válido para Colombia. Ejemplo: 901.482.910-3');
      return;
    }
    setGuardadoExitoso(true);
    setTimeout(() => setGuardadoExitoso(false), 3000);
  };

  const invitarMiembro = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoNombre.trim() || !nuevoEmail.trim()) return;

    const iniciales = nuevoNombre
      .trim()
      .split(' ')
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    const nuevo: MiembroEquipo = {
      id: `01932000-0000-7000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`,
      nombre: nuevoNombre.trim(),
      email: nuevoEmail.trim(),
      telefono: nuevoTelefono.trim() || '+573000000000',
      rol: nuevoRol,
      estado: 'INVITADO',
      fechaIngreso: new Date().toISOString().split('T')[0] ?? '2026-10-11',
      avatarIniciales: iniciales || 'AS',
    };

    setMiembros([...miembros, nuevo]);
    setModalInvitar(false);
    setNuevoNombre('');
    setNuevoEmail('');
    setNuevoTelefono('');
    setGuardadoExitoso(true);
    setTimeout(() => setGuardadoExitoso(false), 3000);
  };

  return (
    <div className="flex h-screen w-full bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
      <BarraModulos />

      <main className="flex flex-1 flex-col overflow-y-auto">
        {/* Cabecera Principal */}
        <header className="border-b border-neutral-200 bg-white px-6 py-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
                  Equipo y Configuración de Agencia
                </h1>
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
                  {agencia.nombreComercial}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                Administra miembros, roles, SLA, canal de WhatsApp y datos fiscales de la agencia
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                WhatsApp Conectado
              </span>
              <span className="text-xs text-neutral-400">|</span>
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                NIT: {agencia.nit}
              </span>
            </div>
          </div>

          {/* Notificación de guardado */}
          {guardadoExitoso && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Configuración guardada exitosamente en el sistema.</span>
            </div>
          )}

          {/* Pestañas de Navegación */}
          <nav className="mt-4 flex space-x-1 border-b border-neutral-200 dark:border-neutral-800">
            <button
              onClick={() => setTabActiva('equipo')}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-medium transition-colors ${
                tabActiva === 'equipo'
                  ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                  : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              <Users className="h-4 w-4" />
              <span>Miembros y Roles</span>
              <span className="rounded-full bg-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                {miembros.length}
              </span>
            </button>

            <button
              onClick={() => setTabActiva('whatsapp')}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-medium transition-colors ${
                tabActiva === 'whatsapp'
                  ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                  : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              <span>Canal WhatsApp (WABA)</span>
            </button>

            <button
              onClick={() => setTabActiva('sla')}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-medium transition-colors ${
                tabActiva === 'sla'
                  ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                  : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              <Clock className="h-4 w-4" />
              <span>SLA y Tiempos</span>
            </button>

            <button
              onClick={() => setTabActiva('pipeline')}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-medium transition-colors ${
                tabActiva === 'pipeline'
                  ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                  : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              <Kanban className="h-4 w-4" />
              <span>Etapas del Pipeline</span>
            </button>

            <button
              onClick={() => setTabActiva('agencia')}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-medium transition-colors ${
                tabActiva === 'agencia'
                  ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                  : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              <Building2 className="h-4 w-4" />
              <span>Marca y Datos Fiscales</span>
            </button>
          </nav>
        </header>

        {/* Contenido según Pestaña */}
        <div className="flex-1 p-6">
          {/* TAB 1: EQUIPO Y ROLES */}
          {tabActiva === 'equipo' && (
            <div className="space-y-6">
              {/* Tarjetas Resumen */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Total Usuarios
                  </span>
                  <p className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">
                    {miembros.length}
                  </p>
                </div>

                <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Dueños Activos
                  </span>
                  <p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {reglaDueno.cantidadDuenos}
                  </p>
                </div>

                <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Asesores Comerciales
                  </span>
                  <p className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">
                    {miembros.filter((m) => m.rol === 'ASESOR' && m.estado === 'ACTIVO').length}
                  </p>
                </div>

                <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Invitaciones Pendientes
                  </span>
                  <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {miembros.filter((m) => m.estado === 'INVITADO').length}
                  </p>
                </div>
              </div>

              {/* Botón de Invitar */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
                    Usuarios de la Agencia
                  </h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Control de accesos y responsabilidades de atención al cliente
                  </p>
                </div>
                <button
                  onClick={() => setModalInvitar(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-2 text-xs font-medium text-white shadow-sm hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
                >
                  <Plus className="h-4 w-4" />
                  <span>Invitar Miembro</span>
                </button>
              </div>

              {/* Tabla de Miembros */}
              <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-neutral-200 bg-neutral-50 font-semibold text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-300">
                    <tr>
                      <th className="px-4 py-3">Miembro</th>
                      <th className="px-4 py-3">Contacto</th>
                      <th className="px-4 py-3">Rol</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Fecha de Ingreso</th>
                      <th className="px-4 py-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {miembros.map((m) => (
                      <tr
                        key={m.id}
                        className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30"
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200 font-bold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                              {m.avatarIniciales}
                            </div>
                            <div>
                              <p className="font-semibold text-neutral-900 dark:text-white">
                                {m.nombre}
                              </p>
                              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                {m.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-neutral-600 dark:text-neutral-300">
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 text-neutral-400" />
                            <span>{m.telefono}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ${
                              m.rol === 'DUENO'
                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                            }`}
                          >
                            {m.rol === 'DUENO' ? 'Dueño / Admin' : 'Asesor Comercial'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              m.estado === 'ACTIVO'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                m.estado === 'ACTIVO' ? 'bg-emerald-500' : 'bg-amber-500'
                              }`}
                            />
                            {m.estado === 'ACTIVO' ? 'Activo' : 'Invitación Enviada'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-neutral-500 dark:text-neutral-400">
                          {m.fechaIngreso}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            title="Gestionar permisos del usuario"
                            className="rounded px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Banner de Gobierno */}
              <div className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
                <ShieldCheck className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
                <div className="text-xs text-neutral-600 dark:text-neutral-400">
                  <p className="font-semibold text-neutral-900 dark:text-white">
                    Aislamiento R1 y Principio de Mínimo Privilegio:
                  </p>
                  <p className="mt-0.5">
                    Cada agencia opera con un esquema aislado en la base de datos (PostgreSQL RLS).
                    Los asesores solo gestionan sus conversaciones asignadas y oportunidades
                    activas. Solo los dueños de agencia pueden modificar integraciones y tarifas.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: WHATSAPP CLOUD API */}
          {tabActiva === 'whatsapp' && (
            <div className="max-w-4xl space-y-6">
              {/* Card de Estado de Salud */}
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                      <MessageSquare className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-neutral-900 dark:text-white">
                        WhatsApp Business Account (WABA)
                      </h3>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Canal nativo oficial vía Meta Cloud API
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                    {saludWaba.estado === 'OPTIMO' ? 'Conexión Saludable' : 'Atención Requerida'}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 border-t border-neutral-200 pt-4 sm:grid-cols-2 dark:border-neutral-800">
                  <div>
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      Número Verificado
                    </span>
                    <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                      {waba.numeroE164}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      Nombre Visible en Meta
                    </span>
                    <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                      {waba.nombreVisible}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      Phone Number ID
                    </span>
                    <p className="font-mono text-xs text-neutral-700 dark:text-neutral-300">
                      {waba.phoneNumberId}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      WABA Account ID
                    </span>
                    <p className="font-mono text-xs text-neutral-700 dark:text-neutral-300">
                      {waba.wabaId}
                    </p>
                  </div>
                </div>
              </div>

              {/* Webhook & Cifrado */}
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <h4 className="text-xs font-semibold tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                  Infraestructura de Webhook y Seguridad
                </h4>

                <div className="mt-3 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      URL del Webhook de Recepción
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={waba.webhookUrl}
                      className="mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                    />
                  </div>

                  <div className="flex items-center gap-2 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-400">
                    <Lock className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      <strong>Regla R6 (Cero secretos en frontend):</strong> Las llaves de acceso
                      permanente de Meta Cloud API están cifradas con AES-256-GCM en el backend y no
                      se exponen al navegador.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SLA Y TIEMPOS */}
          {tabActiva === 'sla' && (
            <div className="max-w-2xl space-y-6">
              <form
                onSubmit={guardarCambiosSla}
                className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="border-b border-neutral-200 pb-3 dark:border-neutral-800">
                  <h3 className="font-semibold text-neutral-900 dark:text-white">
                    Parámetros de SLA de Primera Respuesta
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Establece el estándar de velocidad para atender nuevos viajeros en WhatsApp
                  </p>
                </div>

                {errorSla && (
                  <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{errorSla}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      Tiempo Máximo de Primera Respuesta (minutos)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      value={sla.tiempoMaximoPrimeraRespuestaMin}
                      onChange={(e) =>
                        setSla({
                          ...sla,
                          tiempoMaximoPrimeraRespuestaMin: parseInt(e.target.value) || 0,
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                    <span className="mt-1 block text-[11px] text-neutral-500">
                      Recomendado: 15 minutos para agencias de viajes.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      Alerta Preventiva en Bandeja (minutos)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      value={sla.alertaPreventivaMin}
                      onChange={(e) =>
                        setSla({
                          ...sla,
                          alertaPreventivaMin: parseInt(e.target.value) || 0,
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                    <span className="mt-1 block text-[11px] text-neutral-500">
                      Avisa al asesor antes de que se marque como vencido.
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      Horario de Inicio de Atención
                    </label>
                    <input
                      type="time"
                      value={sla.horarioInicio}
                      onChange={(e) => setSla({ ...sla, horarioInicio: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      Horario de Cierre de Atención
                    </label>
                    <input
                      type="time"
                      value={sla.horarioFin}
                      onChange={(e) => setSla({ ...sla, horarioFin: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
                  >
                    <Save className="h-4 w-4" />
                    <span>Guardar Parámetros de SLA</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 4: ETAPAS DEL PIPELINE */}
          {tabActiva === 'pipeline' && (
            <div className="max-w-3xl space-y-6">
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <h3 className="font-semibold text-neutral-900 dark:text-white">
                  Etapas Comerciales del CRM
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Flujo de conversión acordado según el lenguaje ubicuo de la agencia
                </p>

                <div className="mt-4 space-y-3">
                  {MOCK_ETAPAS_CONFIGURADAS.map((etapa) => (
                    <div
                      key={etapa.codigo}
                      className="flex items-center justify-between rounded-lg border border-neutral-200 p-3 dark:border-neutral-800 dark:bg-neutral-800/40"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-200 text-xs font-bold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                          {etapa.orden}
                        </span>
                        <div>
                          <p className="text-xs font-bold text-neutral-900 dark:text-white">
                            {etapa.label}
                          </p>
                          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                            {etapa.descripcion}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300">
                          {etapa.probabilidad}% de Cierre
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: MARCA Y DATOS FISCALES */}
          {tabActiva === 'agencia' && (
            <div className="max-w-2xl space-y-6">
              <form
                onSubmit={guardarCambiosAgencia}
                className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="border-b border-neutral-200 pb-3 dark:border-neutral-800">
                  <h3 className="font-semibold text-neutral-900 dark:text-white">
                    Identidad y Moneda de la Agencia
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Datos fiscales y de presentación comercial de la agencia
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      Razón Social Legal
                    </label>
                    <input
                      type="text"
                      value={agencia.razonSocial}
                      onChange={(e) => setAgencia({ ...agencia, razonSocial: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      Nombre Comercial
                    </label>
                    <input
                      type="text"
                      value={agencia.nombreComercial}
                      onChange={(e) => setAgencia({ ...agencia, nombreComercial: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      NIT (Colombia)
                    </label>
                    <input
                      type="text"
                      value={agencia.nit}
                      onChange={(e) => setAgencia({ ...agencia, nit: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      Moneda Base (Regla R8)
                    </label>
                    <input
                      type="text"
                      readOnly
                      value="COP — Pesos Colombianos (Enteros en centavos)"
                      className="mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      Dirección Comercial
                    </label>
                    <input
                      type="text"
                      value={agencia.direccion}
                      onChange={(e) => setAgencia({ ...agencia, direccion: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      Ciudad y País
                    </label>
                    <input
                      type="text"
                      value={agencia.ciudad}
                      onChange={(e) => setAgencia({ ...agencia, ciudad: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
                  >
                    <Save className="h-4 w-4" />
                    <span>Guardar Datos de Agencia</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </main>

      {/* Modal Invitar Miembro */}
      {modalInvitar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              Invitar Nuevo Miembro al Equipo
            </h3>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Se enviará un correo de bienvenida con acceso al CRM de la agencia
            </p>

            <form onSubmit={invitarMiembro} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Laura Restrepo"
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  required
                  placeholder="laura@viajesaventura.com"
                  value={nuevoEmail}
                  onChange={(e) => setNuevoEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Teléfono E.164 (WhatsApp)
                </label>
                <input
                  type="text"
                  placeholder="+573001234567"
                  value={nuevoTelefono}
                  onChange={(e) => setNuevoTelefono(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Rol Asignado
                </label>
                <select
                  value={nuevoRol}
                  onChange={(e) => setNuevoRol(e.target.value as 'DUENO' | 'ASESOR')}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                >
                  <option value="ASESOR">Asesor Comercial</option>
                  <option value="DUENO">Dueño / Administrador</option>
                </select>
              </div>

              <div className="mt-5 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalInvitar(false)}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Enviar Invitación</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
