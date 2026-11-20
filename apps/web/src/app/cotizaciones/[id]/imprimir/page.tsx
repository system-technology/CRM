'use client';

/**
 * Propuesta al viajero (/cotizaciones/[id]/imprimir) — T-114, rediseñada por la auditoría UX
 * 2026-11-20 (I3): la pieza que el cliente recibe por WhatsApp y reenvía a su familia.
 *
 * Reglas de dominio y confidencialidad (R10 / ADR-0011):
 * - Es el documento de cara al viajero: JAMÁS expone tarifa neta del mayorista (`neto`), margen de
 *   agencia (`margen`) ni parámetros internos de la política de precios (`politica`).
 * - `proyectarVersionParaVistaCliente` filtra cualquier campo de costo antes de pintar, incluso si
 *   el objeto viene de una sesión con rol Dueño. Del producto solo se leen campos públicos
 *   (`obtenerProductoParaPropuestaApi`).
 * - Nada se inventa: lo que el catálogo no guarda (hotel con nombre, vuelos con horario, imágenes)
 *   no aparece. Ver `lib/propuesta-viajero-logica.ts`.
 * - Estilos de impresión A4 y botón «Imprimir o guardar PDF» (`window.print()`).
 */

import React, { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  BedDouble,
  Bus,
  Check,
  Flag,
  HeartPulse,
  Minus,
  Plane,
  PlaneLanding,
  Printer,
  Sparkles,
  Sun,
  Wallet,
} from 'lucide-react';
import type {
  CargoEnDestino,
  ContactoDeLista,
  CotizacionGuardada,
  Dinero,
  VersionDeCotizacion,
} from '@viajapro/contracts';
import { formatearDinero, formatearFecha, formatearTelefono } from '../../../../lib/formato';
import { obtenerCotizacionGuardadaApi, estaUsandoApiReal } from '../../../../lib/cotizaciones-api';
import {
  interpretarErrorCotizaciones,
  obtenerUltimaVersion,
  ordenarVersiones,
} from '../../../../lib/cotizaciones-logica';
import { listarContactos } from '../../../../lib/crm-api';
import { MOCK_CONFIGURACION_AGENCIA } from '../../../../lib/mock-configuracion';
import { obtenerAjustesAgenciaApi } from '../../../../lib/agencia-api';
import {
  obtenerProductoParaPropuestaApi,
  type ProductoDePropuestaApi,
} from '../../../../lib/catalogo-api';
import {
  agruparInclusiones,
  construirItinerario,
  descripcionSinDias,
  diasDelViaje,
  ETIQUETA_HABITACION,
  ETIQUETA_PLAN,
  etiquetaDeTramo,
  referenciaDePropuesta,
  sumarDias,
  textoDuracion,
  textoViajeros,
  TITULO_GRUPO,
  type GrupoDeInclusion,
} from '../../../../lib/propuesta-viajero-logica';
import { LineaDeTiempo } from '../../../../components/propuesta/linea-de-tiempo';

/** Datos de la agencia que se imprimen. Lo opcional se omite si no existe: nunca se inventa. */
interface DatosAgenciaImpresion {
  nombre: string;
  razonSocial?: string;
  nit?: string;
  rnt?: string;
  direccion?: string;
  ciudad?: string;
  telefono?: string;
}

/** El mock de maqueta solo se usa con la API simulada; con la API real, solo el nombre de ajustes. */
function datosAgenciaMaqueta(): DatosAgenciaImpresion {
  return {
    nombre: MOCK_CONFIGURACION_AGENCIA.nombreComercial,
    razonSocial: MOCK_CONFIGURACION_AGENCIA.razonSocial,
    nit: MOCK_CONFIGURACION_AGENCIA.nit,
    ...(MOCK_CONFIGURACION_AGENCIA.rnt ? { rnt: MOCK_CONFIGURACION_AGENCIA.rnt } : {}),
    direccion: MOCK_CONFIGURACION_AGENCIA.direccion,
    ciudad: MOCK_CONFIGURACION_AGENCIA.ciudad,
    telefono: MOCK_CONFIGURACION_AGENCIA.telefonoSoporte,
  };
}

export interface LineaVistaCliente {
  tarifaId: string;
  nombre: string;
  veces: number;
  cubrePasajeros: number;
  precioUnitario: Dinero;
  total: Dinero;
}

