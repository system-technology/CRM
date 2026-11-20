'use client';

/**
 * Reservas (archivos de viaje) — T-243, ADR-0024 Fase 4. Reemplaza la maqueta de /viajes.
 *
 * La asesora ve qué reserva vence primero y con qué mayorista (semáforo de plazos), abre el
 * archivo para ver sus reservas por mayorista y sus pasajeros, avanza el estado de cada reserva
 * con los campos que exige el paso, edita pasajeros y cancela el archivo. Los rechazos del dominio
 * (409/422) se traducen a lenguaje claro. R3: tipos de `@viajapro/contracts`; R8: dinero con
 * `formatearDinero`; R9: horas en la zona de la agencia.
 *
 * Origen de datos: igual que el CRM (`estaUsandoApiReal`): API real por defecto, datos de
 * demostración solo si se pide (distintivo visible).
 */
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Briefcase, Lock, RefreshCw, Search } from 'lucide-react';
import type {
  ActualizarReserva,
  CancelarArchivo,
  DetalleDeArchivo,
  ReemplazarPasajeros,
  ResumenDeArchivo,
} from '@viajapro/contracts';
import { BarraModulos } from '../../../components/bandeja/barra-modulos';
import { DistintivoDatosDemo } from '../../../components/comun/distintivo-datos-demo';
import { AvisoErrorAccionable, EsqueletoTabla } from '../../../components/comun/esqueletos';
import { DetalleArchivo } from '../../../components/reservas/detalle-archivo';
import { ListaArchivos } from '../../../components/reservas/lista-archivos';
import {
  actualizarReserva,
  cancelarArchivo,
  listarArchivos,
  obtenerArchivo,
  reemplazarPasajeros,
} from '../../../lib/archivos-api';
import {
  filtrarArchivos,
  mensajeDeErrorDelArchivo,
  zonaOPorDefecto,
} from '../../../lib/archivos-logica';
import { obtenerAjustesAgenciaApi } from '../../../lib/agencia-api';
import { estaUsandoApiReal } from '../../../lib/crm-api';
import { useModoDemo } from '../../../lib/modo-demo';
import { PERMISO_ARCHIVO_OPERAR, PERMISO_ARCHIVO_VER, usePermisos } from '../../../lib/permisos';
import type { MensajeErrorDetallado } from '../../../lib/estados-ui-logica';

type FiltroEstado = 'ABIERTO' | 'CANCELADO' | 'TODOS';
type EstadoCarga<T> =
  | { tipo: 'cargando' }
  | { tipo: 'error'; error: MensajeErrorDetallado }
  | { tipo: 'listo'; datos: T };

function errorAccionable(e: unknown, titulo: string): MensajeErrorDetallado {
  return {
    titulo,
    quePaso: mensajeDeErrorDelArchivo(e),
    queHacer:
      'Reintenta en unos segundos. Si sigue fallando, revisa tu conexión o avisa a soporte.',
    esReintentable: true,
  };
}

