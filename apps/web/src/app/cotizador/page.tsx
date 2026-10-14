'use client';

/**
 * Cotizador de paquetes y salidas — Módulo Comercial (ADR-0009 - 0c.16)
 *
 * Cotización armada por tipo de pasajero, total protagonista para WhatsApp,
 * tarifas de grupo alternativas y motivos de no aplicación.
 * Conexión directa a GET /api/v1/catalogo/salidas y POST /api/v1/catalogo/cotizar.
 * Cumple con R3 (@viajapro/contracts: CotizarSalida, CotizacionDeSalida, SalidaPublicada).
 */

import React, { Suspense, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Calculator, Compass, Copy, Check, AlertCircle } from 'lucide-react';
import type {
  Acomodacion,
  CotizacionCalculada,
  CotizacionDeSalida,
  SalidaPublicada,
} from '@viajapro/contracts';
import { formatearDinero } from '../../lib/api';
import { BarraModulos } from '../../components/bandeja/barra-modulos';
import { DistintivoDatosDemo } from '../../components/comun/distintivo-datos-demo';
import { AvisoConfiguracionTenant } from '../../components/crm/aviso-configuracion-tenant';
import { DesgloseCotizacionSalida } from '../../components/cotizador/desglose-cotizacion-salida';
import { MOCK_PAQUETES_CATALOGO } from '../../lib/mock-catalogo';
import {
  calcularCotizacionMock,
  generarTextoPropuestaWhatsApp,
  generarTextoPropuestaWhatsAppSalida,
  interpretarErrorCotizacion,
} from '../../lib/cotizador-logica';
import {
  estaUsandoCatalogoReal,
  listarSalidasApi,
  cotizarSalidaApi,
  CatalogoApiError,
} from '../../lib/catalogo-api';

interface PaqueteOpcion {
  id: string;
  nombre: string;
  destino: string;
}

