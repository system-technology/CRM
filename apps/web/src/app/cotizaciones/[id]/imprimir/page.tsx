'use client';

/**
 * Vista imprimible y compartible de la cotización en formato A4 (/cotizaciones/[id]/imprimir) — T-114.
 *
 * Reglas de dominio y confidencialidad (R10 / ADR-0011):
 * - Esta vista es el documento de cara al viajero: JAMÁS expone tarifa neta del mayorista (`neto`),
 *   margen de agencia (`margen`) ni parámetros internos de la política de precios (`politica`).
 * - La función pura `proyectarVersionParaVistaCliente` filtra explícitamente cualquier campo de costo
 *   o comisión antes de pintar el documento, incluso si el objeto proviene de una sesión con rol Dueño.
 * - Incluye estilos de impresión A4 (`print:p-0`, `print:shadow-none`, `@page { size: A4 }`) y botón
 *   «Imprimir o guardar PDF» que invoca `window.print()`.
 */

import React, { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  MapPin,
  Plane,
  Printer,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type {
  Contacto,
  CotizacionGuardada,
  Dinero,
  VersionDeCotizacion,
} from '@viajapro/contracts';
import { formatearDinero, formatearFecha, formatearTelefono } from '../../../../lib/formato';
import { obtenerCotizacionGuardadaApi } from '../../../../lib/cotizaciones-api';
import {
  interpretarErrorCotizaciones,
  obtenerUltimaVersion,
  ordenarVersiones,
} from '../../../../lib/cotizaciones-logica';
import { listarContactos } from '../../../../lib/crm-api';
import { MOCK_CONFIGURACION_AGENCIA } from '../../../../lib/mock-configuracion';

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
  paqueteNombre: string;
  destino: string;
  noches: number;
  fechaSalida: string;
  vigenciaDesde: string;
  vigenciaHasta: string;
  adultos: number;
  ninos: number;
  infantes: number;
  acomodacion: string | null;
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

export interface PaginaImprimirCotizacionProps {
  params?: Promise<{ id: string }>;
  /** Permite inyectar una cotización en pruebas unitarias sin depender de carga asíncrona. */
  cotizacionInicial?: CotizacionGuardada;
  contactoInicial?: Contacto | null;
}

export default function PaginaImprimirCotizacion({
  params: paramsPromise,
  cotizacionInicial,
  contactoInicial,
}: PaginaImprimirCotizacionProps) {
  const routerParams = useParams();
  const idFromParams = routerParams?.['id'] as string | undefined;

  let idFromProps: string | undefined;
  if (paramsPromise) {
    try {
      const unwrapped = use(paramsPromise);
      idFromProps = unwrapped.id;
    } catch {
      // Ignorar si no es desenvuelto en entorno de prueba
    }
  }

  const id =
    cotizacionInicial?.id ?? idFromProps ?? idFromParams ?? '01932000-0000-7000-8000-000000000077';

  const [cotizacion, setCotizacion] = useState<CotizacionGuardada | null>(
    cotizacionInicial ?? null,
  );
  const [contacto, setContacto] = useState<Contacto | null>(contactoInicial ?? null);
  const [cargando, setCargando] = useState<boolean>(!cotizacionInicial);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [versionNumero, setVersionNumero] = useState<number>(() => {
    const ultima = cotizacionInicial ? obtenerUltimaVersion(cotizacionInicial.versiones) : null;
    return ultima?.numero ?? 1;
  });

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
        <div className="mx-auto max-w-[210mm] animate-pulse space-y-6 rounded-2xl bg-white p-10 shadow-sm dark:bg-neutral-900">
          <div className="h-8 w-1/2 rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-4 w-1/3 rounded bg-neutral-100 dark:bg-neutral-800" />
          <div className="h-40 w-full rounded-xl bg-neutral-100 dark:bg-neutral-800" />
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
        <div className="max-w-md space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <h1 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
            No pudimos cargar la vista imprimible
          </h1>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            {errorCarga || 'La cotización solicitada no existe o no tiene versiones disponibles.'}
          </p>
          <Link
            href={`/cotizaciones/${id}`}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Volver a la cotización</span>
          </Link>
        </div>
      </div>
    );
  }

  const diasTotales = vistaCliente.noches + 1;
  const fechaVigenciaTexto = vistaCliente.vigenteHasta
    ? formatearFecha(vistaCliente.vigenteHasta)
    : formatearFecha(vistaCliente.vigenciaHasta);

  return (
    <div className="min-h-screen bg-neutral-100 pb-12 font-sans dark:bg-neutral-950 print:min-h-0 print:bg-white print:pb-0">
      {/* Reglas de página A4 para impresión nativa del navegador */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 14mm;
          }
          body {
            background: #ffffff !important;
            color: #111827 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      {/* Barra de herramientas superior (Oculta al imprimir) */}
      <header
        data-testid="barra-acciones-impresion"
        className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur-xs dark:border-neutral-800 dark:bg-neutral-900/95 print:hidden"
      >
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href={`/cotizaciones/${cotizacion.id}`}
              data-testid="enlace-volver-cotizacion"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Volver a la cotización</span>
            </Link>

            {versionesOrdenadas.length > 1 && (
              <div
                className="flex items-center gap-1.5"
                role="group"
                aria-label="Seleccionar versión para imprimir"
              >
                {versionesOrdenadas.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVersionNumero(v.numero)}
                    className={`min-h-[44px] rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                      v.numero === vistaCliente.numero
                        ? 'bg-blue-600 text-white'
                        : 'border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                    }`}
                  >
                    v{v.numero}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <span className="hidden items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 sm:inline-flex dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Vista de cliente (sin costos ni margen)</span>
            </span>

            <button
              type="button"
              data-testid="btn-imprimir-cotizacion"
              onClick={manejarImprimir}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              <span>Imprimir o guardar PDF</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hoja A4 de solo lectura para el viajero */}
      <main className="mx-auto mt-6 max-w-[210mm] px-4 print:mt-0 print:max-w-none print:px-0">
        <article
          data-testid="hoja-imprimible-a4"
          className="overflow-hidden rounded-2xl border border-neutral-200 bg-white text-neutral-900 shadow-sm print:rounded-none print:border-0 print:shadow-none"
        >
          {/* Franja superior con color de marca de la agencia */}
          <div
            className="h-3 w-full bg-gradient-to-r from-[#0B1F3A] via-[#2563EB] to-[#06B6D4]"
            aria-hidden="true"
          />

          <div className="space-y-6 p-6 sm:p-10 print:p-6">
            {/* 1. Cabecera: Marca de la agencia y referencia de la cotización */}
            <section
              data-testid="marca-agencia-cotizacion"
              className="flex flex-col justify-between gap-4 border-b border-neutral-200 pb-6 sm:flex-row sm:items-start"
            >
              <div className="flex items-start gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0B1F3A] text-white">
                  <Plane className="h-6 w-6 text-[#FACC15]" aria-hidden="true" />
                </div>
                <div>
                  <h1 className="text-lg font-black tracking-tight text-neutral-900">
                    {MOCK_CONFIGURACION_AGENCIA.nombreComercial}
                  </h1>
                  <p className="text-xs font-semibold text-neutral-600">
                    {MOCK_CONFIGURACION_AGENCIA.razonSocial} · NIT {MOCK_CONFIGURACION_AGENCIA.nit}
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-500">
                    {MOCK_CONFIGURACION_AGENCIA.direccion} · {MOCK_CONFIGURACION_AGENCIA.ciudad} ·
                    Atención: {formatearTelefono(MOCK_CONFIGURACION_AGENCIA.telefonoSoporte)}
                  </p>
                </div>
              </div>

              <div
                data-testid="vigencia-cotizacion"
                className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-left sm:text-right"
              >
                <span className="text-[10px] font-bold tracking-wider text-blue-700 uppercase">
                  Propuesta de Viaje · Versión {vistaCliente.numero}
                </span>
                <p className="mt-0.5 font-mono text-xs font-bold text-neutral-900">
                  REF-{cotizacion.id.slice(-8).toUpperCase()}-V{vistaCliente.numero}
                </p>
                <p className="mt-1 text-[11px] text-neutral-600">
                  Emitida: {formatearFecha(vistaCliente.creadaEn)}
                </p>
                <p className="mt-0.5 text-xs font-bold text-amber-800">
                  Vigente hasta: {fechaVigenciaTexto}
                </p>
              </div>
            </section>

            {/* 2. Título, viajero y resumen del viaje */}
            <section className="space-y-4">
              <div>
                <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-0.5 text-[11px] font-bold text-cyan-800">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  {vistaCliente.destino}
                </span>
                <h2 className="mt-1.5 text-xl font-black text-neutral-900">{cotizacion.titulo}</h2>
                <p className="text-xs font-medium text-neutral-600">
                  Programa: <strong>{vistaCliente.paqueteNombre}</strong>
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 text-xs sm:grid-cols-3">
                <div>
                  <span className="block text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                    Viajero titular
                  </span>
                  <p className="mt-0.5 font-bold text-neutral-900">
                    {contacto?.nombre || 'Viajero Invitado'}
                  </p>
                  {contacto?.telefono && (
                    <p className="text-[11px] text-neutral-600">
                      {formatearTelefono(contacto.telefono)}
                    </p>
                  )}
                </div>

                <div>
                  <span className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                    <Calendar className="h-3 w-3" aria-hidden="true" />
                    Salida y duración
                  </span>
                  <p className="mt-0.5 font-bold text-neutral-900">
                    {formatearFecha(vistaCliente.fechaSalida)}
                  </p>
                  <p className="text-[11px] text-neutral-600">
                    {diasTotales} {diasTotales === 1 ? 'día' : 'días'} / {vistaCliente.noches}{' '}
                    {vistaCliente.noches === 1 ? 'noche' : 'noches'}
                  </p>
                </div>

                <div>
                  <span className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                    <Users className="h-3 w-3" aria-hidden="true" />
                    Grupo y acomodación
                  </span>
                  <p className="mt-0.5 font-bold text-neutral-900">
                    {vistaCliente.adultos} adulto(s)
                    {vistaCliente.ninos > 0 ? `, ${vistaCliente.ninos} niño(s)` : ''}
                    {vistaCliente.infantes > 0 ? `, ${vistaCliente.infantes} infante(s)` : ''}
                  </p>
                  <p className="text-[11px] text-neutral-600">
                    Acomodación: {vistaCliente.acomodacion || 'Estándar'}
                  </p>
                </div>
              </div>
            </section>

            {/* 3. Desglose de tarifas al cliente (100% PVP, cero neto y cero margen) */}
            <section data-testid="desglose-tarifas-cliente" className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-xs font-extrabold tracking-wider text-neutral-800 uppercase">
                  <FileText className="h-4 w-4 text-blue-600" aria-hidden="true" />
                  <span>Desglose de tarifas por servicio</span>
                </h3>
                <span className="text-[11px] text-neutral-500">
                  Valores expresados en {vistaCliente.venta.moneda}
                </span>
              </div>

              <div className="overflow-hidden rounded-xl border border-neutral-200">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-100/80 text-[11px] font-bold text-neutral-700">
                      <th className="px-4 py-2.5">Concepto / Categoría de pasajero</th>
                      <th className="px-3 py-2.5 text-center">Cant.</th>
                      <th className="px-4 py-2.5 text-right">Precio unitario</th>
                      <th className="px-4 py-2.5 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {vistaCliente.lineas.map((linea, idx) => (
                      <tr key={`${linea.tarifaId}-${idx}`} className="bg-white">
                        <td className="px-4 py-3 font-medium text-neutral-900">{linea.nombre}</td>
                        <td className="cifra px-3 py-3 text-center text-neutral-700">
                          {linea.veces}
                        </td>
                        <td className="cifra px-4 py-3 text-right text-neutral-700">
                          {formatearDinero(linea.precioUnitario)}
                        </td>
                        <td className="cifra px-4 py-3 text-right font-bold text-neutral-900">
                          {formatearDinero(linea.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-neutral-300 bg-blue-50/70">
                      <td
                        colSpan={3}
                        className="px-4 py-3.5 text-right text-sm font-black text-neutral-900"
                      >
                        Total de la cotización
                      </td>
                      <td
                        data-testid="total-venta-cliente"
                        className="cifra px-4 py-3.5 text-right text-base font-black text-blue-700"
                      >
                        {formatearDinero(vistaCliente.venta)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            {/* 4. Vigencia y condiciones de la oferta */}
            <section
              data-testid="condiciones-cotizacion"
              className="grid grid-cols-1 gap-4 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 text-[11px] leading-relaxed text-neutral-600 sm:grid-cols-2"
            >
              <div className="space-y-1.5">
                <h4 className="flex items-center gap-1.5 text-xs font-bold text-neutral-900">
                  <Clock className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                  <span>Vigencia y reserva de cupos</span>
                </h4>
                <p>
                  • Las tarifas cotizadas están sujetas a disponibilidad de cupos al momento de la
                  reserva en firme y son válidas hasta el <strong>{fechaVigenciaTexto}</strong>.
                </p>
                <p>
                  • Los impuestos de muelle, tasas portuarias o tarjetas de ingreso en destino se
                  pagan directamente en el punto de embarque y no se suman al total de esta
                  cotización.
                </p>
              </div>

              <div className="space-y-1.5">
                <h4 className="flex items-center gap-1.5 text-xs font-bold text-neutral-900">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  <span>Condiciones comerciales y legales</span>
                </h4>
                <p>
                  • Para confirmar la salida se requiere el anticipo indicado por tu asesor y los
                  datos completos de cada pasajero (documento de identidad y fecha de nacimiento).
                </p>
                <p>
                  • En cumplimiento de la Ley 679 de 2001 y la Ley 1336 de 2009,{' '}
                  {MOCK_CONFIGURACION_AGENCIA.nombreComercial} rechaza la explotación y el abuso
                  sexual de menores de edad en el turismo.
                </p>
              </div>
            </section>
          </div>
        </article>
      </main>
    </div>
  );
}
