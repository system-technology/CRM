'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  X,
  AlertTriangle,
  Clock,
  CheckCheck,
  ExternalLink,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  MessageSquare,
  FileText,
  CalendarClock,
  ShieldCheck,
  Play,
} from 'lucide-react';
import type { AlertaOperativa } from '../../lib/notificaciones-logica';
import {
  type NotificacionWeb,
  type TipoNotificacionWeb,
  adaptarAlertaOperativaANotificacion,
} from '../../lib/notificaciones-web';
import {
  cargarPreferenciasNotificaciones,
  guardarPreferenciasNotificaciones,
  solicitarPermisoNotificaciones,
  reproducirSonidoNotificacion,
  type PreferenciasNotificaciones,
} from '../../lib/preferencias-notificaciones';

export interface PanelNotificacionesProps {
  abierto: boolean;
  alCerrar: () => void;
  notificaciones?: NotificacionWeb[];
  alertas?: AlertaOperativa[];
  alMarcarLeida: (id: string) => void;
  alMarcarTodasLeidas: () => void;
  alDescartar?: (id: string) => void;
}

type CategoriaFiltro = 'todas' | TipoNotificacionWeb;

export function PanelNotificaciones({
  abierto,
  alCerrar,
  notificaciones,
  alertas = [],
  alMarcarLeida,
  alMarcarTodasLeidas,
  alDescartar,
}: PanelNotificacionesProps) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<CategoriaFiltro>('todas');
  const [mostrarAjustes, setMostrarAjustes] = useState(false);
  const [prefs, setPrefs] = useState<PreferenciasNotificaciones>(() =>
    cargarPreferenciasNotificaciones(),
  );
  const [mensajePermiso, setMensajePermiso] = useState<string | null>(null);

  // Escuchar tecla Escape para cerrar accesiblemente
  useEffect(() => {
    if (!abierto) return;
    const manejarTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        alCerrar();
      }
    };
    window.addEventListener('keydown', manejarTecla);
    return () => window.removeEventListener('keydown', manejarTecla);
  }, [abierto, alCerrar]);

  if (!abierto) return null;

  // Unificar notificaciones entrantes con posibles alertas operativas
  const listaUnificada: NotificacionWeb[] = notificaciones
    ? [...notificaciones]
    : alertas.map(adaptarAlertaOperativaANotificacion);

  // Filtrado por categoría seleccionada
  const notificacionesFiltradas = listaUnificada.filter((item) => {
    if (filtro === 'todas') return true;
    return item.tipo === filtro;
  });

  const conteoNoLeidas = listaUnificada.filter((n) => !n.leida).length;

  const alternarSonido = () => {
    const nuevo = !prefs.sonidoHabilitado;
    const actualizadas = { ...prefs, sonidoHabilitado: nuevo };
    guardarPreferenciasNotificaciones(actualizadas);
    setPrefs(actualizadas);
    if (nuevo) {
      reproducirSonidoNotificacion(true);
    }
  };

  const alternarNavegador = async () => {
    if (!prefs.navegadorHabilitado) {
      const concedido = await solicitarPermisoNotificaciones();
      if (concedido) {
        const actualizadas = { ...prefs, navegadorHabilitado: true };
        guardarPreferenciasNotificaciones(actualizadas);
        setPrefs(actualizadas);
        setMensajePermiso('Notificaciones del navegador activadas.');
      } else {
        setMensajePermiso('Permiso de notificaciones denegado en tu navegador.');
      }
    } else {
      const actualizadas = { ...prefs, navegadorHabilitado: false };
      guardarPreferenciasNotificaciones(actualizadas);
      setPrefs(actualizadas);
      setMensajePermiso(null);
    }
  };

  const renderIcono = (tipo: TipoNotificacionWeb, severidad: string) => {
    switch (tipo) {
      case 'mensaje_nuevo':
        return <MessageSquare className="h-4 w-4" />;
      case 'seguimiento_vencido':
        return <CalendarClock className="h-4 w-4" />;
      case 'cotizacion_por_vencer':
        return <FileText className="h-4 w-4" />;
      case 'alerta_operativa':
      default:
        return severidad === 'critica' ? (
          <AlertTriangle className="h-4 w-4" />
        ) : (
          <Clock className="h-4 w-4" />
        );
    }
  };

  return (
    <div
      className="backdrop-blur-2xs fixed inset-0 z-50 flex items-start justify-end bg-black/40 p-3 sm:p-6"
      onClick={alCerrar}
      role="dialog"
      aria-modal="true"
      aria-label="Panel de Notificaciones"
    >
      <div
        className="flex h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl transition-all dark:border-neutral-800 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
        data-testid="panel-notificaciones-contenedor"
      >
        {/* Cabecera Principal */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3.5 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                Notificaciones y Alertas
              </h3>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {conteoNoLeidas} pendiente(s) de atención
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Botón de Preferencias */}
            <button
              type="button"
              onClick={() => setMostrarAjustes((prev) => !prev)}
              title="Ajustes de aviso (sonido y navegador)"
              aria-label="Ajustes de aviso para el asesor"
              aria-expanded={mostrarAjustes}
              data-testid="boton-ajustes-notificaciones"
              className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl transition-colors ${
                mostrarAjustes
                  ? 'bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-white'
                  : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>

            {conteoNoLeidas > 0 && (
              <button
                type="button"
                onClick={alMarcarTodasLeidas}
                title="Marcar todas como leídas"
                data-testid="boton-marcar-todas-leidas"
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                <CheckCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Leídas</span>
              </button>
            )}

            <button
              type="button"
              onClick={alCerrar}
              title="Cerrar panel (Esc)"
              aria-label="Cerrar panel de notificaciones"
              data-testid="boton-cerrar-panel-notificaciones"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Sección de Preferencias del Asesor (Colapsable / Desplegable) */}
        {mostrarAjustes && (
          <div
            className="border-b border-neutral-200 bg-neutral-50/90 p-4 dark:border-neutral-800 dark:bg-neutral-950/60"
            data-testid="seccion-preferencias-notificaciones"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                Preferencias de Aviso por Asesor
              </span>
              <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Cero PII en Títulos (R10)</span>
              </span>
            </div>

            <div className="space-y-3">
              {/* Opción: Sonido de Notificación */}
              <div className="flex items-center justify-between rounded-xl border border-neutral-200/80 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex items-center gap-2.5">
                  {prefs.sonidoHabilitado ? (
                    <Volume2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <VolumeX className="h-4 w-4 text-neutral-400" />
                  )}
                  <div>
                    <span className="block text-xs font-medium text-neutral-900 dark:text-neutral-100">
                      Campana de audio
                    </span>
                    <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                      Sonido suave al entrar un mensaje o alerta
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => reproducirSonidoNotificacion(true)}
                    title="Probar sonido sintetizado"
                    data-testid="boton-probar-sonido"
                    className="flex min-h-[36px] items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  >
                    <Play className="h-3 w-3" />
                    <span>Probar</span>
                  </button>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={prefs.sonidoHabilitado}
                    aria-label="Alternar sonido de notificación"
                    onClick={alternarSonido}
                    data-testid="switch-sonido-notificaciones"
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      prefs.sonidoHabilitado
                        ? 'bg-emerald-600'
                        : 'bg-neutral-300 dark:bg-neutral-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        prefs.sonidoHabilitado ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Opción: Notificaciones de Escritorio del Navegador */}
              <div className="flex items-center justify-between rounded-xl border border-neutral-200/80 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex items-center gap-2.5">
                  <Bell className="text-acento-600 dark:text-acento-400 h-4 w-4" />
                  <div>
                    <span className="block text-xs font-medium text-neutral-900 dark:text-neutral-100">
                      Notificaciones de escritorio
                    </span>
                    <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                      Avisos nativos del navegador sin datos personales
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs.navegadorHabilitado}
                  aria-label="Alternar notificaciones de escritorio"
                  onClick={() => {
                    void alternarNavegador();
                  }}
                  data-testid="switch-navegador-notificaciones"
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    prefs.navegadorHabilitado
                      ? 'bg-acento-600'
                      : 'bg-neutral-300 dark:bg-neutral-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      prefs.navegadorHabilitado ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {mensajePermiso && (
                <div
                  className="rounded-lg bg-blue-50 px-3 py-1.5 text-[11px] text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                  data-testid="mensaje-estado-permiso"
                >
                  {mensajePermiso}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Barra de Filtros por Categoría */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto border-b border-neutral-200 bg-neutral-50 px-4 py-2 dark:border-neutral-800 dark:bg-neutral-900/50"
          role="tablist"
          aria-label="Filtrar por categoría"
        >
          <button
            type="button"
            role="tab"
            aria-selected={filtro === 'todas'}
            onClick={() => setFiltro('todas')}
            data-testid="filtro-todas"
            className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              filtro === 'todas'
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                : 'text-neutral-600 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:bg-neutral-800'
            }`}
          >
            Todas ({listaUnificada.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filtro === 'mensaje_nuevo'}
            onClick={() => setFiltro('mensaje_nuevo')}
            data-testid="filtro-mensajes"
            className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              filtro === 'mensaje_nuevo'
                ? 'bg-emerald-600 text-white'
                : 'text-neutral-600 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:bg-neutral-800'
            }`}
          >
            WhatsApp ({listaUnificada.filter((n) => n.tipo === 'mensaje_nuevo').length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filtro === 'seguimiento_vencido'}
            onClick={() => setFiltro('seguimiento_vencido')}
            data-testid="filtro-seguimientos"
            className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              filtro === 'seguimiento_vencido'
                ? 'bg-red-600 text-white'
                : 'text-neutral-600 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:bg-neutral-800'
            }`}
          >
            Seguimientos ({listaUnificada.filter((n) => n.tipo === 'seguimiento_vencido').length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filtro === 'cotizacion_por_vencer'}
            onClick={() => setFiltro('cotizacion_por_vencer')}
            data-testid="filtro-cotizaciones"
            className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              filtro === 'cotizacion_por_vencer'
                ? 'bg-amber-600 text-white'
                : 'text-neutral-600 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:bg-neutral-800'
            }`}
          >
            Cotizaciones ({listaUnificada.filter((n) => n.tipo === 'cotizacion_por_vencer').length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filtro === 'alerta_operativa'}
            onClick={() => setFiltro('alerta_operativa')}
            data-testid="filtro-operativas"
            className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              filtro === 'alerta_operativa'
                ? 'bg-blue-600 text-white'
                : 'text-neutral-600 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:bg-neutral-800'
            }`}
          >
            Operativas ({listaUnificada.filter((n) => n.tipo === 'alerta_operativa').length})
          </button>
        </div>

        {/* Lista de Notificaciones */}
        <div className="flex-1 scrollbar-thin space-y-2.5 overflow-y-auto p-4">
          {notificacionesFiltradas.length === 0 ? (
            <div
              className="flex h-56 flex-col items-center justify-center text-center text-sm text-neutral-400"
              data-testid="estado-sin-notificaciones"
            >
              <CheckCheck className="mb-2 h-8 w-8 text-neutral-300 dark:text-neutral-700" />
              <span>Sin notificaciones en esta categoría.</span>
            </div>
          ) : (
            notificacionesFiltradas.map((item) => {
              const esCritica = item.severidad === 'critica';
              const esAdvertencia = item.severidad === 'advertencia';

              return (
                <div
                  key={item.id}
                  data-testid={`notificacion-${item.id}`}
                  className={`rounded-xl border p-3.5 transition-all ${
                    !item.leida
                      ? esCritica
                        ? 'border-red-200 bg-red-50/50 dark:border-red-900/60 dark:bg-red-950/20'
                        : esAdvertencia
                          ? 'border-amber-200 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20'
                          : 'border-blue-200 bg-blue-50/50 dark:border-blue-900/60 dark:bg-blue-950/20'
                      : 'border-neutral-200 bg-white opacity-75 dark:border-neutral-800 dark:bg-neutral-900'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                        esCritica
                          ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
                          : esAdvertencia
                            ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400'
                            : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400'
                      }`}
                    >
                      {renderIcono(item.tipo, item.severidad)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-bold text-neutral-900 dark:text-neutral-100">
                          {item.titulo}
                        </span>
                        {!item.leida && (
                          <span
                            data-testid="indicador-no-leida"
                            className="h-2 w-2 shrink-0 rounded-full bg-red-500"
                            title="No leída"
                          />
                        )}
                      </div>

                      <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                        {item.detalle}
                      </p>

                      <div className="mt-3 flex items-center justify-between border-t border-neutral-200/60 pt-2 dark:border-neutral-800/60">
                        <button
                          type="button"
                          data-testid={`boton-accion-${item.id}`}
                          onClick={() => {
                            alMarcarLeida(item.id);
                            alCerrar();
                            router.push(item.href);
                          }}
                          className={`flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                            esCritica
                              ? 'bg-red-600 text-white hover:bg-red-700'
                              : esAdvertencia
                                ? 'bg-amber-600 text-white hover:bg-amber-700'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700'
                          }`}
                        >
                          <span>{item.accionTexto}</span>
                          <ExternalLink className="h-3 w-3" />
                        </button>

                        <button
                          type="button"
                          data-testid={`boton-descartar-${item.id}`}
                          onClick={() => {
                            if (alDescartar) {
                              alDescartar(item.id);
                            } else {
                              alMarcarLeida(item.id);
                            }
                          }}
                          className="flex min-h-[36px] items-center px-2 text-[11px] font-medium text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                        >
                          {!item.leida ? 'Descartar' : 'Eliminar'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
