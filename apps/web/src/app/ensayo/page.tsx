'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  FileSpreadsheet,
  MessageSquare,
  CalendarClock,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { ContadoresBandeja, PaginaDeCotizaciones, PaginaSeguimientos } from '@viajapro/contracts';
import { BarraModulos } from '../../components/bandeja/barra-modulos';
import { obtenerBaseApi } from '../../lib/api-base';
import { cabecerasDeTenantDev } from '../../lib/cabeceras-tenant';
import { esModoDemo } from '../../lib/modo-demo';
import {
  calcularEstadoEnsayoJornada,
  contarCotizacionesEnviadas,
  contarSeguimientosFechados,
  type ResultadoEnsayoJornada,
} from '../../lib/ensayo-logica';

async function consultarJsonReal(ruta: string): Promise<unknown> {
  const res = await fetch(`${obtenerBaseApi()}${ruta}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...cabecerasDeTenantDev(),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return await res.json();
}

export default function EnsayoJornadaPage(): React.JSX.Element {
  const modoDemoActivo = esModoDemo();
  const [cargando, setCargando] = useState<boolean>(true);
  const [avisoRed, setAvisoRed] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoEnsayoJornada>(() =>
    calcularEstadoEnsayoJornada({
      conversacionesAtendidas: 0,
      cotizacionesEnviadas: 0,
      seguimientosFechados: 0,
      modoDemo: modoDemoActivo,
      origenDatosEsDemo: false,
    }),
  );

  const cargarContadoresReales = useCallback(async () => {
    setCargando(true);
    setAvisoRed(null);

    const enModoDemo = esModoDemo();

    // En modo real NUNCA se leen mocks ni datos de demostración
    try {
      const [contadoresRes, cotizacionesRes, seguimientosRes] = await Promise.allSettled([
        consultarJsonReal('/api/v1/conversaciones/contadores'),
        consultarJsonReal('/api/v1/cotizaciones?limite=100'),
        consultarJsonReal('/api/v1/crm/seguimientos'),
      ]);

      let conversacionesAtendidas = 0;
      let cotizacionesEnviadas = 0;
      let seguimientosFechados = 0;
      let huboRespuesta = false;

      if (contadoresRes.status === 'fulfilled') {
        const parsed = ContadoresBandeja.safeParse(contadoresRes.value);
        if (parsed.success) {
          conversacionesAtendidas = parsed.data.todas;
          huboRespuesta = true;
        }
      }

      if (cotizacionesRes.status === 'fulfilled') {
        const parsed = PaginaDeCotizaciones.safeParse(cotizacionesRes.value);
        if (parsed.success) {
          cotizacionesEnviadas = contarCotizacionesEnviadas(parsed.data.datos);
          huboRespuesta = true;
        }
      }

      if (seguimientosRes.status === 'fulfilled') {
        const parsed = PaginaSeguimientos.safeParse(seguimientosRes.value);
        if (parsed.success) {
          seguimientosFechados = contarSeguimientosFechados(parsed.data.datos);
          huboRespuesta = true;
        }
      }

      if (
        !huboRespuesta &&
        contadoresRes.status === 'rejected' &&
        cotizacionesRes.status === 'rejected' &&
        seguimientosRes.status === 'rejected'
      ) {
        setAvisoRed(
          'Sin conexión con el servidor de la agencia. En modo real los contadores permanecen en 0 (sin datos de demostración).',
        );
      }

      setResultado(
        calcularEstadoEnsayoJornada({
          conversacionesAtendidas,
          cotizacionesEnviadas,
          seguimientosFechados,
          modoDemo: enModoDemo,
          origenDatosEsDemo: false,
        }),
      );
    } catch {
      setAvisoRed(
        'No fue posible consultar las métricas reales de la jornada. Se muestran contadores en 0.',
      );
      setResultado(
        calcularEstadoEnsayoJornada({
          conversacionesAtendidas: 0,
          cotizacionesEnviadas: 0,
          seguimientosFechados: 0,
          modoDemo: enModoDemo,
          origenDatosEsDemo: false,
        }),
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargarContadoresReales();
  }, [cargarContadoresReales]);

  const metasCumplidasCount = resultado.indicadores.filter((i) => i.cumplido).length;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 dark:bg-slate-950">
      <BarraModulos />

      <main className="flex flex-1 flex-col overflow-y-auto pb-16 md:pb-8">
        {/* Encabezado */}
        <header className="border-b border-slate-200 bg-white px-5 py-6 md:px-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800 ring-1 ring-teal-600/20 dark:bg-teal-950/60 dark:text-teal-300">
                  <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Piloto de Agencia — Fase 1
                </span>

                {!resultado.modoDemo ? (
                  <span
                    data-testid="insignia-modo-real-ensayo"
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-600/20 dark:bg-emerald-950/60 dark:text-emerald-300"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Modo real · Sin datos de demostración
                  </span>
                ) : (
                  <span
                    data-testid="insignia-modo-demo-ensayo"
                    className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-600/20 dark:bg-amber-950/60 dark:text-amber-300"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    Modo demostración activo
                  </span>
                )}
              </div>

              <h1 className="mt-2 font-serif text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
                Lista de ensayo de jornada
              </h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Verificación en vivo del criterio de salida de Fase 1 antes de operar un día laboral
                completo con la agencia piloto.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                void cargarContadoresReales();
              }}
              disabled={cargando}
              data-testid="boton-actualizar-ensayo"
              className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50 sm:self-auto dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <RefreshCw
                className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              Actualizar contadores
            </button>
          </div>
        </header>

        <div className="mx-auto w-full max-w-5xl space-y-6 px-5 pt-6 md:px-8">
          {/* Aviso de red si la API no respondió */}
          {avisoRed && (
            <div
              role="status"
              data-testid="aviso-red-ensayo"
              className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-xs font-medium text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <span>{avisoRed}</span>
            </div>
          )}

          {/* Banner principal de cumplimiento Fase 1 */}
          {resultado.criterioFase1Cumplido ? (
            <section
              data-testid="marca-verde-fase-1"
              className="flex flex-col justify-between gap-4 rounded-2xl border-2 border-emerald-500 bg-emerald-50/90 p-6 shadow-xs sm:flex-row sm:items-center dark:border-emerald-500/80 dark:bg-emerald-950/40"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
                  <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
                </div>
                <div>
                  <span className="inline-block rounded-md bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold tracking-wider text-white uppercase">
                    Criterio Fase 1 Cumplido
                  </span>
                  <h2 className="mt-1 text-lg font-bold text-emerald-950 dark:text-emerald-100">
                    Jornada de piloto verificada con éxito
                  </h2>
                  <p className="mt-0.5 text-sm text-emerald-800 dark:text-emerald-200">
                    Se completaron las 20 conversaciones atendidas, 5 cotizaciones enviadas y los
                    seguimientos fechados con datos 100 % reales de la agencia.
                  </p>
                </div>
              </div>
            </section>
          ) : (
            <section
              data-testid="estado-pendiente-fase-1"
              className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
                  <CircleDashed className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                  <span className="text-xs font-semibold tracking-wider text-teal-700 uppercase dark:text-teal-400">
                    Progreso del ensayo ({metasCumplidasCount} de 3 metas cumplidas)
                  </span>
                  <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">
                    Completa los contadores reales para habilitar la marca verde de Fase 1
                  </h2>
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                    Cada acción registrada por los asesores en la bandeja, el cotizador y el
                    pipeline actualiza automáticamente esta lista.
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Tarjetas de los 3 contadores reales */}
          <section
            aria-label="Contadores reales de la jornada"
            className="grid grid-cols-1 gap-4 md:grid-cols-3"
          >
            {resultado.indicadores.map((indicador) => {
              const Icono =
                indicador.id === 'conversaciones'
                  ? MessageSquare
                  : indicador.id === 'cotizaciones'
                    ? FileSpreadsheet
                    : CalendarClock;

              return (
                <article
                  key={indicador.id}
                  data-testid={`contador-${indicador.id}`}
                  className={`flex flex-col justify-between rounded-2xl border p-5 shadow-xs transition ${
                    indicador.cumplido
                      ? 'border-emerald-400 bg-emerald-50/40 dark:border-emerald-700 dark:bg-emerald-950/20'
                      : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        <Icono className="h-5 w-5" aria-hidden="true" />
                      </span>

                      {indicador.cumplido ? (
                        <span
                          data-testid={`check-${indicador.id}`}
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Meta cumplida
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          Meta: {indicador.meta}
                        </span>
                      )}
                    </div>

                    <h3 className="mt-4 text-base font-bold text-slate-900 dark:text-white">
                      {indicador.titulo}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      {indicador.descripcion}
                    </p>
                  </div>

                  <div className="mt-5">
                    <div className="flex items-baseline justify-between">
                      <span
                        data-testid={`valor-${indicador.id}`}
                        className="font-mono text-3xl font-extrabold text-slate-900 tabular-nums dark:text-white"
                      >
                        {indicador.actual}
                      </span>
                      <span className="font-mono text-xs font-semibold text-slate-500 tabular-nums">
                        / {indicador.meta} requeridos ({indicador.porcentaje}%)
                      </span>
                    </div>

                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all ${
                          indicador.cumplido ? 'bg-emerald-600' : 'bg-teal-600'
                        }`}
                        style={{ width: `${indicador.porcentaje}%` }}
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          {/*Accesos directos para ejecutar las tareas del ensayo */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Guía operativa del ensayo (Ruta al entregable de Fase 1)
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Ejecuta el flujo completo de punta a punta con dos asesores y un administrador de la
              agencia piloto:
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Link
                href="/bandeja"
                className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5 text-sm font-semibold text-slate-800 transition hover:border-teal-600 hover:bg-teal-50/30 dark:border-slate-800 dark:text-slate-200"
              >
                <span>1. Atender bandeja WhatsApp</span>
                <ArrowRight className="h-4 w-4 text-teal-700" aria-hidden="true" />
              </Link>

              <Link
                href="/cotizador"
                className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5 text-sm font-semibold text-slate-800 transition hover:border-teal-600 hover:bg-teal-50/30 dark:border-slate-800 dark:text-slate-200"
              >
                <span>2. Armar y enviar cotización</span>
                <ArrowRight className="h-4 w-4 text-teal-700" aria-hidden="true" />
              </Link>

              <Link
                href="/pipeline"
                className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5 text-sm font-semibold text-slate-800 transition hover:border-teal-600 hover:bg-teal-50/30 dark:border-slate-800 dark:text-slate-200"
              >
                <span>3. Programar seguimientos</span>
                <ArrowRight className="h-4 w-4 text-teal-700" aria-hidden="true" />
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