function ContenidoCotizador() {
  const searchParams = useSearchParams();
  const paqueteParam = searchParams.get('paqueteId');
  const fechaParam = searchParams.get('fecha');

  // Modo de operación: API real (ADR-0009) vs mock
  const [usarReal, setUsarReal] = useState(() => estaUsandoCatalogoReal());
  const [salidasDisponibles, setSalidasDisponibles] = useState<SalidaPublicada[]>([]);
  const [paquetesDisponibles, setPaquetesDisponibles] = useState<PaqueteOpcion[]>([]);
  const [errorTenant, setErrorTenant] = useState<string | null>(null);

  // Parámetros de cotización
  const [paqueteId, setPaqueteId] = useState(paqueteParam ?? '');
  const [fecha, setFecha] = useState(fechaParam ?? '2026-10-03');
  const [adultos, setAdultos] = useState(2);
  const [ninos, setNinos] = useState(0);
  const [infantes, setInfantes] = useState(0);

  // Parámetros modo mock / v1
  const [acomodacionMock] = useState<Acomodacion | ''>('');
  const [markupExtraMock] = useState(0);

  // Respuestas y Estados
  const [cotizacionReal, setCotizacionReal] = useState<CotizacionDeSalida | null>(null);
  const [cotizacionMock, setCotizacionMock] = useState<CotizacionCalculada | null>(null);
  const [errorMensaje, setErrorMensaje] = useState<{
    codigo: string;
    mensaje: string;
    esErrorAgencia: boolean;
  } | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Eje 3 de ADR-0009: pideComposicion gobernado por el tarifario
  const pideComposicion = useMemo(() => {
    if (!usarReal) return true;
    if (cotizacionReal) return cotizacionReal.pideComposicion;
    // Si aún no hay respuesta de cotización, inferir de las salidas si es posible
    return true;
  }, [usarReal, cotizacionReal]);

  // Carga inicial de catálogo y salidas reales
  useEffect(() => {
    if (!usarReal) return;

    listarSalidasApi({ desde: '2026-10-01' })
      .then((salidas) => {
        setSalidasDisponibles(salidas);
        setErrorTenant(null);

        // Extraer paquetes únicos de las salidas
        const mapPaquetes = new Map<string, PaqueteOpcion>();
        for (const s of salidas) {
          if (!mapPaquetes.has(s.paqueteId)) {
            mapPaquetes.set(s.paqueteId, {
              id: s.paqueteId,
              nombre: s.paqueteNombre,
              destino: s.destino,
            });
          }
        }
        const listaPaquetes = Array.from(mapPaquetes.values());
        setPaquetesDisponibles(listaPaquetes);

        // Si no hay paquete seleccionado, seleccionar el del query param o el primero
        if (!paqueteId && listaPaquetes.length > 0) {
          const inicial =
            paqueteParam && mapPaquetes.has(paqueteParam) ? paqueteParam : listaPaquetes[0]!.id;
          setPaqueteId(inicial);
        }
      })
      .catch((err) => {
        console.error('Error cargando salidas para cotizador:', err);
        if (err instanceof CatalogoApiError && err.code === 'SIN_SESION') {
          setErrorTenant(err.message);
        } else {
          setErrorTenant(
            err instanceof Error ? err.message : 'Error al conectar con la API de catálogo',
          );
        }
      });
  }, [usarReal]);

  // Fechas disponibles para el paquete seleccionado
  const fechasDelPaquete = useMemo(() => {
    if (!usarReal || !paqueteId) return [];
    return salidasDisponibles
      .filter((s) => s.paqueteId === paqueteId)
      .map((s) => s.fecha)
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort();
  }, [usarReal, paqueteId, salidasDisponibles]);

  // Si cambia el paquete y la fecha actual no aplica, sugerir la primera disponible
  useEffect(() => {
    if (usarReal && fechasDelPaquete.length > 0 && !fechasDelPaquete.includes(fecha)) {
      if (!fechaParam) {
        setFecha(fechasDelPaquete[0]!);
      }
    }
  }, [usarReal, paqueteId, fechasDelPaquete]);

  // Ejecutar Cotización (Real o Mock)
  const ejecutarCotizacion = async () => {
    if (!paqueteId || !fecha) return;

    setCalculando(true);
    setErrorMensaje(null);
    setCopiado(false);

    if (usarReal) {
      try {
        const respuesta = await cotizarSalidaApi({
          paqueteId,
          fecha,
          adultos: Math.max(1, adultos),
          ninos: pideComposicion ? ninos : 0,
          infantes: pideComposicion ? infantes : 0,
        });
        setCotizacionReal(respuesta);
        setErrorMensaje(null);
      } catch (err) {
        setCotizacionReal(null);
        const interpretado = interpretarErrorCotizacion(err);
        setErrorMensaje(interpretado);
      } finally {
        setCalculando(false);
      }
    } else {
      // Modo Mock
      try {
        const paqueteMock =
          MOCK_PAQUETES_CATALOGO.find((p) => p.id === paqueteId) ?? MOCK_PAQUETES_CATALOGO[0]!;
        const respuestaMock = calcularCotizacionMock(
          {
            paqueteId: paqueteMock.id,
            fechaSalida: fecha,
            pasajeros: {
              adultos,
              ninos,
              infantes,
            },
            acomodacion: acomodacionMock || undefined,
            markupExtra: markupExtraMock,
          },
          paqueteMock,
        );
        setCotizacionMock(respuestaMock);
        setErrorMensaje(null);
      } catch (err) {
        setErrorMensaje({
          codigo: 'ERROR_MOCK',
          mensaje: err instanceof Error ? err.message : 'Error al calcular cotización mock',
          esErrorAgencia: false,
        });
      } finally {
        setCalculando(false);
      }
    }
  };

  // Recalcular automáticamente al cambiar parámetros
  useEffect(() => {
    if (paqueteId && fecha) {
      void ejecutarCotizacion();
    }
  }, [paqueteId, fecha, adultos, ninos, infantes, acomodacionMock, markupExtraMock, usarReal]);

  // Copiar propuesta WhatsApp
  const copiarPropuestaWhatsApp = () => {
    let texto = '';
    if (usarReal && cotizacionReal) {
      texto = generarTextoPropuestaWhatsAppSalida(cotizacionReal);
    } else if (cotizacionMock) {
      texto = generarTextoPropuestaWhatsApp(cotizacionMock);
    }

    if (texto && typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(texto).then(() => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2500);
      });
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-neutral-50 dark:bg-neutral-950">
      {/* 1. Barra de Módulos */}
      <BarraModulos />

      {/* 2. Área Principal */}
      <main className="flex flex-1 flex-col overflow-y-auto pb-14 md:pb-0">
        {/* Cabecera */}
        <header className="border-b border-neutral-200 bg-white px-6 py-5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-acento-100 text-acento-800 dark:bg-acento-950 dark:text-acento-300 rounded-lg p-1.5">
                  <Calculator className="h-5 w-5" />
                </span>
                <h1 className="text-xl font-bold text-neutral-900 dark:text-white">
                  Cotizador Comercial de Viajes
                </h1>
                <DistintivoDatosDemo visible={!usarReal || !!errorTenant} />
              </div>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {usarReal && !errorTenant
                  ? 'Cotización armada en tiempo real con tarifarios reales (ADR-0009)'
                  : 'Cotización con motor simulado para demostraciones y desarrollo offline'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/catalogo"
                className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              >
                <Compass className="h-4 w-4" />
                Ver Catálogo de Salidas
              </Link>
            </div>
          </div>
        </header>

        {/* Contenido en dos columnas */}
        <div className="p-6">
          {/* Error de configuración de sesión */}
          {usarReal && errorTenant && (
            <div className="mb-6">
              <AvisoConfiguracionTenant
                onContinuarConDemo={() => {
                  setUsarReal(false);
                  setErrorTenant(null);
                }}
              />
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-12">
            {/* Panel de Configuración de la Cotización (4 col) */}
            <aside className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs lg:col-span-4 dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="text-sm font-bold text-neutral-900 dark:text-white">
                Parámetros del Viaje
              </h2>
              <p className="mt-0.5 text-xs text-neutral-500">
                Seleccione el paquete, la fecha y la composición de pasajeros
              </p>

              <div className="mt-5 space-y-4">
                {/* 1. Selector de Paquete */}
                <div>
                  <label
                    htmlFor="paquete-select"
                    className="text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                  >
                    Paquete / Excursión
                  </label>
                  <select
                    id="paquete-select"
                    value={paqueteId}
                    onChange={(e) => setPaqueteId(e.target.value)}
                    className="focus:border-acento-500 focus:ring-acento-500 mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-900 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  >
                    {usarReal && paquetesDisponibles.length > 0
                      ? paquetesDisponibles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre} ({p.destino})
                          </option>
                        ))
                      : MOCK_PAQUETES_CATALOGO.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre} ({p.destino})
                          </option>
                        ))}
                  </select>
                </div>

                {/* 2. Selector de Fecha de Salida */}
                <div>
                  <label
                    htmlFor="fecha-input"
                    className="flex items-center justify-between text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                  >
                    <span>Fecha de Salida</span>
                    {fechasDelPaquete.length > 0 && (
                      <span className="text-acento-600 dark:text-acento-400 text-[11px] font-normal">
                        {fechasDelPaquete.length} fecha(s) publicada(s)
                      </span>
                    )}
                  </label>
                  <input
                    id="fecha-input"
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className="focus:border-acento-500 focus:ring-acento-500 mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-900 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />

                  {/* Atajos de fechas publicadas del paquete */}
                  {usarReal && fechasDelPaquete.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {fechasDelPaquete.map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFecha(f)}
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                            fecha === f
                              ? 'bg-acento-600 text-white'
                              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300'
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Composición de Pasajeros (0c.16.2 — pideComposicion) */}
                <div className="rounded-xl border border-neutral-100 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-800/30">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                      Composición del Grupo
                    </span>
                    {!pideComposicion && (
                      <span className="rounded bg-neutral-200/80 px-2 py-0.5 text-[10px] font-semibold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                        Tarifa fija por persona
                      </span>
                    )}
                  </div>

                  {!pideComposicion ? (
                    /* Tarifa sin desglose por edad (pasadías, etc.) */
                    <div>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                            Número de Pasajeros
                          </span>
                          <span className="block text-[11px] text-neutral-400">
                            Pasadía sin tarifa diferenciada de menor
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setAdultos(Math.max(1, adultos - 1))}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-300 bg-white font-bold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                          >
                            -
                          </button>
                          <span className="cifra w-6 text-center text-sm font-bold text-neutral-900 dark:text-white">
                            {adultos}
                          </span>
                          <button
                            type="button"
                            onClick={() => setAdultos(adultos + 1)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-300 bg-white font-bold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Tarifario que exige desglose por edad */
                    <div className="space-y-3">
                      {/* Adultos */}
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                            Adultos
                          </span>
                          <span className="block text-[10px] text-neutral-400">Desde 12 años</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setAdultos(Math.max(1, adultos - 1))}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-300 bg-white font-bold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                          >
                            -
                          </button>
                          <span className="cifra w-6 text-center text-sm font-bold text-neutral-900 dark:text-white">
                            {adultos}
                          </span>
                          <button
                            type="button"
                            onClick={() => setAdultos(adultos + 1)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-300 bg-white font-bold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Niños */}
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                            Niños
                          </span>
                          <span className="block text-[10px] text-neutral-400">De 2 a 11 años</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setNinos(Math.max(0, ninos - 1))}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-300 bg-white font-bold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                          >
                            -
                          </button>
                          <span className="cifra w-6 text-center text-sm font-bold text-neutral-900 dark:text-white">
                            {ninos}
                          </span>
                          <button
                            type="button"
                            onClick={() => setNinos(ninos + 1)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-300 bg-white font-bold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Infantes */}
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                            Infantes
                          </span>
                          <span className="block text-[10px] text-neutral-400">
                            Menores de 2 años
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setInfantes(Math.max(0, infantes - 1))}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-300 bg-white font-bold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                          >
                            -
                          </button>
                          <span className="cifra w-6 text-center text-sm font-bold text-neutral-900 dark:text-white">
                            {infantes}
                          </span>
                          <button
                            type="button"
                            onClick={() => setInfantes(infantes + 1)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-300 bg-white font-bold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Alternador modo Real / Mock */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setUsarReal(!usarReal)}
                    className="w-full text-center text-xs font-semibold text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                  >
                    Modo: {usarReal ? 'Conectado a API real' : 'Simulación offline'} (Cambiar)
                  </button>
                </div>
              </div>
            </aside>

            {/* Panel de Resultados de la Cotización (8 col) */}
            <div className="lg:col-span-8">
              {/* Estado de carga */}
              {calculando && (
                <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-neutral-200 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900">
                  <div className="border-acento-600 h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
                  <p className="text-xs text-neutral-500">
                    Cotizando salida contra el tarifario oficial...
                  </p>
                </div>
              )}

              {/* Mensajes de Error de Dominio (0c.16.3) */}
              {!calculando && errorMensaje && (
                <div
                  className={`rounded-2xl border p-6 ${
                    errorMensaje.esErrorAgencia
                      ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300'
                      : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <h3 className="text-sm font-bold">
                        {errorMensaje.codigo === 'SIN_VIGENCIA'
                          ? 'Sin vigencia disponible para la fecha'
                          : errorMensaje.codigo === 'VIGENCIAS_EMPATADAS'
                            ? 'Error en datos de tarifario (Vigencias solapadas)'
                            : 'No se pudo generar la cotización'}
                      </h3>
                      <p className="mt-1 text-xs">{errorMensaje.mensaje}</p>
                      {fechasDelPaquete.length > 0 && (
                        <div className="mt-3">
                          <span className="text-[11px] font-semibold">
                            Fechas con salida confirmada para este paquete:
                          </span>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {fechasDelPaquete.map((f) => (
                              <button
                                key={f}
                                type="button"
                                onClick={() => setFecha(f)}
                                className="rounded bg-white px-2.5 py-1 text-xs font-bold text-neutral-800 shadow-xs hover:bg-neutral-100 dark:bg-neutral-800 dark:text-white"
                              >
                                {f}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Resultado Cotización Real (0c.16.2) */}
              {!calculando && !errorMensaje && usarReal && cotizacionReal && (
                <DesgloseCotizacionSalida
                  cotizacion={cotizacionReal}
                  copiado={copiado}
                  alCopiarWhatsApp={copiarPropuestaWhatsApp}
                />
              )}

              {/* Resultado Cotización Mock (Fallback) */}
              {!calculando && !errorMensaje && !usarReal && cotizacionMock && (
                <section className="space-y-6">
                  <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-neutral-500 uppercase">
                          Total Cotización (Simulada)
                        </span>
                        <div className="cifra mt-1 text-3xl font-black text-neutral-900 dark:text-white">
                          {formatearDinero(cotizacionMock.totalVenta)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={copiarPropuestaWhatsApp}
                        className="bg-ok-600 hover:bg-ok-700 flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-xs"
                      >
                        {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copiado ? '¡Copiado!' : 'Copiar para WhatsApp'}
                      </button>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
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