export interface VersionVistaCliente {
  id: string;
  numero: number;
  creadaEn: string;
  paqueteId: string;
  paqueteNombre: string;
  destino: string;
  noches: number;
  fechaSalida: string;
  vigenciaDesde: string;
  vigenciaHasta: string;
  adultos: number;
  ninos: number;
  infantes: number;
  acomodacion: VersionDeCotizacion['acomodacion'];
  opcionDeSalidaId: string | null;
  lineas: LineaVistaCliente[];
  venta: Dinero;
  vigenteHasta: string | null;
}

/**
 * Proyecta una `VersionDeCotizacion` exclusivamente con los campos públicos para el viajero,
 * descartando de forma determinista `neto`, `margen` y `politica` (R10).
 */
export function proyectarVersionParaVistaCliente(
  version: VersionDeCotizacion,
): VersionVistaCliente {
  return {
    id: version.id,
    numero: version.numero,
    creadaEn: version.creadaEn,
    paqueteId: version.paqueteId,
    paqueteNombre: version.paqueteNombre,
    destino: version.destino,
    noches: version.noches,
    fechaSalida: version.fechaSalida,
    vigenciaDesde: version.vigenciaDesde,
    vigenciaHasta: version.vigenciaHasta,
    adultos: version.adultos,
    ninos: version.ninos,
    infantes: version.infantes,
    acomodacion: version.acomodacion ?? null,
    opcionDeSalidaId: version.opcionDeSalidaId ?? null,
    lineas: version.lineas.map((l) => ({
      tarifaId: l.tarifaId,
      nombre: l.nombre,
      veces: l.veces,
      cubrePasajeros: l.cubrePasajeros,
      precioUnitario: {
        unidades: l.precioUnitario.unidades,
        moneda: l.precioUnitario.moneda,
      },
      total: {
        unidades: l.total.unidades,
        moneda: l.total.moneda,
      },
    })),
    venta: {
      unidades: version.venta.unidades,
      moneda: version.venta.moneda,
    },
    vigenteHasta: version.vigenteHasta ?? null,
  };
}

const ICONO_GRUPO: Record<GrupoDeInclusion, React.ComponentType<{ className?: string }>> = {
  VUELOS: Plane,
  ALOJAMIENTO: BedDouble,
  TRASLADOS: Bus,
  ASISTENCIA: HeartPulse,
  OTROS: Sparkles,
};

const UNIDAD_DE_CARGO: Record<CargoEnDestino['unidad'], string> = {
  POR_PERSONA: 'por persona',
  POR_GRUPO: 'por grupo',
};

export interface PaginaImprimirCotizacionProps {
  params?: Promise<{ id: string }>;
  /** Permite inyectar una cotización en pruebas unitarias sin depender de carga asíncrona. */
  cotizacionInicial?: CotizacionGuardada;
  contactoInicial?: ContactoDeLista | null;
  /** Permite inyectar el producto en pruebas; `null` = el detalle no cargó. */
  productoInicial?: ProductoDePropuestaApi | null;
}

