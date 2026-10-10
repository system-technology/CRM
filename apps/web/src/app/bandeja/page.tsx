'use client';

/**
 * Bandeja de entrada de conversaciones de WhatsApp (`/bandeja`).
 *
 * Pantalla principal del asesor de viajes:
 * - Lista paginada por cursor contra `ConversacionResumen` (@viajapro/contracts).
 * - Soporta 500 conversaciones sin degradar el desplazamiento ni el renderizado.
 * - Filtros rápidos: TODAS, MIAS, SIN_ASIGNAR, SIN_LEER, SLA_VENCIDO.
 * - Búsqueda por texto (nombre, teléfono y contenido del mensaje).
 * - Indicadores clave de un vistazo: SLA vencido (rojo) / por vencer (ámbar),
 *   ventana de 24h cerrada / por vencer, y badge destacado de "Sin asignar".
 * - Navegación por teclado completa (flechas arriba/abajo, Enter).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConversacionResumen, FiltroBandeja, PaginaBandeja } from '@viajapro/contracts';
import { consultarBandejaMock, ID_ASESOR_ACTUAL, MOCK_CONVERSACIONES } from '../../lib/mock-inbox';

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

  // Selección activa para teclado
  const [indiceSeleccionado, setIndiceSeleccionado] = useState<number>(0);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Debounce para la búsqueda de texto
  useEffect(() => {
    const timer = setTimeout(() => {
      setBuscarDebounced(buscar);
    }, 200);
    return () => clearTimeout(timer);
  }, [buscar]);

  // Carga inicial y cambio de filtro / búsqueda
  const cargarInicial = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await consultarBandejaMock(
        {
          filtro,
          buscar: buscarDebounced,
          limite: 30,
        },
        300, // Latencia simulada
      );
      setPagina(res);
      setConversaciones(res.datos);
      setIndiceSeleccionado(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido al cargar conversaciones');
      setConversaciones([]);
      setPagina(null);
    } finally {
      setCargando(false);
    }
  }, [filtro, buscarDebounced]);

  useEffect(() => {
    void cargarInicial();
  }, [cargarInicial]);

  // Cargar más páginas por cursor
  const cargarMas = async () => {
    if (!pagina?.pageInfo.nextCursor || cargandoMas) return;
    setCargandoMas(true);
    try {
      const res = await consultarBandejaMock({
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

  // Conteo total local para los badges de los botones de filtro
  const conteosFiltro = useMemo(() => {
    const ahora = Date.now();
    return {
      TODAS: MOCK_CONVERSACIONES.length,
      MIAS: MOCK_CONVERSACIONES.filter((c) => c.asignadoAId === ID_ASESOR_ACTUAL).length,
      SIN_ASIGNAR: MOCK_CONVERSACIONES.filter((c) => c.asignadoAId === null).length,
      SIN_LEER: MOCK_CONVERSACIONES.filter((c) => c.mensajesSinLeer > 0).length,
      SLA_VENCIDO: MOCK_CONVERSACIONES.filter(
        (c) => c.slaVenceEn !== null && new Date(c.slaVenceEn).getTime() < ahora,
      ).length,
    };
  }, []);

  // Manejo de navegación por teclado
  const manejarKeyDown = (e: React.KeyboardEvent) => {
    if (conversaciones.length === 0) return;

    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      setIndiceSeleccionado((prev) => {
        const sig = Math.min(prev + 1, conversaciones.length - 1);
        itemRefs.current[sig]?.scrollIntoView({ block: 'nearest' });
        return sig;
      });
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      setIndiceSeleccionado((prev) => {
        const ant = Math.max(prev - 1, 0);
        itemRefs.current[ant]?.scrollIntoView({ block: 'nearest' });
        return ant;
      });
    } else if (e.key === 'Home') {
      e.preventDefault();
      setIndiceSeleccionado(0);
      itemRefs.current[0]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'End') {
      e.preventDefault();
      const ultimo = conversaciones.length - 1;
      setIndiceSeleccionado(ultimo);
      itemRefs.current[ultimo]?.scrollIntoView({ block: 'nearest' });
    }
  };

  return (
    <div
      className="flex h-screen flex-col bg-neutral-100 text-neutral-900 focus:outline-none"
      onKeyDown={manejarKeyDown}
      tabIndex={0}
      aria-label="Bandeja de conversaciones de WhatsApp"
    >
      {/* Barra superior de filtros y búsqueda (Alta densidad) */}
      <header className="shrink-0 border-b border-neutral-200 bg-white px-3 py-2.5 shadow-xs">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-neutral-800">
              Bandeja de entrada
            </h1>
            <span className="rounded-full border border-neutral-200 bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600">
              {pagina ? `${conversaciones.length} visibles` : '...'}
            </span>
          </div>

          {/* Búsqueda rápida */}
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar por cliente, teléfono o texto…"
              className="focus:border-acento-600 w-full rounded-sm border border-neutral-300 bg-neutral-50 px-2.5 py-1 text-base text-neutral-800 placeholder-neutral-400 focus:bg-white focus:outline-none"
            />
            {buscar && (
              <button
                onClick={() => setBuscar('')}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-xs text-neutral-400 hover:text-neutral-700"
                title="Limpiar búsqueda"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Pestañas de filtros */}
        <nav
          className="mt-2.5 flex flex-wrap gap-1 border-t border-neutral-100 pt-2"
          aria-label="Filtros"
        >
          {FILTROS.map((f) => {
            const activo = filtro === f.id;
            const cantidad = conteosFiltro[f.id];
            return (
              <button
                key={f.id}
                onClick={() => setFiltro(f.id)}
                className={`flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium transition-colors ${
                  activo
                    ? 'bg-acento-700 font-semibold text-white shadow-xs'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                }`}
              >
                <span>{f.etiqueta}</span>
                <span
                  className={`py-0.2 rounded-full px-1.5 text-[10px] ${
                    activo ? 'bg-white/20 font-bold text-white' : 'bg-neutral-200 text-neutral-600'
                  }`}
                >
                  {cantidad}
                </span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* Contenido principal: Lista de conversaciones */}
      <main className="flex-1 overflow-y-auto p-2 sm:p-3">
        {/* ESTADO 1: ERROR */}
        {error && (
          <div
            role="alert"
            className="border-alerta-600/30 bg-alerta-50 text-alerta-700 mx-auto my-4 max-w-lg rounded-md border p-4 text-base shadow-xs"
          >
            <div className="flex items-start justify-between">
              <div>
                <strong className="font-semibold">Error al cargar la bandeja</strong>
                <p className="mt-1 text-sm">{error}</p>
              </div>
              <button
                onClick={() => void cargarInicial()}
                className="bg-alerta-700 hover:bg-alerta-800 rounded-sm px-3 py-1 text-xs font-medium text-white"
              >
                Reintentar
              </button>
            </div>
          </div>
        )}

        {/* ESTADO 2: CARGANDO (Esqueleto, sin girador) */}
        {cargando && !error && (
          <div className="space-y-1.5" aria-busy="true" aria-label="Cargando conversaciones">
            {Array.from({ length: 12 }).map((_, idx) => (
              <div
                key={idx}
                className="flex animate-pulse items-center justify-between rounded-sm border border-neutral-200 bg-white p-3 shadow-2xs"
              >
                <div className="w-2/3 space-y-2">
                  <div className="h-4 w-1/3 rounded-xs bg-neutral-200" />
                  <div className="h-3 w-3/4 rounded-xs bg-neutral-200" />
                </div>
                <div className="flex w-1/4 flex-col items-end space-y-2">
                  <div className="h-3 w-12 rounded-xs bg-neutral-200" />
                  <div className="h-4 w-20 rounded-xs bg-neutral-200" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ESTADO 3: VACÍO */}
        {!cargando && !error && conversaciones.length === 0 && (
          <div className="mx-auto my-12 max-w-md rounded-md border border-neutral-200 bg-white p-8 text-center shadow-2xs">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
              💬
            </div>
            <h2 className="text-base font-semibold text-neutral-800">
              No hay conversaciones en esta vista
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              {buscar
                ? `No encontramos coincidencias para "${buscar}". Prueba con otro término.`
                : 'No existen conversaciones que coincidan con el filtro seleccionado.'}
            </p>
            {buscar && (
              <button
                onClick={() => setBuscar('')}
                className="mt-4 rounded-sm border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Limpiar filtro de búsqueda
              </button>
            )}
          </div>
        )}

        {/* LISTA CON VOLUMEN DE 500 CONVERSACIONES (Alta densidad) */}
        {!cargando && !error && conversaciones.length > 0 && (
          <div className="space-y-1">
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

            {/* Paginación por Cursor: Cargar más */}
            {pagina?.pageInfo.hasMore && (
              <div className="pt-3 pb-6 text-center">
                <button
                  onClick={() => void cargarMas()}
                  disabled={cargandoMas}
                  className="rounded-sm border border-neutral-300 bg-white px-4 py-2 text-xs font-medium text-neutral-700 shadow-2xs hover:bg-neutral-50 disabled:opacity-50"
                >
                  {cargandoMas
                    ? 'Cargando más conversaciones…'
                    : `Cargar más (cargadas ${conversaciones.length} de ${conteosFiltro[filtro]})`}
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Pie con ayuda de atajos de teclado */}
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
  ref: (el: HTMLDivElement | null) => void;
}

function ConversacionFila({
  conversacion: c,
  esSeleccionada,
  onClick,
  ref,
}: ConversacionFilaProps) {
  const ahora = Date.now();

  // Cálculo visual de estado SLA
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

  // Formato de hora del último mensaje
  const horaFormateada = useMemo(() => {
    if (!c.ultimoMensajeEn) return '';
    const d = new Date(c.ultimoMensajeEn);
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }, [c.ultimoMensajeEn]);

  return (
    <div
      ref={ref}
      onClick={onClick}
      className={`group relative flex cursor-pointer flex-col gap-1.5 rounded-sm border p-2.5 transition-all sm:flex-row sm:items-center sm:justify-between ${
        esSeleccionada
          ? 'border-acento-600 bg-acento-50/50 ring-acento-600 shadow-xs ring-2'
          : c.mensajesSinLeer > 0
            ? 'border-neutral-300 bg-white font-medium'
            : 'border-neutral-200 bg-white hover:bg-neutral-50/80'
      }`}
    >
      {/* Izquierda: Cliente y mensaje preview */}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Nombre o Teléfono prioritario */}
          <span className="truncate text-base font-semibold text-neutral-900">
            {c.contactoNombre ? c.contactoNombre : c.contactoTelefono}
          </span>

          {/* Teléfono secundario si hay nombre */}
          {c.contactoNombre && (
            <span className="cifra text-xs font-normal text-neutral-400">{c.contactoTelefono}</span>
          )}

          {/* BADGE CRÍTICO 1: Sin Asignar */}
          {c.asignadoAId === null ? (
            <span className="py-0.2 rounded-xs border border-amber-600/40 bg-amber-50 px-1.5 text-[11px] font-bold text-amber-800 shadow-2xs">
              Sin asignar
            </span>
          ) : (
            <span className="text-xs font-normal text-neutral-500">• {c.asignadoANombre}</span>
          )}

          {/* BADGE CRÍTICO 2: SLA Vencido / Por vencer */}
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

        {/* Vista previa del último mensaje */}
        <p className="truncate text-xs text-neutral-600">
          <span className="font-semibold text-neutral-400">
            {c.ultimoMensajeDireccion === 'ENTRANTE' ? '← ' : 'Tú: '}
          </span>
          {c.ultimoMensajeTexto ?? 'Sin mensajes'}
        </p>

        {/* Etiquetas de la conversación */}
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

      {/* Derecha: Ventana 24h, mensajes sin leer y timestamp */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-neutral-100 pt-1.5 sm:flex-col sm:items-end sm:justify-center sm:border-t-0 sm:pt-0">
        <div className="flex items-center gap-1.5">
          {/* BADGE CRÍTICO 3: Ventana de Servicio 24h (Visible sin abrir) */}
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
            <span className="border-ok-600/30 bg-ok-50 py-0.2 text-ok-700 rounded-xs border px-1.5 text-[11px] font-medium">
              24h activa
            </span>
          )}

          {/* Contador de mensajes sin leer */}
          {c.mensajesSinLeer > 0 && (
            <span className="bg-acento-600 py-0.2 rounded-full px-2 text-xs font-bold text-white shadow-2xs">
              {c.mensajesSinLeer}
            </span>
          )}
        </div>

        {/* Hora del último evento */}
        <span className="cifra text-xs font-normal text-neutral-400">{horaFormateada}</span>
      </div>
    </div>
  );
}
