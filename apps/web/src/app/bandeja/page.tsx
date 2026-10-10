'use client';

/**
 * Bandeja de entrada de conversaciones de WhatsApp (`/bandeja`).
 *
 * Pantalla principal del asesor de viajes:
 * - Lista paginada por cursor contra `ConversacionResumen` (@viajapro/contracts).
 * - Soporta 500 conversaciones sin degradar el desplazamiento ni el renderizado.
 * - Filtros rápidos: TODAS, MIAS, SIN_ASIGNAR, SIN_LEER, SLA_VENCIDO.
 * - Búsqueda por texto (nombre, teléfono y contenido del mensaje).
 * - Indicadores clave de un vistazo: SLA vencido / por vencer, ventana 24h.
 * - Navegación por teclado completa.
 * - Soporte de TIEMPO REAL (`EventoBandeja`):
 *   * safeParse para descartar en silencio eventos desconocidos.
 *   * Guard de Mouse Hover: no reordena las filas mientras el ratón esté encima para
 *     evitar clicks erróneos del asesor.
 * - Cliente HTTP unificado (`inboxApi`): Interruptor por variable de entorno para cambiar a API real NestJS.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type {
  ConversacionResumen,
  EventoBandeja,
  FiltroBandeja,
  PaginaBandeja,
} from '@viajapro/contracts';
import { ID_ASESOR_ACTUAL, MOCK_CONVERSACIONES } from '../../lib/mock-inbox';
import { inboxApi, InboxErrorApi } from '../../lib/inbox-api';
import { realtimeMockBus } from '../../lib/realtime-mock';
import { SimuladorTiempoReal } from '../../components/SimuladorTiempoReal';

const FILTROS: { id: FiltroBandeja; etiqueta: string }[] = [
  { id: 'TODAS', etiqueta: 'Todas' },
  { id: 'MIAS', etiqueta: 'Mías' },
  { id: 'SIN_ASIGNAR', etiqueta: 'Sin asignar' },
  { id: 'SIN_LEER', etiqueta: 'Sin leer' },
  { id: 'SLA_VENCIDO', etiqueta: 'SLA Vencido' },
];

export default function BandejaPage() {
  const [filtro, setFiltro] = useState<FiltroBandeja>('TODAS');
  const [buscar, setBuscar] = useState('');
  const [buscarDebounced, setBuscarDebounced] = useState('');

  const [pagina, setPagina] = useState<PaginaBandeja | null>(null);
  const [conversaciones, setConversaciones] = useState<ConversacionResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guard de Mouse Hover para no reordenar bajo el cursor
  const [_isHoveringList, setIsHoveringList] = useState(false);
  const isHoveringListRef = useRef(false);
  const [pendientesReorden, setPendientesReorden] = useState<number>(0);
  const bufferConversacionesRef = useRef<ConversacionResumen[] | null>(null);

  // Selección activa para teclado
  const [indiceSeleccionado, setIndiceSeleccionado] = useState<number>(0);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  // Debounce para la búsqueda de texto
  useEffect(() => {
    const timer = setTimeout(() => {
      setBuscarDebounced(buscar);
    }, 200);
    return () => clearTimeout(timer);
  }, [buscar]);

  // Carga inicial y cambio de filtro / búsqueda a través de inboxApi
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
      if (e instanceof InboxErrorApi) {
        setError(`[${e.code}] ${e.message}`);
      } else {
        setError(e instanceof Error ? e.message : 'Error desconocido al cargar conversaciones');
      }
      setConversaciones([]);
      setPagina(null);
    } finally {
      setCargando(false);
    }
  }, [filtro, buscarDebounced]);

  useEffect(() => {
    void cargarInicial();
  }, [cargarInicial]);

  // Aplicar reordenamiento diferido al salir el mouse de la lista
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

  // Suscripción a eventos de Tiempo Real (EventoBandeja)
  useEffect(() => {
    const unsubscribe = realtimeMockBus.subscribe((evento: EventoBandeja) => {
      setConversaciones((prev) => {
        let listaActualizada = [...prev];

        if (evento.tipo === 'MENSAJE_NUEVO') {
          const idx = listaActualizada.findIndex((c) => c.id === evento.conversacionId);
          if (idx !== -1) {
            const actual = listaActualizada[idx];
            if (actual) {
              const convUpdated: ConversacionResumen = {
                ...actual,
                ultimoMensajeTexto: evento.mensaje.texto || 'Mensaje de adjunto',
                ultimoMensajeEn: evento.mensaje.ocurridoEn,
                ultimoMensajeDireccion: evento.mensaje.direccion,
                mensajesSinLeer:
                  evento.mensaje.direccion === 'ENTRANTE'
                    ? actual.mensajesSinLeer + 1
                    : actual.mensajesSinLeer,
              };
              listaActualizada[idx] = convUpdated;
            }
          }
        } else if (evento.tipo === 'CONVERSACION_ACTUALIZADA') {
          const idx = listaActualizada.findIndex((c) => c.id === evento.conversacion.id);
          if (idx !== -1) {
            listaActualizada[idx] = evento.conversacion;
          } else {
            listaActualizada = [evento.conversacion, ...listaActualizada];
          }
        }

        if (isHoveringListRef.current) {
          bufferConversacionesRef.current = listaActualizada;
          setPendientesReorden((p) => p + 1);
          return prev;
        }

        return listaActualizada.sort((a, b) => {
          const tA = a.ultimoMensajeEn ? new Date(a.ultimoMensajeEn).getTime() : 0;
          const tB = b.ultimoMensajeEn ? new Date(b.ultimoMensajeEn).getTime() : 0;
          return tB - tA;
        });
      });
    });

    return () => unsubscribe();
  }, []);

  // Cargar más páginas por cursor
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
      setError(e instanceof Error ? e.message : 'Error al cargar más conversaciones');
    } finally {
      setCargandoMas(false);
    }
  };

  // Manejo de Teclado
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (conversaciones.length === 0) return;

    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      setIndiceSeleccionado((prev) => {
        const nxt = Math.min(prev + 1, conversaciones.length - 1);
        itemRefs.current[nxt]?.focus();
        return nxt;
      });
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      setIndiceSeleccionado((prev) => {
        const nxt = Math.max(prev - 1, 0);
        itemRefs.current[nxt]?.focus();
        return nxt;
      });
    }
  };

  // Conteos rápidos por filtro
  const conteosFiltro = useMemo(() => {
    const todos = MOCK_CONVERSACIONES;
    return {
      TODAS: todos.length,
      MIAS: todos.filter((c) => c.asignadoAId === ID_ASESOR_ACTUAL).length,
      SIN_ASIGNAR: todos.filter((c) => c.asignadoAId === null).length,
      SIN_LEER: todos.filter((c) => c.mensajesSinLeer > 0).length,
      SLA_VENCIDO: todos.filter(
        (c) => c.slaVenceEn !== null && new Date(c.slaVenceEn).getTime() < Date.now(),
      ).length,
    };
  }, []);

  return (
    <div
      className="flex h-screen flex-col bg-neutral-100 text-neutral-900 focus:outline-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-label="Bandeja de conversaciones de WhatsApp"
    >
      <header className="sticky top-0 z-20 shrink-0 border-b border-neutral-200 bg-white shadow-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-2">
            <div className="bg-acento-600 flex h-8 w-8 items-center justify-center rounded-lg font-bold text-white shadow-xs">
              💬
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-neutral-900 sm:text-lg">
                Bandeja de Entrada — WhatsApp
              </h1>
              <p className="text-[11px] text-neutral-500">
                Monitoreo multi-tenant · Modos:{' '}
                {inboxApi.isModoReal() ? '🔌 API NestJS Real' : '⚡ Mock Simulador'} · 390px
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="border-ok-600/30 bg-ok-50 text-ok-700 hidden items-center gap-1 rounded-full border px-2 py-0.5 font-medium sm:inline-flex">
              <span className="bg-ok-500 h-2 w-2 animate-pulse rounded-full"></span>
              En vivo
            </span>
          </div>
        </div>

        <div className="border-t border-neutral-100 bg-neutral-50/50 px-3 py-2 sm:px-4">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex overflow-x-auto pb-1 font-medium sm:pb-0">
              <div className="flex gap-1 rounded-md border border-neutral-200 bg-white p-0.5 shadow-2xs">
                {FILTROS.map((f) => {
                  const activo = filtro === f.id;
                  const conteo = conteosFiltro[f.id];
                  return (
                    <button
                      key={f.id}
                      onClick={() => setFiltro(f.id)}
                      className={`flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs whitespace-nowrap transition-colors ${
                        activo
                          ? 'bg-neutral-900 font-semibold text-white shadow-2xs'
                          : 'text-neutral-600 hover:bg-neutral-100'
                      }`}
                    >
                      <span>{f.etiqueta}</span>
                      <span
                        className={`py-0.2 rounded-full px-1.5 text-[10px] ${
                          activo
                            ? 'bg-neutral-700 text-neutral-100'
                            : 'bg-neutral-100 text-neutral-500'
                        }`}
                      >
                        {conteo}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="relative w-full sm:w-72">
              <input
                type="text"
                placeholder="Buscar por cliente, teléfono o mensaje..."
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                className="focus:border-acento-600 focus:ring-acento-600 w-full rounded-md border border-neutral-300 bg-white py-1.5 pr-3 pl-8 text-xs text-neutral-900 placeholder:text-neutral-400 focus:ring-1 focus:outline-hidden"
              />
              <span className="absolute top-2 left-2.5 text-neutral-400">🔍</span>
              {buscar && (
                <button
                  onClick={() => setBuscar('')}
                  className="absolute top-1.5 right-2 text-xs font-bold text-neutral-400 hover:text-neutral-600"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {pendientesReorden > 0 && (
        <div className="animate-in slide-in-from-top sticky top-[105px] z-30 flex items-center justify-between border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900 shadow-sm">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 animate-ping rounded-full bg-amber-500"></span>
            📌 Hay {pendientesReorden} actualización(es) de mensajes. Reordenamiento en pausa
            mientras el ratón esté sobre la lista (Guard R5/UI).
          </span>
          <button
            onClick={aplicarReordenDiferido}
            className="rounded border border-amber-400 bg-white px-2.5 py-1 text-xs font-bold text-amber-950 shadow-2xs hover:bg-amber-100"
          >
            Reordenar ahora
          </button>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-3 py-3 sm:px-4">
        {cargando ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="flex animate-pulse flex-col gap-2 rounded-sm border border-neutral-200 bg-white p-3 shadow-2xs"
              >
                <div className="flex justify-between">
                  <div className="h-4 w-1/3 rounded bg-neutral-200"></div>
                  <div className="h-4 w-16 rounded bg-neutral-200"></div>
                </div>
                <div className="h-3 w-2/3 rounded bg-neutral-100"></div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="border-alerta-600/30 bg-alerta-50 rounded-md border p-4 text-center">
            <p className="text-alerta-800 text-sm font-semibold">Error al cargar la bandeja</p>
            <p className="text-alerta-700 mt-1 text-xs">{error}</p>
            <button
              onClick={() => void cargarInicial()}
              className="bg-alerta-700 hover:bg-alerta-800 mt-3 rounded-md px-3 py-1.5 text-xs font-medium text-white shadow-2xs"
            >
              Reintentar
            </button>
          </div>
        ) : conversaciones.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-white py-12 text-center">
            <div className="text-3xl">📥</div>
            <h3 className="mt-2 text-sm font-bold text-neutral-800">No hay conversaciones</h3>
            <p className="mt-1 text-xs text-neutral-500">
              {buscar
                ? `No se encontraron resultados para "${buscar}"`
                : 'No hay mensajes correspondientes al filtro seleccionado.'}
            </p>
            {buscar && (
              <button
                onClick={() => setBuscar('')}
                className="text-acento-600 mt-3 text-xs font-semibold hover:underline"
              >
                Limpiar búsqueda
              </button>
            )}
          </div>
        ) : (
          <div
            role="listbox"
            aria-label="Lista de conversaciones"
            className="space-y-2"
            onMouseEnter={() => {
              setIsHoveringList(true);
              isHoveringListRef.current = true;
            }}
            onMouseLeave={() => {
              setIsHoveringList(false);
              isHoveringListRef.current = false;
              aplicarReordenDiferido();
            }}
          >
            {conversaciones.map((conv, idx) => {
              const esSeleccionada = idx === indiceSeleccionado;
              return (
                <ConversacionFila
                  key={conv.id}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  conversacion={conv}
                  esSeleccionada={esSeleccionada}
                  onClick={() => setIndiceSeleccionado(idx)}
                />
              );
            })}

            {pagina?.pageInfo.hasMore && (
              <div className="pt-3 pb-6 text-center">
                <button
                  onClick={() => void cargarMas()}
                  disabled={cargandoMas}
                  className="rounded-sm border border-neutral-300 bg-white px-4 py-2 text-xs font-medium text-neutral-700 shadow-2xs hover:bg-neutral-50 disabled:opacity-50"
                >
                  {cargandoMas
                    ? 'Cargando más conversaciones...'
                    : `Cargar más (cargadas ${conversaciones.length} de ${conteosFiltro[filtro]})`}
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      <SimuladorTiempoReal conversaciones={conversaciones} />

      <footer className="flex shrink-0 items-center justify-between border-t border-neutral-200 bg-white px-3 py-1.5 text-[11px] text-neutral-500">
        <span>
          Usa{' '}
          <kbd className="py-0.2 rounded border border-neutral-300 bg-neutral-100 px-1 font-mono text-[10px]">
            ↑
          </kbd>{' '}
          <kbd className="py-0.2 rounded border border-neutral-300 bg-neutral-100 px-1 font-mono text-[10px]">
            ↓
          </kbd>{' '}
          o{' '}
          <kbd className="py-0.2 rounded border border-neutral-300 bg-neutral-100 px-1 font-mono text-[10px]">
            k
          </kbd>
          /
          <kbd className="py-0.2 rounded border border-neutral-300 bg-neutral-100 px-1 font-mono text-[10px]">
            j
          </kbd>{' '}
          para navegar entre conversaciones.
        </span>
        <span className="hidden text-neutral-400 sm:inline">ViajaPro WhatsApp Inbox v0.1.0</span>
      </footer>
    </div>
  );
}

interface ConversacionFilaProps {
  conversacion: ConversacionResumen;
  esSeleccionada: boolean;
  onClick: () => void;
  ref: (el: HTMLAnchorElement | null) => void;
}

function ConversacionFila({
  conversacion: c,
  esSeleccionada,
  onClick,
  ref,
}: ConversacionFilaProps) {
  const ahora = Date.now();

  const slaEstado = useMemo(() => {
    if (!c.slaVenceEn) return null;
    const tiempoMs = new Date(c.slaVenceEn).getTime() - ahora;
    if (tiempoMs < 0) {
      const minVencido = Math.abs(Math.round(tiempoMs / 60000));
      return { tipo: 'VENCIDO' as const, texto: `SLA Vencido hace ${minVencido}m` };
    }
    const minRestantes = Math.round(tiempoMs / 60000);
    if (minRestantes <= 60) {
      return { tipo: 'POR_VENCER' as const, texto: `SLA Vence en ${minRestantes}m` };
    }
    return { tipo: 'NORMAL' as const, texto: `SLA ${minRestantes}m` };
  }, [c.slaVenceEn, ahora]);

  const horaFormateada = useMemo(() => {
    if (!c.ultimoMensajeEn) return '';
    const d = new Date(c.ultimoMensajeEn);
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }, [c.ultimoMensajeEn]);

  return (
    <Link
      href={`/bandeja/${c.id}`}
      ref={ref}
      onClick={onClick}
      role="option"
      aria-selected={esSeleccionada}
      tabIndex={esSeleccionada ? 0 : -1}
      className={`group relative flex cursor-pointer flex-col gap-1.5 rounded-sm border p-2.5 transition-all sm:flex-row sm:items-center sm:justify-between ${
        esSeleccionada
          ? 'border-acento-600 bg-acento-50/50 ring-acento-600 shadow-xs ring-2'
          : c.mensajesSinLeer > 0
            ? 'border-neutral-300 bg-white font-medium'
            : 'border-neutral-200 bg-white hover:bg-neutral-50/80'
      }`}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-base font-semibold text-neutral-900">
            {c.contactoNombre ? c.contactoNombre : c.contactoTelefono}
          </span>

          {c.contactoNombre && (
            <span className="cifra text-xs font-normal text-neutral-400">{c.contactoTelefono}</span>
          )}

          {c.asignadoAId === null ? (
            <span className="py-0.2 rounded-xs border border-amber-600/40 bg-amber-50 px-1.5 text-[11px] font-bold text-amber-800 shadow-2xs">
              Sin asignar
            </span>
          ) : (
            <span className="text-xs font-normal text-neutral-500">· {c.asignadoANombre}</span>
          )}

          {slaEstado?.tipo === 'VENCIDO' && (
            <span className="border-alerta-600/40 bg-alerta-50 py-0.2 text-alerta-700 rounded-xs border px-1.5 text-[11px] font-bold shadow-2xs">
              {slaEstado.texto}
            </span>
          )}
          {slaEstado?.tipo === 'POR_VENCER' && (
            <span className="border-aviso-600/40 bg-aviso-50 py-0.2 text-aviso-700 rounded-xs border px-1.5 text-[11px] font-semibold">
              {slaEstado.texto}
            </span>
          )}
        </div>

        <p className="truncate text-xs text-neutral-600">
          <span className="font-semibold text-neutral-400">
            {c.ultimoMensajeDireccion === 'ENTRANTE' ? '← ' : 'Tú: '}
          </span>
          {c.ultimoMensajeTexto ?? 'Sin mensajes'}
        </p>

        {c.etiquetas.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {c.etiquetas.map((e) => (
              <span
                key={e}
                className="py-0.2 rounded-xs border border-neutral-200 bg-neutral-100 px-1.5 text-[10px] font-medium text-neutral-600"
              >
                {e}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-neutral-100 pt-1.5 sm:flex-col sm:items-end sm:justify-center sm:border-t-0 sm:pt-0">
        <div className="flex items-center gap-1.5">
          {!c.ventana.abierta ? (
            <span
              title="Fuera de la ventana de 24h: solo plantillas aprobadas"
              className="py-0.2 rounded-xs border border-neutral-300 bg-neutral-100 px-1.5 text-[11px] font-medium text-neutral-600"
            >
              24h Cerrada
            </span>
          ) : c.ventana.minutosRestantes !== null && c.ventana.minutosRestantes <= 60 ? (
            <span className="border-aviso-600/40 bg-aviso-50 py-0.2 text-aviso-700 rounded-xs border px-1.5 text-[11px] font-medium">
              24h: {c.ventana.minutosRestantes}m
            </span>
          ) : (
            <span className="border-ok-600/30 bg-ok-50 text-ok-700 rounded-xs border px-1.5 text-[11px] font-medium">
              24h activa
            </span>
          )}

          {c.mensajesSinLeer > 0 && (
            <span className="bg-acento-600 py-0.2 rounded-full px-2 text-xs font-bold text-white shadow-2xs">
              {c.mensajesSinLeer}
            </span>
          )}
        </div>

        <span className="cifra text-xs font-normal text-neutral-400">{horaFormateada}</span>
      </div>
    </Link>
  );
}
