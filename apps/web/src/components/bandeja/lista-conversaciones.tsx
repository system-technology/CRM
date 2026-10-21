'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  type ConversacionResumen,
  EventoBandeja,
  type FiltroBandeja,
  type PaginaBandeja,
} from '@viajapro/contracts';
import { Search, Rows3, AlertTriangle, RefreshCw } from 'lucide-react';
import { DistintivoDatosDemo } from '../comun/distintivo-datos-demo';
import { inboxApi } from '../../lib/inbox-api';
import { formatearErrorAmigable } from '../../lib/estados-ui-logica';
import { useInboxSocket } from '../../lib/inbox-socket';
import {
  reordenarConGuardia,
  generarColorAvatar,
  obtenerIniciales,
  calcularTiempoRestanteVentana,
} from '../../lib/bandeja-logica';

export type DensidadBandeja = 'compacta' | 'comoda';

const FILTROS: { id: FiltroBandeja; etiqueta: string }[] = [
  { id: 'TODAS', etiqueta: 'Todas' },
  { id: 'MIAS', etiqueta: 'Mías' },
  { id: 'SIN_ASIGNAR', etiqueta: 'Sin asignar' },
  { id: 'SIN_LEER', etiqueta: 'Sin leer' },
  { id: 'SLA_VENCIDO', etiqueta: 'SLA Vencido' },
];

