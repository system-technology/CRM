'use client';

/**
 * Cotizador de paquetes — Módulo Comercial
 *
 * Objetivo: de conversación a propuesta comercial enviada en menos de cinco minutos.
 * Cumple con R3 (@viajapro/contracts: CotizarPaquete, CotizacionCalculada, Paquete).
 */

import React, { Suspense, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Calculator,
  Compass,
  Copy,
  Check,
  MessageSquare,
  Printer,
  Calendar,
  Users,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import type { Acomodacion, CotizacionCalculada, Paquete } from '@viajapro/contracts';
import { api, ErrorApi, formatearDinero } from '../../lib/api';
import { BarraModulos } from '../../components/bandeja/barra-modulos';
import { DistintivoDatosDemo } from '../../components/comun/distintivo-datos-demo';
import { MOCK_PAQUETES_CATALOGO } from '../../lib/mock-catalogo';
import { calcularCotizacionMock, generarTextoPropuestaWhatsApp } from '../../lib/cotizador-logica';

const ACOMODACIONES: Acomodacion[] = ['SENCILLA', 'DOBLE', 'TRIPLE', 'CUADRUPLE'];

function ContenidoCotizador() {
  const searchParams = useSearchParams();
  const paqueteParam = searchParams.get('paqueteId');

  const [paquetes, setPaquetes] = useState<Paquete[] | null>(null);
  const [paqueteId, setPaqueteId] = useState(paqueteParam ?? '');
  const [fechaSalida, setFechaSalida] = useState('2027-12-18');
  const [adultos, setAdultos] = useState(2);
  const [ninos, setNinos] = useState(2);
  const [infantes, setInfantes] = useState(0);
  const [acomodacion, setAcomodacion] = useState<Acomodacion | ''>('');
  const [markupExtra, setMarkupExtra] = useState(0);

  const [cotizacion, setCotizacion] = useState<CotizacionCalculada | null>(null);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    api
      .listarPaquetes()
      .then((p) => {
        setPaquetes(p.datos);
        if (!paqueteId && p.datos[0]) setPaqueteId(p.datos[0].id);
      })
      .catch(() => {
        // Modo offline / mock para garantizar operación continua
        const fallback = MOCK_PAQUETES_CATALOGO.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          destino: p.destino,
          paisIso: p.paisIso,
          dias: p.dias,
          noches: p.noches,
          planAlimentacion: p.planAlimentacion,
          inclusiones: p.inclusiones,
          exclusiones: p.exclusiones,
          descripcion: p.descripcion,
          activo: p.activo,
          mayoristaId: p.mayoristaId,
          creadoEn: p.creadoEn,
        }));
        setPaquetes(fallback);
        if (!paqueteId && fallback[0]) setPaqueteId(fallback[0].id);
      });
  }, [paqueteId]);

  useEffect(() => {
    if (paqueteParam && paquetes?.some((p) => p.id === paqueteParam)) {
      setPaqueteId(paqueteParam);
    }
  }, [paqueteParam, paquetes]);

  async function cotizar() {
    if (!paqueteId) return;
    setCalculando(true);
    setError(null);

    const entrada = {
      paqueteId,
      fechaSalida,
      pasajeros: { adultos, ninos, infantes },
      ...(acomodacion ? { acomodacion } : {}),
      ...(markupExtra ? { markupExtra } : {}),
    };

    try {
      const res = await api.cotizar(entrada);
      setCotizacion(res);
    } catch {
      // Fallback a simulación local pura si la API no responde
      const paqueteMock = MOCK_PAQUETES_CATALOGO.find((p) => p.id === paqueteId);
      if (paqueteMock) {
        try {
          const resultadoMock = calcularCotizacionMock(entrada, paqueteMock);
          setCotizacion(resultadoMock);
        } catch (eMock) {
          setError(new ErrorApi('ERROR_CALCULO', (eMock as Error).message));
          setCotizacion(null);
        }
      } else {
        setError(
          new ErrorApi(
            'PAQUETE_NO_ENCONTRADO',
            'El paquete seleccionado no se encuentra disponible.',
          ),
        );
        setCotizacion(null);
      }
    } finally {
      setCalculando(false);
    }
  }

  const copiarPropuestaWhatsApp = () => {
    if (!cotizacion) return;
    const texto = generarTextoPropuestaWhatsApp(cotizacion);
    void navigator.clipboard.writeText(texto).then(() => {
      startTransition(() => {
        setCopiado(true);
      });
      setTimeout(() => setCopiado(false), 3000);
    });
  };

  const paquete = paquetes?.find((p) => p.id === paqueteId);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-neutral-50 dark:bg-neutral-950">
      {/* 1. Barra Lateral de Módulos */}
      <BarraModulos />

      {/* 2. Cuerpo Principal */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Encabezado */}
        <header className="border-b border-neutral-200 bg-white px-6 py-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-acento-100 text-acento-800 dark:bg-acento-950 dark:text-acento-300 rounded-lg p-1.5">
                  <Calculator className="h-5 w-5" />
                </span>
                <h1 className="text-xl font-bold text-neutral-900 dark:text-white">
                  Cotizador de Paquetes
                </h1>
                <DistintivoDatosDemo visible={true} />
              </div>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                Calcula tarifas transparentes, desglose por acomodación y genera propuestas
                comerciales listas para WhatsApp en menos de 5 minutos.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/catalogo"
                className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
              >
                <Compass className="h-4 w-4" />
                Explorar Catálogo
              </Link>
            </div>
          </div>
        </header>

        {/* Zona de Trabajo */}
        <div className="flex flex-1 overflow-hidden">
          {/* Formulario y Desglose (Scrollable) */}
          <main className="flex-1 space-y-5 overflow-y-auto p-6 pb-14 md:pb-0">
            {paquetes === null && !error && (
              <div className="space-y-3" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-20 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800"
                  />
                ))}
              </div>
            )}

            {paquetes && paquetes.length > 0 && (
              <div className="max-w-4xl space-y-5">
                {/* Paso 1: Paquete y Fechas */}
                <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                  <h2 className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-white">
                    <Calendar className="text-acento-600 dark:text-acento-400 h-4 w-4" />
                    1. Selección de Paquete y Fecha de Salida
                  </h2>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="paquete-select"
                        className="text-xs font-medium text-neutral-600 dark:text-neutral-400"
                      >
                        Paquete Turístico
                      </label>
                      <select
                        id="paquete-select"
                        value={paqueteId}
                        onChange={(e) => setPaqueteId(e.target.value)}
                        className="focus:border-acento-500 focus:ring-acento-500 mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-900 transition-colors focus:ring-1 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                      >
                        {paquetes.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre} ({p.destino})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="fecha-salida-input"
                        className="text-xs font-medium text-neutral-600 dark:text-neutral-400"
                      >
                        Fecha de Salida
                      </label>
                      <input
                        id="fecha-salida-input"
                        type="date"
                        value={fechaSalida}
                        onChange={(e) => setFechaSalida(e.target.value)}
                        className="focus:border-acento-500 focus:ring-acento-500 mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-900 transition-colors focus:ring-1 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                      />
                    </div>
                  </div>

                  {paquete && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                      <span className="rounded bg-neutral-100 px-2 py-0.5 font-medium dark:bg-neutral-800">
                        {paquete.dias} días / {paquete.noches} noches
                      </span>
                      <span className="rounded bg-neutral-100 px-2 py-0.5 font-medium dark:bg-neutral-800">
                        Destino: {paquete.destino}
                      </span>
                      <span className="rounded bg-neutral-100 px-2 py-0.5 font-medium dark:bg-neutral-800">
                        Plan: {paquete.planAlimentacion.replace(/_/g, ' ')}
                      </span>
                    </div>
                  )}
                </section>

                {/* Paso 2: Pasajeros y Acomodación */}
                <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                  <h2 className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-white">
                    <Users className="text-acento-600 dark:text-acento-400 h-4 w-4" />
                    2. Composición de Pasajeros y Acomodación
                  </h2>

                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    {(
                      [
                        ['Adultos (ADT)', adultos, setAdultos, 1],
                        ['Niños (CHD)', ninos, setNinos, 0],
                        ['Infantes (INF)', infantes, setInfantes, 0],
                      ] as const
                    ).map(([etiqueta, valor, fijar, minimo]) => (
                      <div key={etiqueta} className="flex flex-col">
                        <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                          {etiqueta}
                        </label>
                        <input
                          type="number"
                          min={minimo}
                          value={valor}
                          onChange={(e) => fijar(Math.max(minimo, Number(e.target.value)))}
                          className="cifra focus:border-acento-500 focus:ring-acento-500 mt-1 w-24 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-900 transition-colors focus:ring-1 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-4">
                    <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                      Tipo de Acomodación
                    </span>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setAcomodacion('')}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                          acomodacion === ''
                            ? 'bg-acento-50 border-acento-600 text-acento-700 dark:bg-acento-950/60 dark:border-acento-500 dark:text-acento-300'
                            : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'
                        }`}
                      >
                        Sugerida por Servidor
                      </button>
                      {ACOMODACIONES.map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setAcomodacion(a)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                            acomodacion === a
                              ? 'bg-acento-50 border-acento-600 text-acento-700 dark:bg-acento-950/60 dark:border-acento-500 dark:text-acento-300'
                              : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'
                          }`}
                        >
                          {a.charAt(0) + a.slice(1).toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      El cálculo valida inventario y vigencia de tarifarios.
                    </span>
                    <button
                      type="button"
                      onClick={() => void cotizar()}
                      disabled={calculando}
                      className="bg-acento-600 hover:bg-acento-700 flex items-center gap-2 rounded-lg px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-colors disabled:opacity-50"
                    >
                      <Calculator className="h-4 w-4" />
                      {calculando ? 'Calculando tarifas...' : 'Calcular cotización'}
                    </button>
                  </div>
                </section>

                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/60 p-4 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                    <div>
                      <strong className="block font-bold">{error.message}</strong>
                      {error.details && (
                        <ul className="mt-1 list-disc space-y-0.5 pl-4">
                          {Object.entries(error.details).map(([k, v]) => (
                            <li key={k}>
                              <span className="font-semibold">{k}:</span> {String(v)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                {/* Desglose de Resultados */}
                {cotizacion && <DesgloseCotizacion c={cotizacion} />}
              </div>
            )}
          </main>

          {/* Panel Lateral de Resumen Comercial y Envío */}
          {cotizacion && (
            <aside className="w-88 shrink-0 overflow-y-auto border-l border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="text-sm font-bold text-neutral-900 dark:text-white">
                Resumen de Cotización
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Tarifas listas para confirmación con el cliente.
              </p>

              {/* Tarjeta de Total Venta */}
              <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  Total Venta (Cliente)
                </span>
                <div className="cifra mt-1 text-2xl font-extrabold text-neutral-900 dark:text-white">
                  {formatearDinero(cotizacion.totalVenta)}
                </div>

                {cotizacion.totalNeto && (
                  <div className="mt-2 flex items-center justify-between text-xs text-neutral-400 dark:text-neutral-500">
                    <span>Costo neto mayorista:</span>
                    <span className="cifra font-semibold">
                      {formatearDinero(cotizacion.totalNeto)}
                    </span>
                  </div>
                )}
              </div>

              {/* Margen de la Agencia */}
              {cotizacion.margen && (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                  <div className="flex items-center justify-between text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    <span className="flex items-center gap-1.5">
                      <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Margen Comercial
                    </span>
                    <span>{cotizacion.margenPorcentaje?.toFixed(1)}%</span>
                  </div>
                  <div className="cifra mt-1.5 text-lg font-bold text-emerald-700 dark:text-emerald-400">
                    {formatearDinero(cotizacion.margen)}
                  </div>
                </div>
              )}

              {/* Markup Adicional */}
              <div className="mt-4">
                <label
                  htmlFor="markup-input"
                  className="text-xs font-medium text-neutral-600 dark:text-neutral-400"
                >
                  Markup Adicional (%)
                </label>
                <input
                  id="markup-input"
                  type="number"
                  value={markupExtra}
                  onChange={(e) => setMarkupExtra(Number(e.target.value))}
                  onBlur={() => void cotizar()}
                  className="cifra focus:border-acento-500 mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
                <span className="mt-1 block text-[11px] text-neutral-400">
                  Aplica margen extra sobre la venta del tarifario base.
                </span>
              </div>

              {/* Acciones de Despacho Comercial */}
              <div className="mt-6 space-y-2.5">
                <button
                  type="button"
                  onClick={copiarPropuestaWhatsApp}
                  className="bg-ok-600 hover:bg-ok-700 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold text-white shadow-xs transition-colors"
                >
                  {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiado ? '¡Copiado al Portapapeles!' : 'Copiar Propuesta para WhatsApp'}
                </button>

                <Link
                  href="/bandeja"
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                >
                  <MessageSquare className="h-4 w-4" />
                  Abrir Chat en Bandeja
                </Link>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Imprimir / Ver PDF
                </button>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

function DesgloseCotizacion({ c }: { c: CotizacionCalculada }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-neutral-900 dark:text-white">
            Desglose de la Cotización
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Salida {c.fechaSalida} · Regreso {c.fechaRegreso}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            {c.temporadaNombre}
          </span>
          <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            {c.habitaciones.length} hab. {c.acomodacion.toLowerCase()}
          </span>
          {c.plazasSinUsar > 0 && (
            <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
              {c.plazasSinUsar} plaza(s) no ocupada(s)
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-100 dark:border-neutral-800">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50/60 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-400">
              <th className="px-3 py-2 text-left font-medium">Concepto</th>
              <th className="px-3 py-2 text-right font-medium">Cantidad</th>
              <th className="px-3 py-2 text-right font-medium">Venta Unitario</th>
              <th className="px-3 py-2 text-right font-medium">Subtotal Venta</th>
              <th className="px-3 py-2 text-right font-medium text-neutral-400 dark:text-neutral-500">
                Neto Mayorista
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
            {c.lineas.map((l) => (
              <tr
                key={l.tipoPasajero}
                className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/20"
              >
                <td className="px-3 py-2 font-semibold text-neutral-800 dark:text-neutral-200">
                  {l.tipoPasajero === 'ADT'
                    ? 'Adulto'
                    : l.tipoPasajero === 'CHD'
                      ? 'Niño'
                      : 'Infante'}
                </td>
                <td className="cifra px-3 py-2 text-right font-medium">{l.cantidad}</td>
                <td className="cifra px-3 py-2 text-right">
                  {formatearDinero(l.precioUnitarioVenta)}
                </td>
                <td className="cifra px-3 py-2 text-right font-bold text-neutral-900 dark:text-white">
                  {formatearDinero(l.subtotalVenta)}
                </td>
                <td className="cifra px-3 py-2 text-right text-neutral-400 dark:text-neutral-500">
                  {l.subtotalNeto ? formatearDinero(l.subtotalNeto) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Cotizador() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-neutral-50 dark:bg-neutral-950">
          <div className="border-acento-600 h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
        </div>
      }
    >
      <ContenidoCotizador />
    </Suspense>
  );
}
