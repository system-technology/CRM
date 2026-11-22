'use client';

/**
 * Cobros — «quién pagó y quién debe» (T-332, ADR-0034 §8) y su exportación a CSV (T-335).
 *
 * Una fila por archivo de viaje abierto, con total, pagado y saldo YA derivados por el servidor:
 * esta pantalla no suma ni resta nada (ADR-0034 §2). El filtro por estado de cobro y el alcance (lo
 * propio o toda la agencia) los impone `GET /api/v1/cobros`; ocultar o mostrar algo aquí no es
 * control de acceso. R3: tipos de `@viajapro/contracts`; R8: dinero por `formatearDinero`, nunca
 * una división a mano; R9: fechas de calendario tal cual vienen (`AAAA-MM-DD`).
 *
 * Origen de datos: API real por defecto; maqueta solo con `?demo=1` (distintivo visible).
 */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Lock, RefreshCw, Wallet } from 'lucide-react';
import type { EstadoDeCobro, FilaDeCobro, VistaDeCobros } from '@viajapro/contracts';
import { DistintivoDatosDemo } from '../../../components/comun/distintivo-datos-demo';
import { AvisoErrorAccionable, EsqueletoTabla } from '../../../components/comun/esqueletos';
import { TituloDePantalla } from '../../../components/comun/titulo-de-pantalla';
import { listarCobros } from '../../../lib/cobros-api';
import {
  CLASE_TONO,
  ETIQUETA_ESTADO_DE_COBRO,
  ETIQUETA_SITUACION,
  pasajerosEnPantalla,
  TONO_ESTADO_DE_COBRO,
  saldoEnPantalla,
} from '../../../lib/cobros-logica';
import { descargarArchivoCSV, exportarCobrosCSV } from '../../../lib/exportar-csv';
import { formatearDinero, formatearFecha } from '../../../lib/formato';
import type { MensajeErrorDetallado } from '../../../lib/estados-ui-logica';
import { PERMISO_COBRO_VER, usePermisos } from '../../../lib/permisos';
import { useModoDemo } from '../../../lib/modo-demo';

type FiltroDeCobro = 'TODOS' | 'SALDO_PENDIENTE' | 'POR_VENCER' | 'VENCIDO' | 'AL_DIA';

const FILTROS: ReadonlyArray<{ valor: FiltroDeCobro; etiqueta: string }> = [
  { valor: 'TODOS', etiqueta: 'Todos' },
  { valor: 'SALDO_PENDIENTE', etiqueta: ETIQUETA_ESTADO_DE_COBRO.SALDO_PENDIENTE },
  { valor: 'POR_VENCER', etiqueta: ETIQUETA_ESTADO_DE_COBRO.POR_VENCER },
  { valor: 'VENCIDO', etiqueta: ETIQUETA_ESTADO_DE_COBRO.VENCIDO },
  { valor: 'AL_DIA', etiqueta: ETIQUETA_ESTADO_DE_COBRO.AL_DIA },
];

type Carga =
  | { tipo: 'cargando' }
  | { tipo: 'error'; error: MensajeErrorDetallado }
  | { tipo: 'listo'; vista: VistaDeCobros };

const dia = (iso: string): string => formatearFecha(iso, { estilo: 'corta', conHora: false });