export function ListaConversaciones() {
  const pathname = usePathname();
  const [filtro, setFiltro] = useState<FiltroBandeja>('TODAS');
  const [buscar, setBuscar] = useState('');
  const [buscarDebounced, setBuscarDebounced] = useState('');

  const [pagina, setPagina] = useState<PaginaBandeja | null>(null);
  const [conversaciones, setConversaciones] = useState<ConversacionResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [densidad, setDensidad] = useState<DensidadBandeja>('comoda');
  const [error, setError] = useState<string | null>(null);

  // Guard de Mouse Hover para no reordenar bajo el cursor
  const isHoveringListRef = useRef(false);
  const [pendientesReorden, setPendientesReorden] = useState<number>(0);
  const bufferConversacionesRef = useRef<ConversacionResumen[] | null>(null);

  // Selección activa para teclado
  const [_indiceSeleccionado, setIndiceSeleccionado] = useState<number>(0);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const busquedaInputRef = useRef<HTMLInputElement | null>(null);

  // Debounce para búsqueda
  useEffect(() => {
    const timer = setTimeout(() => {
      setBuscarDebounced(buscar);
    }, 200);
    return () => clearTimeout(timer);
  }, [buscar]);

  // Cargar estado inicial y filtros
  const cargarInicial = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await inboxApi.consultarBandeja({
        filtro,
        buscar: buscarDebounced,
        limite: 30,
      });
      setPagina(res);
      setConversaciones(res.datos);
      setIndiceSeleccionado(0);
      setPendientesReorden(0);
      bufferConversacionesRef.current = null;
    } catch (e) {
      setError(formatearErrorAmigable(e, 'No fue posible cargar las conversaciones.'));
      setConversaciones([]);
      setPagina(null);
    } finally {
      setCargando(false);
    }
  }, [filtro, buscarDebounced]);

  useEffect(() => {
    void cargarInicial();
  }, [cargarInicial]);

  // Aplicar reorden diferido al hacer clic en el banner o salir del área
  const aplicarReordenDiferido = useCallback(() => {
    if (bufferConversacionesRef.current) {
      const ordenadas = [...bufferConversacionesRef.current].sort((a, b) => {
        const tA = a.ultimoMensajeEn ? new Date(a.ultimoMensajeEn).getTime() : 0;
        const tB = b.ultimoMensajeEn ? new Date(b.ultimoMensajeEn).getTime() : 0;
        return tB - tA;
      });
      setConversaciones(ordenadas);
      bufferConversacionesRef.current = null;
      setPendientesReorden(0);
    }
  }, []);

  // Suscripción a eventos en tiempo real con Socket.IO / mock y reconexión REST (0c.35)
  const { estado: estadoSocket } = useInboxSocket({
    onEvento: (evento: EventoBandeja) => {
      const parseado = EventoBandeja.safeParse(evento);
      if (!parseado.success) {
        console.warn(
          '[ListaConversaciones] Evento descartado por no cumplir contrato Zod:',
          parseado.error,
        );
        return;
      }
      const ev = parseado.data;
      if (ev.tipo === 'CONVERSACION_RETIRADA') {
        setConversaciones((prev) => prev.filter((c) => c.id !== ev.conversacionId));
        if (bufferConversacionesRef.current) {
          bufferConversacionesRef.current = bufferConversacionesRef.current.filter(
            (c) => c.id !== ev.conversacionId,
          );
        }
        return;
      }

      let debeIncrementar = false;
      setConversaciones((prev) => {
        const res = reordenarConGuardia(
          prev,
          bufferConversacionesRef.current,
          ev,
          isHoveringListRef.current,
        );

        bufferConversacionesRef.current = res.nuevoBuffer;
        debeIncrementar = res.nuevoPendiente;
        return res.listaVisible;
      });

      if (debeIncrementar) {
        setPendientesReorden((p) => p + 1);
      }
    },
    onReconexion: () => {
      // Si el socket cae y se reconecta, re-pedir lista por REST porque eventos perdidos no se reenvían (0c.35)
      void cargarInicial();
    },
  });

  const cargarMas = async () => {
    if (!pagina?.pageInfo.nextCursor || cargandoMas) return;
    setCargandoMas(true);
    try {
      const res = await inboxApi.consultarBandeja({
        filtro,
        buscar: buscarDebounced,
        cursor: pagina.pageInfo.nextCursor,
        limite: 30,
      });
      setPagina(res);
      setConversaciones((prev) => [...prev, ...res.datos]);
    } catch (e) {
      setError(formatearErrorAmigable(e, 'No fue posible cargar más conversaciones.'));
    } finally {
      setCargandoMas(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndiceSeleccionado((prev) => {
        const next = Math.min(prev + 1, conversaciones.length - 1);
        itemRefs.current[next]?.focus();
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceSeleccionado((prev) => {
        const next = Math.max(prev - 1, 0);
        itemRefs.current[next]?.focus();
        return next;
      });
    } else if (e.key === '/') {
      if (document.activeElement !== busquedaInputRef.current) {
        e.preventDefault();
        busquedaInputRef.current?.focus();
      }
    }
  };

  return (
    <div
      className="flex h-full flex-col border-r border-neutral-200 bg-white select-none dark:border-neutral-800 dark:bg-neutral-900"
      onKeyDown={handleKeyDown}
      role="region"
      aria-label="Lista de conversaciones"
    >
      {/* Cabecera de la lista */}
      {estadoSocket === 'reconectando' && (
        <div
          data-testid="indicador-reconectando"
          role="status"
          className="flex shrink-0 items-center justify-center gap-1.5 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300"
        >
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>Reconectando tiempo real...</span>
        </div>
      )}
      {estadoSocket === 'desconectado' && (
        <div
          data-testid="indicador-desconectado"
          role="status"
          className="flex shrink-0 items-center justify-center gap-1.5 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300"
        >
          <AlertTriangle className="h-3 w-3 text-amber-600" />
          <span>
            Sin conexión en tiempo real; los mensajes nuevos no llegarán solos. Reintentando...
          </span>
        </div>
      )}
      <div className="shrink-0 space-y-2.5 border-b border-neutral-200 p-3 dark:border-neutral-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
              Conversaciones
            </h1>
            <DistintivoDatosDemo />
          </div>
          <button
            type="button"
            onClick={() => setDensidad((d) => (d === 'comoda' ? 'compacta' : 'comoda'))}
            title={densidad === 'comoda' ? 'Cambiar a vista compacta' : 'Cambiar a vista cómoda'}
            className="focus-visible:ring-acento-600 flex min-h-[36px] items-center gap-1 rounded-md border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 focus-visible:ring-2 focus-visible:outline-none md:min-h-[28px] dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            <Rows3 className="h-3.5 w-3.5" />
            <span className="text-[11px] capitalize">{densidad}</span>
          </button>
        </div>

        {/* Buscador */}
        <div className="relative">
          <Search className="absolute top-2.5 left-2.5 h-3.5 w-3.5 text-neutral-400" />
          <input
            ref={busquedaInputRef}
            type="search"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar por nombre o teléfono... (/)"
            className="focus:border-acento-600 focus:ring-acento-600/30 w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2 pr-3 pl-8 text-xs text-neutral-900 placeholder-neutral-400 focus:bg-white focus:ring-2 focus:outline-none md:py-1.5 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          />
        </div>

        {/* Chips de Filtro con objetivo táctil >=44px en móvil */}
        <div className="flex flex-wrap gap-1" role="tablist">
          {FILTROS.map((f) => {
            const activo = filtro === f.id;
            return (
              <button
                key={f.id}
                role="tab"
                aria-selected={activo}
                onClick={() => setFiltro(f.id)}
                className={`focus-visible:ring-acento-600 flex min-h-[44px] items-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none md:min-h-[32px] md:py-1 dark:focus-visible:ring-offset-neutral-900 ${
                  activo
                    ? 'bg-acento-700 font-semibold text-white shadow-2xs'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                }`}
              >
                {f.etiqueta}
              </button>
            );
          })}
        </div>
      </div>

      {/* Banner de Reordenamiento Diferido (Guard del cursor) */}
      {pendientesReorden > 0 && (
        <div className="border-acento-200 bg-acento-50 text-acento-900 dark:border-acento-900/50 dark:bg-acento-950/40 dark:text-acento-200 shrink-0 border-b px-3 py-2 text-center text-xs">
          <button
            type="button"
            onClick={aplicarReordenDiferido}
            className="flex w-full items-center justify-center gap-1.5 font-bold hover:underline"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>
              {pendientesReorden}{' '}
              {pendientesReorden === 1 ? 'conversación nueva' : 'conversaciones nuevas'} ·
              Actualizar
            </span>
          </button>
        </div>
      )}

      {/* Contenedor scrolleable independiente de la lista */}
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onMouseEnter={() => {
          isHoveringListRef.current = true;
        }}
        onMouseLeave={() => {
          isHoveringListRef.current = false;
        }}
        role="feed"
        aria-busy={cargando}
      >
        {cargando ? (
          <div className="space-y-2 p-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-lg bg-neutral-100 p-3 dark:bg-neutral-800/40"
              >
                <div className="h-4 w-3/4 rounded bg-neutral-200 dark:bg-neutral-700"></div>
                <div className="mt-2 h-3 w-1/2 rounded bg-neutral-200 dark:bg-neutral-700"></div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="border-alerta-200 bg-alerta-50 text-alerta-900 dark:border-alerta-900/40 dark:bg-alerta-950/30 dark:text-alerta-300 m-4 rounded-xl border p-4 text-center text-xs">
            <AlertTriangle className="text-alerta-600 mx-auto h-6 w-6" />
            <p className="mt-2 font-bold">{error}</p>
            <button
              onClick={() => void cargarInicial()}
              className="bg-alerta-700 hover:bg-alerta-800 mt-3 rounded-lg px-3 py-1.5 font-semibold text-white"
            >
              Reintentar
            </button>
          </div>
        ) : conversaciones.length === 0 ? (
          <div className="p-8 text-center text-xs text-neutral-500">
            <p className="font-semibold text-neutral-700 dark:text-neutral-300">
              No hay conversaciones en esta vista
            </p>
            <p className="mt-1">
              {buscar
                ? 'Intenta con otro término de búsqueda.'
                : 'No hay mensajes pendientes para este filtro.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100 pb-16 md:pb-0 dark:divide-neutral-800/60">
            {conversaciones.map((conv, idx) => {
              const esActiva = pathname === `/bandeja/${conv.id}`;
              const avatarColores = generarColorAvatar(conv.contactoId);
              const iniciales = obtenerIniciales(conv.contactoNombre, conv.contactoTelefono);
              const ventanaInfo = calcularTiempoRestanteVentana(conv.ventana.expiraEn);

              return (
                <Link
                  key={conv.id}
                  href={`/bandeja/${conv.id}`}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  className={`focus-visible:ring-acento-600 block p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset ${
                    esActiva
                      ? 'bg-acento-50/80 border-acento-700 dark:bg-acento-950/40 border-l-4'
                      : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                  } ${densidad === 'compacta' ? 'py-2' : 'py-3'}`}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Avatar determinista */}
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold select-none ${avatarColores.bg} ${avatarColores.text}`}
                    >
                      {iniciales}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-xs font-bold text-neutral-900 dark:text-neutral-100">
                          {conv.contactoNombre || conv.contactoTelefono}
                        </span>
                        <span className="cifra shrink-0 text-[10px] text-neutral-400">
                          {conv.ultimoMensajeEn
                            ? new Date(conv.ultimoMensajeEn).toLocaleTimeString('es-CO', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''}
                        </span>
                      </div>

                      <p className="mt-0.5 truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                        {conv.ultimoMensajeTexto || 'Sin mensajes'}
                      </p>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">
                        {conv.mensajesSinLeer > 0 && (
                          <span className="bg-acento-700 py-0.2 rounded-full px-1.5 font-bold text-white">
                            {conv.mensajesSinLeer}
                          </span>
                        )}

                        {conv.slaVenceEn && (
                          <span className="bg-alerta-50 py-0.2 text-alerta-700 dark:bg-alerta-950/40 dark:text-alerta-400 rounded px-1.5 font-semibold">
                            SLA Vencido
                          </span>
                        )}

                        {!conv.ventana.abierta ? (
                          <span className="py-0.2 rounded bg-neutral-100 px-1.5 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                            24h Cerrada
                          </span>
                        ) : (
                          <span className="bg-ok-50 py-0.2 text-ok-700 dark:bg-ok-950/40 dark:text-ok-400 rounded px-1.5 font-semibold">
                            {ventanaInfo.texto}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}

            {pagina?.pageInfo.hasMore && (
              <div className="p-3 text-center">
                <button
                  type="button"
                  onClick={() => void cargarMas()}
                  disabled={cargandoMas}
                  className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400"
                >
                  {cargandoMas ? 'Cargando más...' : 'Cargar más conversaciones'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