export default function PaginaImprimirCotizacion({
  params: paramsPromise,
  cotizacionInicial,
  contactoInicial,
  productoInicial,
}: PaginaImprimirCotizacionProps) {
  const routerParams = useParams();
  const idFromParams = routerParams?.['id'] as string | undefined;

  // `use` puede llamarse de forma condicional, pero no dentro de un try/catch (React lo prohíbe).
  const idFromProps = paramsPromise ? use(paramsPromise).id : undefined;

  const id =
    cotizacionInicial?.id ?? idFromProps ?? idFromParams ?? '01932000-0000-7000-8000-000000000077';

  const [cotizacion, setCotizacion] = useState<CotizacionGuardada | null>(
    cotizacionInicial ?? null,
  );
  const [contacto, setContacto] = useState<ContactoDeLista | null>(contactoInicial ?? null);
  const [cargando, setCargando] = useState<boolean>(!cotizacionInicial);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [agencia, setAgencia] = useState<DatosAgenciaImpresion | null>(() =>
    estaUsandoApiReal() ? null : datosAgenciaMaqueta(),
  );
  const [versionNumero, setVersionNumero] = useState<number>(() => {
    const ultima = cotizacionInicial ? obtenerUltimaVersion(cotizacionInicial.versiones) : null;
    return ultima?.numero ?? 1;
  });
  const [productos, setProductos] = useState<Record<string, ProductoDePropuestaApi | null>>({});

  useEffect(() => {
    if (!estaUsandoApiReal()) return;
    const control = new AbortController();
    void obtenerAjustesAgenciaApi(control.signal).then((ajustes) => {
      if (ajustes) setAgencia({ nombre: ajustes.nombre });
    });
    return () => control.abort();
  }, []);

  useEffect(() => {
    if (cotizacionInicial) {
      setCotizacion(cotizacionInicial);
      const ultima = obtenerUltimaVersion(cotizacionInicial.versiones);
      if (ultima) setVersionNumero(ultima.numero);
      setCargando(false);
      return;
    }

    setCargando(true);
    setErrorCarga(null);

    obtenerCotizacionGuardadaApi(id)
      .then((data) => {
        setCotizacion(data);
        const ultima = obtenerUltimaVersion(data.versiones);
        if (ultima) {
          setVersionNumero(ultima.numero);
        }
        listarContactos()
          .then((pagina) => {
            const encontrado = pagina.datos.find((c) => c.id === data.contactoId);
            if (encontrado) setContacto(encontrado);
          })
          .catch(() => {});
      })
      .catch((err: unknown) => {
        setErrorCarga(interpretarErrorCotizaciones(err).mensaje);
      })
      .finally(() => {
        setCargando(false);
      });
  }, [id, cotizacionInicial]);

  const versionesOrdenadas = useMemo(() => {
    if (!cotizacion) return [];
    return ordenarVersiones(cotizacion.versiones, 'asc');
  }, [cotizacion]);

  const versionSeleccionada = useMemo(() => {
    if (!cotizacion) return null;
    return (
      cotizacion.versiones.find((v) => v.numero === versionNumero) ??
      obtenerUltimaVersion(cotizacion.versiones) ??
      null
    );
  }, [cotizacion, versionNumero]);

  const vistaCliente = useMemo(() => {
    if (!versionSeleccionada) return null;
    return proyectarVersionParaVistaCliente(versionSeleccionada);
  }, [versionSeleccionada]);

  // El producto de la versión elegida (cada versión puede cotizar otro paquete).
  const paqueteId = vistaCliente?.paqueteId ?? null;
  useEffect(() => {
    if (!paqueteId || productoInicial !== undefined || paqueteId in productos) return;
    let vigente = true;
    void obtenerProductoParaPropuestaApi(paqueteId).then((p) => {
      if (vigente) setProductos((prev) => ({ ...prev, [paqueteId]: p }));
    });
    return () => {
      vigente = false;
    };
  }, [paqueteId, productoInicial, productos]);

  const producto: ProductoDePropuestaApi | null =
    productoInicial !== undefined
      ? productoInicial
      : paqueteId
        ? (productos[paqueteId] ?? null)
        : null;

  const manejarImprimir = () => {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  };

  if (cargando) {
    return (
      <div
        data-testid="estado-cargando-impresion"
        className="min-h-screen bg-neutral-100 p-6 dark:bg-neutral-950"
      >
        <div className="mx-auto max-w-[210mm] animate-pulse space-y-6 rounded-xl bg-white p-10 shadow-sm dark:bg-neutral-900">
          <div className="h-40 w-full rounded-lg bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-4 w-1/3 rounded bg-neutral-100 dark:bg-neutral-800" />
          <div className="h-40 w-full rounded-lg bg-neutral-100 dark:bg-neutral-800" />
        </div>
      </div>
    );
  }

  if (errorCarga || !cotizacion || !vistaCliente) {
    return (
      <div
        role="alert"
        data-testid="estado-error-impresion"
        className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 text-center dark:bg-neutral-950"
      >
        <div className="max-w-md space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <h1 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
            No se pudo abrir la propuesta
          </h1>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            {errorCarga || 'La cotización no existe o no tiene versiones.'} Vuelve a la cotización y
            ábrela de nuevo.
          </p>
          <Link
            href={`/cotizaciones/${id}`}
            className="bg-acento-600 hover:bg-acento-700 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Volver a la cotización</span>
          </Link>
        </div>
      </div>
    );
  }

  const dias = diasDelViaje(vistaCliente.noches, producto);
  const fechaRegreso = sumarDias(vistaCliente.fechaSalida, dias - 1);
  const fechaVigencia = vistaCliente.vigenteHasta ?? vistaCliente.vigenciaHasta;
  const viajeros = textoViajeros(vistaCliente.adultos, vistaCliente.ninos, vistaCliente.infantes);
  const plan = producto?.planAlimentacion ? ETIQUETA_PLAN[producto.planAlimentacion] : null;
  const habitacion = vistaCliente.acomodacion
    ? ETIQUETA_HABITACION[vistaCliente.acomodacion]
    : null;
  const opcionDeSalida =
    producto?.opcionesDeSalida?.find((o) => o.id === vistaCliente.opcionDeSalidaId) ?? null;
  const itinerario = construirItinerario({
    fechaSalida: vistaCliente.fechaSalida,
    dias,
    destino: vistaCliente.destino,
    planAlimentacion: producto?.planAlimentacion,
    inclusiones: producto?.inclusiones,
    descripcion: producto?.descripcion,
    opcionDeSalida,
  });
  const gruposIncluye = agruparInclusiones(producto?.inclusiones ?? []);
  const exclusiones = (producto?.exclusiones ?? []).filter((e) => e.trim());
  const cargosEnDestino = producto?.cargosEnDestino ?? [];
  const introduccion = descripcionSinDias(producto?.descripcion);
  const nombreAgencia = agencia?.nombre ?? '';
  const titular = contacto?.nombre ?? null;

  const lineaLegal = [
    agencia?.razonSocial,
    agencia?.nit ? `NIT ${agencia.nit}` : null,
    agencia?.rnt ? `RNT ${agencia.rnt}` : null,
  ].filter(Boolean);
  const lineaContacto = [
    agencia?.direccion,
    agencia?.ciudad,
    agencia?.telefono ? formatearTelefono(agencia.telefono) : null,
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-neutral-100 pb-12 font-sans dark:bg-neutral-950 print:min-h-0 print:bg-white print:pb-0">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm 12mm; }
          body {
            background: #ffffff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      {/* Barra de la asesora (no se imprime) */}
      <header
        data-testid="barra-acciones-impresion"
        className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur-xs dark:border-neutral-800 dark:bg-neutral-900/95 print:hidden"
      >
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/cotizaciones/${cotizacion.id}`}
              data-testid="enlace-volver-cotizacion"
              className="focus-visible:ring-acento-500 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 focus-visible:ring-2 focus-visible:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Volver a la cotización</span>
            </Link>

            {versionesOrdenadas.length > 1 && (
              <div
                className="flex items-center gap-1.5"
                role="group"
                aria-label="Versión que se imprime"
              >
                {versionesOrdenadas.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVersionNumero(v.numero)}
                    aria-pressed={v.numero === vistaCliente.numero}
                    className={`focus-visible:ring-acento-500 min-h-[44px] rounded-lg px-3 py-1.5 text-xs font-bold transition focus-visible:ring-2 focus-visible:outline-none ${
                      v.numero === vistaCliente.numero
                        ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                        : 'border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                    }`}
                  >
                    Versión {v.numero}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-[11px] text-neutral-500 md:inline dark:text-neutral-400">
              Así la ve el viajero: sin costos ni margen
            </span>
            <button
              type="button"
              data-testid="btn-imprimir-cotizacion"
              onClick={manejarImprimir}
              className="bg-acento-600 hover:bg-acento-700 focus-visible:ring-acento-500 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold text-white shadow-xs transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              <span>Imprimir o guardar PDF</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-6 max-w-[210mm] px-4 print:mt-0 print:max-w-none print:px-0">
        <article
          data-testid="hoja-imprimible-a4"
          className="overflow-hidden rounded-xl bg-white text-neutral-900 shadow-sm print:rounded-none print:shadow-none"
        >
          {/* 1. Portada: un pase de abordar con el viaje */}
          <section
            data-testid="marca-agencia-cotizacion"
            className="bg-oceano-900 grid break-inside-avoid text-white sm:grid-cols-[1fr_13rem]"
          >
            <div className="flex flex-col gap-6 p-6 sm:p-8">
              <div className="flex items-baseline justify-between gap-4 text-xs">
                <p className="text-sm font-bold">{nombreAgencia}</p>
                <p className="text-right text-white/70">Propuesta de viaje</p>
              </div>

              <div>
                <h1 className="text-4xl leading-[0.95] font-black tracking-tight break-words sm:text-6xl">
                  {vistaCliente.destino}
                </h1>
                <p className="mt-3 max-w-[52ch] text-sm text-white/80">
                  {vistaCliente.paqueteNombre}
                </p>
              </div>

              <div className="bg-dorado-500 h-px w-full" aria-hidden="true" />

              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm md:grid-cols-4 print:grid-cols-2">
                <div>
                  <dt className="text-[11px] text-white/60">Salida</dt>
                  <dd className="mt-0.5 font-semibold">
                    {formatearFecha(vistaCliente.fechaSalida)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-white/60">Regreso</dt>
                  <dd className="mt-0.5 font-semibold">{formatearFecha(fechaRegreso)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-white/60">Duración</dt>
                  <dd className="mt-0.5 font-semibold">
                    {textoDuracion(dias, vistaCliente.noches)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-white/60">Viajeros</dt>
                  <dd className="mt-0.5 font-semibold">{viajeros}</dd>
                </div>
              </dl>
            </div>

            {/* Talón */}
            <div
              data-testid="vigencia-cotizacion"
              className="bg-oceano-800 flex flex-col justify-between gap-4 border-t-2 border-dashed border-white/25 p-6 text-sm sm:border-t-0 sm:border-l-2 sm:p-8"
            >
              <div>
                <p className="text-[11px] text-white/60">Preparada para</p>
                <p className="mt-0.5 font-semibold">{titular ?? 'Tu grupo de viaje'}</p>
              </div>
              {(habitacion || plan) && (
                <div>
                  <p className="text-[11px] text-white/60">Habitación y plan</p>
                  {habitacion && <p className="mt-0.5 font-semibold">{habitacion}</p>}
                  {plan && <p className="font-semibold">{plan}</p>}
                </div>
              )}
              <div>
                <p className="text-[11px] text-white/60">Precio vigente hasta</p>
                <p className="text-arena-200 mt-0.5 font-semibold">
                  {formatearFecha(fechaVigencia)}
                </p>
              </div>
              <p className="text-[11px] text-white/60">
                Versión {vistaCliente.numero}
                <br />
                Referencia{' '}
                <span className="cifra whitespace-nowrap">
                  {referenciaDePropuesta(cotizacion.id, vistaCliente.numero)}
                </span>
              </p>
            </div>
          </section>

          <div className="space-y-8 p-6 sm:p-8 print:px-2">
            {introduccion && (
              <p className="max-w-[68ch] text-[15px] leading-relaxed whitespace-pre-line text-neutral-700">
                {introduccion}
              </p>
            )}

            {/* 2. Itinerario e incluye */}
            <div className="grid gap-8 sm:grid-cols-[1.15fr_1fr]">
              <section data-testid="itinerario-propuesta" aria-labelledby="titulo-itinerario">
                <h2 id="titulo-itinerario" className="text-oceano-900 mb-4 text-lg font-bold">
                  Tu viaje, día a día
                </h2>
                <LineaDeTiempo
                  tramos={itinerario.map((d) => ({
                    clave: `${d.desde}-${d.hasta}`,
                    etiqueta:
                      d.desde === d.hasta
                        ? `${etiquetaDeTramo(d)} · ${formatearFecha(d.fecha)}`
                        : `${etiquetaDeTramo(d)} · ${formatearFecha(d.fecha, { estilo: 'dia-mes' })} al ${formatearFecha(d.fechaHasta, { estilo: 'dia-mes' })}`,
                    destacado: d.tipo === 'SALIDA' || d.tipo === 'REGRESO',
                    marcador:
                      d.tipo === 'SALIDA' ? (
                        <Plane aria-hidden="true" />
                      ) : d.tipo === 'REGRESO' ? (
                        <PlaneLanding aria-hidden="true" />
                      ) : d.tipo === 'ESTADIA' ? (
                        <Sun aria-hidden="true" />
                      ) : (
                        d.desde
                      ),
                    contenido: (
                      <>
                        <p className="font-semibold text-neutral-900">{d.titulo}</p>
                        {d.detalle.map((linea) => (
                          <p key={linea} className="text-neutral-600">
                            {linea}
                          </p>
                        ))}
                      </>
                    ),
                  }))}
                />
              </section>

              {gruposIncluye.length > 0 && (
                <section data-testid="incluye-propuesta" aria-labelledby="titulo-incluye">
                  <h2 id="titulo-incluye" className="text-oceano-900 mb-4 text-lg font-bold">
                    Incluye
                  </h2>
                  <div className="space-y-4">
                    {gruposIncluye.map(({ grupo, items }) => {
                      const Icono = ICONO_GRUPO[grupo];
                      return (
                        <div key={grupo} className="break-inside-avoid">
                          <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                            <Icono className="text-turquesa-700 h-4 w-4" aria-hidden="true" />
                            {TITULO_GRUPO[grupo]}
                          </h3>
                          <ul className="mt-1.5 space-y-1 pl-6 text-sm text-neutral-700">
                            {items.map((item) => (
                              <li key={item} className="flex gap-2">
                                <Check
                                  className="text-turquesa-700 mt-1 h-3.5 w-3.5 shrink-0"
                                  aria-hidden="true"
                                />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>

            {/* 3. Lo que no incluye y lo que se paga allá */}
            {(exclusiones.length > 0 || cargosEnDestino.length > 0) && (
              <section
                data-testid="no-incluye-propuesta"
                className="grid break-inside-avoid gap-6 rounded-lg bg-neutral-50 p-5 sm:grid-cols-2"
              >
                {exclusiones.length > 0 && (
                  <div>
                    <h2 className="text-sm font-bold text-neutral-900">No incluye</h2>
                    <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                      {exclusiones.map((e) => (
                        <li key={e} className="flex gap-2">
                          <Minus
                            className="mt-1 h-3.5 w-3.5 shrink-0 text-neutral-400"
                            aria-hidden="true"
                          />
                          <span>{e}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {cargosEnDestino.length > 0 && (
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-bold text-neutral-900">
                      <Wallet className="text-atardecer-700 h-4 w-4" aria-hidden="true" />
                      Se paga en destino
                    </h2>
                    <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                      {cargosEnDestino.map((c) => (
                        <li key={c.concepto} className="flex justify-between gap-3">
                          <span>{c.concepto}</span>
                          <span className="cifra shrink-0 text-right text-neutral-900">
                            {c.monto
                              ? `${formatearDinero(c.monto)} ${UNIDAD_DE_CARGO[c.unidad]}`
                              : 'Monto por confirmar'}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-neutral-500">
                      No está sumado al valor de esta propuesta.
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* 4. Inversión */}
            <section
              data-testid="desglose-tarifas-cliente"
              aria-labelledby="titulo-inversion"
              className="break-inside-avoid"
            >
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 id="titulo-inversion" className="text-oceano-900 text-lg font-bold">
                  Valor del viaje
                </h2>
                <span className="text-xs text-neutral-500">
                  Valores en {vistaCliente.venta.moneda}
                </span>
              </div>
              <ul className="divide-y divide-neutral-200 border-y border-neutral-200 text-sm">
                {vistaCliente.lineas.map((linea, idx) => (
                  <li
                    key={`${linea.tarifaId}-${idx}`}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5"
                  >
                    <span className="min-w-0 flex-1 text-neutral-900">{linea.nombre}</span>
                    <span className="cifra text-xs text-neutral-500">
                      {linea.veces} × {formatearDinero(linea.precioUnitario)}
                    </span>
                    <span className="cifra w-full text-right font-semibold text-neutral-900 sm:w-36">
                      {formatearDinero(linea.total)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                <p className="text-sm text-neutral-600">Total para {viajeros}</p>
                <p
                  data-testid="total-venta-cliente"
                  className="cifra text-oceano-900 text-3xl font-black tracking-tight"
                >
                  {formatearDinero(vistaCliente.venta)}
                </p>
              </div>
            </section>

            {/* 5. Condiciones y datos legales de la agencia */}
            <section
              data-testid="condiciones-cotizacion"
              className="break-inside-avoid space-y-3 border-t border-neutral-200 pt-5 text-xs leading-relaxed text-neutral-600"
            >
              <h2 className="flex items-center gap-2 text-sm font-bold text-neutral-900">
                <Flag className="h-4 w-4 text-neutral-500" aria-hidden="true" />
                Para reservar
              </h2>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  Precio válido hasta el <strong>{formatearFecha(fechaVigencia)}</strong>, sujeto a
                  disponibilidad de cupos al confirmar la reserva.
                </li>
                <li>
                  Para confirmar se necesita el anticipo que te indique tu asesor y los datos de
                  cada viajero: documento de identidad y fecha de nacimiento.
                </li>
                <li>
                  En cumplimiento de la Ley 679 de 2001 y la Ley 1336 de 2009,{' '}
                  {nombreAgencia || 'la agencia'} rechaza la explotación y el abuso sexual de
                  menores de edad en el turismo.
                </li>
              </ul>
              {(lineaLegal.length > 0 || lineaContacto.length > 0) && (
                <div className="pt-2 text-[11px] text-neutral-500">
                  {lineaLegal.length > 0 && (
                    <p
                      data-testid="datos-legales-agencia"
                      className="font-semibold text-neutral-700"
                    >
                      {lineaLegal.join(' · ')}
                    </p>
                  )}
                  {lineaContacto.length > 0 && <p>{lineaContacto.join(' · ')}</p>}
                </div>
              )}
            </section>
          </div>
        </article>
      </main>
    </div>
  );
}