function EtiquetaDeEstado({ estado }: { estado: EstadoDeCobro }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CLASE_TONO[TONO_ESTADO_DE_COBRO[estado]]}`}
    >
      {ETIQUETA_ESTADO_DE_COBRO[estado]}
    </span>
  );
}

/** Saldo: el signo se dice con palabras (un saldo a favor no se pinta como «−$»). */
function Saldo({ fila }: { fila: FilaDeCobro }) {
  const { etiqueta, dinero } = saldoEnPantalla(fila);
  return (
    <>
      <span className="font-semibold tabular-nums">{formatearDinero(dinero)}</span>
      {fila.situacion === 'SALDO_A_FAVOR' && (
        <span className="block text-xs text-neutral-700 dark:text-neutral-300">{etiqueta}</span>
      )}
    </>
  );
}

/**
 * Cuántos viajan: total grande y, si hay niños o infantes, la composición debajo. Solo cifras
 * (R10): esta vista la lee también OPERACIONES y se exporta. Sin dato, «—» y no `0`.
 */
function Pasajeros({ fila, alineado }: { fila: FilaDeCobro; alineado?: 'derecha' }) {
  const { total, detalle, etiqueta } = pasajerosEnPantalla(fila.pasajeros);
  return (
    <span className={alineado === 'derecha' ? 'block text-right' : 'block'}>
      <span className="sr-only">{etiqueta}</span>
      <span
        aria-hidden="true"
        data-testid="pasajeros-de-cobro"
        className="font-semibold tabular-nums"
      >
        {total}
      </span>
      {detalle && (
        <span aria-hidden="true" className="block text-xs text-neutral-700 dark:text-neutral-300">
          {detalle}
        </span>
      )}
    </span>
  );
}

function TablaDeCobros({ filas }: { filas: readonly FilaDeCobro[] }) {
  return (
    <>
      {/* Móvil: una tarjeta por archivo, sin desplazamiento lateral */}
      <ul className="space-y-2 p-4 md:hidden" aria-label="Archivos con su saldo">
        {filas.map((f) => (
          <li
            key={f.archivoId}
            data-testid="fila-de-cobro"
            className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <Link
              href={`/viajes?id=${f.archivoId}`}
              className="focus-visible:ring-acento-600 -m-1 flex min-h-[44px] items-start justify-between gap-2 rounded-lg p-1 focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  File {f.numero} · {f.destino}
                </span>
                <span className="block text-xs text-neutral-700 dark:text-neutral-300">
                  Sale el {dia(f.fechaSalida)}
                </span>
              </span>
              <EtiquetaDeEstado estado={f.estadoDeCobro} />
            </Link>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div className="min-w-0">
                <dt className="text-neutral-700 dark:text-neutral-300">Total</dt>
                <dd className="tabular-nums">{formatearDinero(f.total)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-neutral-700 dark:text-neutral-300">Pagado</dt>
                <dd className="tabular-nums">{formatearDinero(f.pagado)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-neutral-700 dark:text-neutral-300">Saldo</dt>
                <dd>
                  <Saldo fila={f} />
                </dd>
              </div>
            </dl>
            <div className="mt-2 flex items-baseline gap-2 text-xs text-neutral-700 dark:text-neutral-300">
              <span>Pasajeros</span>
              <Pasajeros fila={f} />
            </div>
            <p className="mt-2 text-xs text-neutral-700 dark:text-neutral-300">
              {ETIQUETA_SITUACION[f.situacion]} · Plazo de cobro: {dia(f.fechaLimite)}
            </p>
          </li>
        ))}
      </ul>

      {/* Tableta y escritorio: tabla de ancho fijo que reparte el espacio */}
      <table className="hidden w-full table-fixed text-sm md:table">
        <caption className="sr-only">Archivos de viaje abiertos con total, pagado y saldo</caption>
        <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
          <tr>
            <th scope="col" className="w-[26%] px-4 py-2 font-medium">
              Archivo
            </th>
            <th scope="col" className="w-[11%] px-3 py-2 text-right font-medium">
              Pasajeros
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Total
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Pagado
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Saldo
            </th>
            <th scope="col" className="w-[22%] px-4 py-2 font-medium">
              Estado de cobro
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {filas.map((f) => (
            <tr key={f.archivoId} data-testid="fila-de-cobro" className="align-top">
              <td className="px-4 py-3">
                <Link
                  href={`/viajes?id=${f.archivoId}`}
                  className="focus-visible:ring-acento-600 block rounded-lg focus-visible:ring-2 focus-visible:outline-none"
                >
                  <span className="block truncate font-semibold">
                    File {f.numero} · {f.destino}
                  </span>
                  <span className="block text-xs text-neutral-700 dark:text-neutral-300">
                    Sale el {dia(f.fechaSalida)}
                  </span>
                </Link>
              </td>
              <td className="px-3 py-3">
                <Pasajeros fila={f} alineado="derecha" />
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{formatearDinero(f.total)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatearDinero(f.pagado)}</td>
              <td className="px-3 py-3 text-right">
                <Saldo fila={f} />
              </td>
              <td className="px-4 py-3">
                <EtiquetaDeEstado estado={f.estadoDeCobro} />
                <span className="mt-1 block text-xs text-neutral-700 dark:text-neutral-300">
                  {ETIQUETA_SITUACION[f.situacion]} · plazo {dia(f.fechaLimite)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function CobrosContenido() {
  const { esDemo } = useModoDemo();
  const [filtro, setFiltro] = useState<FiltroDeCobro>('TODOS');
  const [carga, setCarga] = useState<Carga>({ tipo: 'cargando' });
  const [version, setVersion] = useState(0);

  const cargar = useCallback(
    async (senal: AbortSignal) => {
      setCarga({ tipo: 'cargando' });
      try {
        const vista = await listarCobros(filtro === 'TODOS' ? undefined : filtro, senal);
        if (!senal.aborted) setCarga({ tipo: 'listo', vista });
      } catch (e) {
        if (senal.aborted) return;
        setCarga({
          tipo: 'error',
          error: {
            titulo: 'No se pudieron cargar los cobros',
            quePaso: e instanceof Error ? e.message : 'Error desconocido.',
            queHacer:
              'Reintenta en unos segundos. Si sigue fallando, revisa tu conexión o avisa a soporte.',
            esReintentable: true,
          },
        });
      }
    },
    [filtro],
  );

  useEffect(() => {
    const control = new AbortController();
    void cargar(control.signal);
    return () => control.abort();
    // `version` fuerza el reintento desde el botón; `esDemo` cambia la fuente de datos.
  }, [cargar, esDemo, version]);

  const filas = carga.tipo === 'listo' ? carga.vista.datos : [];

  /** El CSV es lo que se ve: las mismas filas, en el mismo orden, con el filtro vigente. */
  const exportar = () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const sufijo = filtro === 'TODOS' ? '' : `-${filtro.toLowerCase().replaceAll('_', '-')}`;
    descargarArchivoCSV(exportarCobrosCSV(filas), `cobros-viajapro${sufijo}-${hoy}.csv`);
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
      <header className="space-y-3 border-b border-neutral-200 bg-white px-4 py-4 md:px-6 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5" aria-hidden="true" />
            <TituloDePantalla modulo="cobros" className="text-base font-bold" />
            <DistintivoDatosDemo />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportar}
              disabled={filas.length === 0}
              data-testid="boton-exportar-cobros-csv"
              className="focus-visible:ring-acento-600 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-100 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={() => setVersion((v) => v + 1)}
              aria-label="Actualizar cobros"
              className="focus-visible:ring-acento-600 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl hover:bg-neutral-100 focus-visible:ring-2 focus-visible:outline-none dark:hover:bg-neutral-800"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <p className="text-xs text-neutral-700 dark:text-neutral-300">
          Archivos de viaje abiertos: lo que cuesta cada uno, lo que ya pagó el viajero y lo que
          falta.
        </p>
        <div role="group" aria-label="Filtrar por estado de cobro" className="flex flex-wrap gap-1">
          {FILTROS.map(({ valor, etiqueta }) => (
            <button
              key={valor}
              type="button"
              aria-pressed={filtro === valor}
              onClick={() => setFiltro(valor)}
              className={`focus-visible:ring-acento-600 min-h-[44px] rounded-lg px-3 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none ${
                filtro === valor
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                  : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {carga.tipo === 'cargando' && <EsqueletoTabla filas={6} />}
        {carga.tipo === 'error' && (
          <AvisoErrorAccionable error={carga.error} onReintentar={() => setVersion((v) => v + 1)} />
        )}
        {carga.tipo === 'listo' && (
          <>
            {carga.vista.totales.length > 0 && (
              <ul
                aria-label="Totales por moneda"
                className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {carga.vista.totales.map((t) => (
                  <li
                    key={t.moneda}
                    data-testid={`totales-${t.moneda}`}
                    className="rounded-xl border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      Por cobrar en {t.moneda} · {t.archivos}{' '}
                      {t.archivos === 1 ? 'archivo' : 'archivos'}
                    </p>
                    <p className="text-lg font-bold tabular-nums">{formatearDinero(t.porCobrar)}</p>
                    <p className="text-xs text-neutral-700 tabular-nums dark:text-neutral-300">
                      de {formatearDinero(t.total)} · pagado {formatearDinero(t.pagado)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {carga.vista.truncado && (
              <p role="note" className="text-aviso-700 px-4 text-xs">
                Hay más archivos abiertos de los que caben en esta vista: las cifras pueden estar
                incompletas.
              </p>
            )}
            {filas.length === 0 ? (
              <div
                role="status"
                data-testid="cobros-vacio"
                className="p-8 text-center text-sm text-neutral-700 dark:text-neutral-300"
              >
                <p className="font-semibold">
                  {filtro === 'TODOS'
                    ? 'Todavía no hay archivos de viaje abiertos.'
                    : `Ningún archivo está en «${ETIQUETA_ESTADO_DE_COBRO[filtro]}».`}
                </p>
                <p className="mt-1">
                  {filtro === 'TODOS'
                    ? 'Un archivo nace cuando se acepta una cotización; aquí verás lo que falta cobrar.'
                    : 'Cambia el filtro para ver el resto.'}
                </p>
                {filtro !== 'TODOS' && (
                  <button
                    type="button"
                    onClick={() => setFiltro('TODOS')}
                    className="focus-visible:ring-acento-600 mt-3 inline-flex min-h-[44px] items-center rounded-xl border border-neutral-300 px-4 font-medium focus-visible:ring-2 focus-visible:outline-none dark:border-neutral-700"
                  >
                    Ver todos
                  </button>
                )}
              </div>
            ) : (
              <TablaDeCobros filas={filas} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Sin `cobro.ver` la API respondería 403: se explica sin llamarla. Solo oculta; autoriza el servidor. */
function SinAcceso() {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-center bg-neutral-50 p-6 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div role="status" data-testid="cobros-sin-acceso" className="max-w-md space-y-3 text-center">
        <Lock className="mx-auto h-8 w-8 text-neutral-500" aria-hidden="true" />
        <h1 className="text-base font-bold">No tienes acceso a los cobros</h1>
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          Tu rol no incluye el permiso «Ver cobros». Pide a quien administra la agencia que te lo
          asigne desde Configuración.
        </p>
        <Link
          href="/viajes"
          className="focus-visible:ring-acento-600 inline-flex min-h-[44px] items-center rounded-xl border border-neutral-300 px-4 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none dark:border-neutral-700"
        >
          Ir a archivos de viaje
        </Link>
      </div>
    </div>
  );
}

export default function CobrosPage() {
  const { cargando, tienePermiso } = usePermisos();
  if (cargando) {
    return <div aria-busy="true" aria-label="Cargando permisos" className="min-h-64 flex-1" />;
  }
  if (!tienePermiso(PERMISO_COBRO_VER)) return <SinAcceso />;
  return <CobrosContenido />;
}