function ReservasContenido({ puedeOperar }: { puedeOperar: boolean }) {
  const { esDemo } = useModoDemo();
  const router = useRouter();
  const searchParams = useSearchParams();
  const seleccionadoId = searchParams.get('id');

  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('ABIERTO');
  const [texto, setTexto] = useState('');
  const [lista, setLista] = useState<EstadoCarga<ResumenDeArchivo[]>>({ tipo: 'cargando' });
  const [detalle, setDetalle] = useState<EstadoCarga<DetalleDeArchivo>>({ tipo: 'cargando' });
  const [zona, setZona] = useState<string>(zonaOPorDefecto(null));
  const [version, setVersion] = useState(0);

  // Zona horaria de la agencia (R9): si no llega, se presenta en la zona por defecto.
  useEffect(() => {
    if (esDemo || !estaUsandoApiReal()) return;
    let activo = true;
    void obtenerAjustesAgenciaApi().then((a) => {
      if (activo) setZona(zonaOPorDefecto(a?.zonaHoraria));
    });
    return () => {
      activo = false;
    };
  }, [esDemo]);

  const cargarLista = useCallback(
    async (silencioso: boolean) => {
      if (!silencioso) setLista({ tipo: 'cargando' });
      try {
        setLista({ tipo: 'listo', datos: await listarArchivos(filtroEstado) });
      } catch (e) {
        setLista({
          tipo: 'error',
          error: errorAccionable(e, 'No se pudieron cargar las reservas'),
        });
      }
    },
    [filtroEstado],
  );

  useEffect(() => {
    void cargarLista(false);
    // `version` fuerza el reintento desde el botón.
  }, [cargarLista, esDemo, version]);

  useEffect(() => {
    if (!seleccionadoId) return;
    let activo = true;
    setDetalle({ tipo: 'cargando' });
    obtenerArchivo(seleccionadoId)
      .then((datos) => activo && setDetalle({ tipo: 'listo', datos }))
      .catch(
        (e: unknown) =>
          activo &&
          setDetalle({ tipo: 'error', error: errorAccionable(e, 'No se pudo abrir el archivo') }),
      );
    return () => {
      activo = false;
    };
  }, [seleccionadoId, esDemo, version]);

  const seleccionar = (id: string | null) =>
    router.replace(id ? `/viajes?id=${id}` : '/viajes', { scroll: false });

  const archivosFiltrados = useMemo(
    () => (lista.tipo === 'listo' ? filtrarArchivos(lista.datos, texto) : []),
    [lista, texto],
  );

  /** Aplica la respuesta de una mutación (el archivo ya actualizado) y refresca la lista. */
  const aplicar = async (operacion: Promise<DetalleDeArchivo>) => {
    const actualizado = await operacion;
    setDetalle({ tipo: 'listo', datos: actualizado });
    void cargarLista(true);
  };

  const mutaciones = (archivoId: string) => ({
    onActualizarReserva: (reservaId: string, cambio: ActualizarReserva) =>
      aplicar(actualizarReserva(archivoId, reservaId, cambio)),
    onReemplazarPasajeros: (cambio: ReemplazarPasajeros) =>
      aplicar(reemplazarPasajeros(archivoId, cambio)),
    onCancelarArchivo: (cancelacion: CancelarArchivo) =>
      aplicar(cancelarArchivo(archivoId, cancelacion)),
  });

  const hayDetalle = seleccionadoId !== null;

  return (
    <div className="flex min-h-screen bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
      <BarraModulos />

      <main className="flex min-w-0 flex-1 flex-col pb-28 md:pb-0 lg:h-screen lg:flex-row">
        {/* Lista: en móvil se oculta cuando hay un archivo abierto */}
        <section
          aria-labelledby="reservas-lista-titulo"
          className={`${hayDetalle ? 'hidden lg:flex' : 'flex'} w-full shrink-0 flex-col border-neutral-200 bg-white lg:h-full lg:w-96 lg:border-r dark:border-neutral-800 dark:bg-neutral-900`}
        >
          <div className="space-y-3 border-b border-neutral-200 p-4 dark:border-neutral-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" aria-hidden="true" />
                <h1 id="reservas-lista-titulo" className="text-base font-bold">
                  Reservas
                </h1>
                <DistintivoDatosDemo />
              </div>
              <button
                type="button"
                onClick={() => setVersion((v) => v + 1)}
                aria-label="Actualizar reservas"
                className="focus-visible:ring-acento-600 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl hover:bg-neutral-100 focus-visible:ring-2 focus-visible:outline-none dark:hover:bg-neutral-800"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Ordenadas por el plazo que vence primero.
            </p>

            <div className="relative">
              <Search
                className="absolute top-3.5 left-3 h-4 w-4 text-neutral-500"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Buscar por file, destino, paquete o mayorista"
                placeholder="Buscar file, destino o mayorista…"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                className="focus-visible:ring-acento-600 min-h-[44px] w-full rounded-lg border border-neutral-300 bg-white py-2 pr-3 pl-9 text-sm focus-visible:ring-2 focus-visible:outline-none dark:border-neutral-700 dark:bg-neutral-900"
              />
            </div>

            <div role="group" aria-label="Filtrar por estado" className="flex gap-1">
              {(
                [
                  ['ABIERTO', 'Abiertos'],
                  ['CANCELADO', 'Cancelados'],
                  ['TODOS', 'Todos'],
                ] as const
              ).map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  type="button"
                  aria-pressed={filtroEstado === valor}
                  onClick={() => setFiltroEstado(valor)}
                  className={`focus-visible:ring-acento-600 min-h-[44px] flex-1 rounded-lg px-2 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none ${
                    filtroEstado === valor
                      ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                      : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 lg:overflow-y-auto">
            {lista.tipo === 'cargando' && <EsqueletoTabla filas={6} />}
            {lista.tipo === 'error' && (
              <AvisoErrorAccionable
                error={lista.error}
                onReintentar={() => setVersion((v) => v + 1)}
              />
            )}
            {lista.tipo === 'listo' && lista.datos.length === 0 && (
              <div
                role="status"
                className="p-6 text-center text-xs text-neutral-700 dark:text-neutral-300"
              >
                <p className="font-semibold">
                  {filtroEstado === 'CANCELADO'
                    ? 'No hay archivos cancelados.'
                    : 'Todavía no hay archivos de viaje.'}
                </p>
                <p className="mt-1">
                  Un archivo nace cuando se acepta una cotización. Las reservas con cada mayorista
                  aparecen aquí con su plazo.
                </p>
                <Link
                  href="/cotizaciones"
                  className="focus-visible:ring-acento-600 mt-3 inline-flex min-h-[44px] items-center rounded-xl border border-neutral-300 px-4 font-medium focus-visible:ring-2 focus-visible:outline-none dark:border-neutral-700"
                >
                  Ir a cotizaciones
                </Link>
              </div>
            )}
            {lista.tipo === 'listo' && lista.datos.length > 0 && archivosFiltrados.length === 0 && (
              <p
                role="status"
                className="p-6 text-center text-xs text-neutral-700 dark:text-neutral-300"
              >
                Ningún archivo coincide con «{texto}».
              </p>
            )}
            {lista.tipo === 'listo' && archivosFiltrados.length > 0 && (
              <ListaArchivos
                archivos={archivosFiltrados}
                seleccionadoId={seleccionadoId}
                zona={zona}
                onSeleccionar={seleccionar}
              />
            )}
          </div>
        </section>

        {/* Detalle */}
        <section
          aria-label="Detalle del archivo de viaje"
          className={`${hayDetalle ? 'block' : 'hidden lg:block'} min-w-0 flex-1 lg:h-full lg:overflow-y-auto`}
        >
          {!hayDetalle && (
            <div className="flex h-full min-h-64 items-center justify-center p-8 text-center text-sm text-neutral-600 dark:text-neutral-400">
              Elige un archivo de la lista para ver sus reservas y pasajeros.
            </div>
          )}
          {hayDetalle && detalle.tipo === 'cargando' && (
            <div className="space-y-4 p-6" aria-busy="true" aria-label="Cargando archivo">
              <div className="esqueleto-brillo h-6 w-64 rounded" />
              <div className="esqueleto-brillo h-20 rounded-xl" />
              <div className="esqueleto-brillo h-40 rounded-xl" />
            </div>
          )}
          {hayDetalle && detalle.tipo === 'error' && (
            <AvisoErrorAccionable
              error={detalle.error}
              onReintentar={() => setVersion((v) => v + 1)}
              onAccionSecundaria={() => seleccionar(null)}
              etiquetaSecundaria="Volver a la lista"
            />
          )}
          {hayDetalle && detalle.tipo === 'listo' && (
            <DetalleArchivo
              key={detalle.datos.id}
              archivo={detalle.datos}
              zona={zona}
              puedeOperar={puedeOperar}
              onVolver={() => seleccionar(null)}
              {...mutaciones(detalle.datos.id)}
            />
          )}
        </section>
      </main>
    </div>
  );
}

/** Estado «sin acceso»: la API respondería 403 a todo /archivos sin `archivo.ver` (T-249). */
function SinAcceso() {
  return (
    <div className="flex min-h-screen bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
      <BarraModulos />
      <main className="flex min-w-0 flex-1 items-center justify-center p-6 pb-28 md:pb-6">
        <div
          role="status"
          data-testid="reservas-sin-acceso"
          className="max-w-md space-y-3 text-center"
        >
          <Lock className="mx-auto h-8 w-8 text-neutral-500" aria-hidden="true" />
          <h1 className="text-base font-bold">No tienes acceso a las reservas</h1>
          <p className="text-sm text-neutral-700 dark:text-neutral-300">
            Tu rol no incluye el permiso «Ver archivos de viaje». Pide a quien administra la agencia
            que te lo asigne desde Configuración, o vuelve a la bandeja.
          </p>
          <Link
            href="/bandeja"
            className="focus-visible:ring-acento-600 inline-flex min-h-[44px] items-center rounded-xl border border-neutral-300 px-4 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none dark:border-neutral-700"
          >
            Ir a la bandeja
          </Link>
        </div>
      </main>
    </div>
  );
}

/** Compuerta de permisos: sin `archivo.ver` no se pide nada a la API. */
function ReservasConPermisos() {
  const { cargando, tienePermiso } = usePermisos();
  if (cargando) {
    return <div aria-busy="true" aria-label="Cargando permisos" className="min-h-screen" />;
  }
  if (!tienePermiso(PERMISO_ARCHIVO_VER)) return <SinAcceso />;
  return <ReservasContenido puedeOperar={tienePermiso(PERMISO_ARCHIVO_OPERAR)} />;
}

export default function ReservasPage() {
  return (
    <Suspense fallback={<div aria-busy="true" className="min-h-screen" />}>
      <ReservasConPermisos />
    </Suspense>
  );
}
