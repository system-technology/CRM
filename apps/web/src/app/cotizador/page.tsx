'use client';

/**
 * Cotizador de paquetes y salidas — Módulo Comercial (ADR-0009 - 0c.16 & 0c.22)
 *
 * Cotización armada por tipo de pasajero, total protagonista para WhatsApp,
 * tarifas de grupo alternativas y motivos de no aplicación.
 * Conexión directa a GET /api/v1/catalogo/salidas y POST /api/v1/catalogo/cotizar.
 * Integración con Guardar Cotización y Control de Versiones (0c.22).
 * Cumple con R3 (@viajapro/contracts: CotizarSalida, CotizacionDeSalida, SalidaPublicada, GuardarCotizacion).
 */

import React, { Suspense, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useModoDemo } from '../../lib/modo-demo';
import { Calculator, Compass, Copy, Check, AlertCircle, Bookmark, Ship } from 'lucide-react';
import { requiereAvisoImpuestoMuelle } from '../../lib/cotizador-logica';
import type {
  Acomodacion,
  CotizacionCalculada,
  CotizacionDeSalida,
  SalidaPublicada,
  Contacto,
} from '@viajapro/contracts';
import { formatearDinero } from '../../lib/api';
import { BarraModulos } from '../../components/bandeja/barra-modulos';
import { DistintivoDatosDemo } from '../../components/comun/distintivo-datos-demo';
import { AvisoSinCatalogo } from '../../components/comun/aviso-sin-catalogo';
import { AvisoConfiguracionTenant } from '../../components/crm/aviso-configuracion-tenant';
import { formatearErrorAmigable } from '../../lib/estados-ui-logica';
import { DesgloseCotizacionSalida } from '../../components/cotizador/desglose-cotizacion-salida';
import { ModalGuardarCotizacion } from '../../components/cotizador/modal-guardar-cotizacion';
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
import { listarContactos } from '../../lib/crm-api';
import { guardarCotizacionApi } from '../../lib/cotizaciones-api';
import {
  armarCuerpoGuardarCotizacion,
  interpretarErrorCotizaciones,
  sugerirTituloCotizacion,
} from '../../lib/cotizaciones-logica';

interface PaqueteOpcion {
  id: string;
  nombre: string;
  destino: string;
  noches?: number;
}

function ContenidoCotizador() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paqueteParam = searchParams.get('paqueteId');
  const fechaParam = searchParams.get('fecha');
  const conversacionParam = searchParams.get('conversacion');
  const contactoParam = searchParams.get('contactoId');

  // Modo de operación: API real (ADR-0009) vs mock
  const { esDemo, alternarDemo } = useModoDemo();
  const modoRealActivo = !esDemo && estaUsandoCatalogoReal();
  const [usarReal, setUsarReal] = useState(() => modoRealActivo);

  useEffect(() => {
    setUsarReal(modoRealActivo);
  }, [modoRealActivo]);
  const [cargandoSalidas, setCargandoSalidas] = useState(true);
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

  // Contactos y Guardado (0c.22)
  const [contactosDisponibles, setContactosDisponibles] = useState<Contacto[]>([]);
  const [contactoIdInicial, setContactoIdInicial] = useState<string>('');
  const [modalGuardarAbierto, setModalGuardarAbierto] = useState(false);
  const [guardandoCotizacion, setGuardandoCotizacion] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<{
    codigo: string;
    mensaje: string;
    esErrorAgencia: boolean;
  } | null>(null);

  // Eje 3 de ADR-0009: pideComposicion gobernado por el tarifario
  const pideComposicion = useMemo(() => {
    if (!usarReal) return true;
    if (cotizacionReal) return cotizacionReal.pideComposicion;
    return true;
  }, [usarReal, cotizacionReal]);

  // Cargar contactos disponibles para asociar cotización
  useEffect(() => {
    listarContactos()
      .then((pag) => {
        setContactosDisponibles(pag.datos);

        if (contactoParam) {
          setContactoIdInicial(contactoParam);
        } else if (conversacionParam && pag.datos.length > 0) {
          // Pre-asociar contacto cuando se navega desde una conversación
          const contactoMatch = pag.datos.find((c) => c.id === conversacionParam);
          if (contactoMatch) {
            setContactoIdInicial(contactoMatch.id);
          } else {
            setContactoIdInicial(pag.datos[0]!.id);
          }
        } else if (pag.datos.length > 0) {
          setContactoIdInicial(pag.datos[0]!.id);
        }
      })
      .catch((err: unknown) => {
        console.warn('No se pudieron listar contactos:', err);
      });
  }, [contactoParam, conversacionParam]);

  const cargarSalidasReales = () => {
    setCargandoSalidas(true);
    listarSalidasApi({ desde: '2026-10-01' })
      .then((salidas) => {
        setSalidasDisponibles(salidas);
        setErrorTenant(null);

        const mapPaquetes = new Map<string, PaqueteOpcion>();
        for (const s of salidas) {
          if (!mapPaquetes.has(s.paqueteId)) {
            mapPaquetes.set(s.paqueteId, {
              id: s.paqueteId,
              nombre: s.paqueteNombre,
              destino: s.destino,
              noches: s.noches,
            });
          }
        }
        const listaPaquetes = Array.from(mapPaquetes.values());
        setPaquetesDisponibles(listaPaquetes);

        if (!paqueteId && listaPaquetes.length > 0) {
          setPaqueteId(listaPaquetes[0]!.id);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof CatalogoApiError && err.code === 'SIN_SESION') {
          setErrorTenant(formatearErrorAmigable(err));
        } else {
          console.error('Error cargando salidas para cotizador:', err);
        }
      })
      .finally(() => {
        setCargandoSalidas(false);
      });
  };

  useEffect(() => {
    if (usarReal) {
      cargarSalidasReales();
    } else {
      setCargandoSalidas(false);
      const lista = MOCK_PAQUETES_CATALOGO.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        destino: p.destino,
        noches: p.noches,
      }));
      setPaquetesDisponibles(lista);
      if (!paqueteId && lista.length > 0) {
        setPaqueteId(lista[0]!.id);
      }
    }
  }, [usarReal]);

  // Fechas disponibles para el paquete seleccionado
  const fechasDelPaquete = useMemo(() => {
    if (!usarReal || !paqueteId) return [];
    return salidasDisponibles.filter((s) => s.paqueteId === paqueteId).map((s) => s.fecha);
  }, [usarReal, paqueteId, salidasDisponibles]);

  // Paquete actualmente seleccionado
  const paqueteSeleccionado = useMemo(() => {
    return paquetesDisponibles.find((p) => p.id === paqueteId) ?? paquetesDisponibles[0];
  }, [paquetesDisponibles, paqueteId]);

  // Efecto de cotización: ejecuta cotizarSalidaApi o calcularCotizacionMock
  useEffect(() => {
    if (!paqueteId || !fecha) return;

    setCalculando(true);
    setErrorMensaje(null);

    if (usarReal) {
      cotizarSalidaApi({
        paqueteId,
        fecha,
        adultos: pideComposicion ? adultos : undefined,
        ninos: pideComposicion ? ninos : undefined,
        infantes: pideComposicion ? infantes : undefined,
      })
        .then((res) => {
          setCotizacionReal(res);
          setCotizacionMock(null);
        })
        .catch((err: unknown) => {
          setCotizacionReal(null);
          setErrorMensaje(interpretarErrorCotizacion(err));
        })
        .finally(() => {
          setCalculando(false);
        });
    } else {
      // Modo mock offline
      const mockPkg =
        MOCK_PAQUETES_CATALOGO.find((p) => p.id === paqueteId) ?? MOCK_PAQUETES_CATALOGO[0]!;
      try {
        const res = calcularCotizacionMock(
          {
            paqueteId: mockPkg.id,
            fechaSalida: fecha,
            pasajeros: { adultos, ninos, infantes },
            acomodacion: acomodacionMock || undefined,
            markupExtra: markupExtraMock,
          },
          mockPkg,
        );
        setCotizacionMock(res);
        setCotizacionReal(null);
      } catch (err: unknown) {
        console.error('Error calculando mock:', err);
      } finally {
        setCalculando(false);
      }
    }
  }, [
    usarReal,
    paqueteId,
    fecha,
    adultos,
    ninos,
    infantes,
    pideComposicion,
    acomodacionMock,
    markupExtraMock,
  ]);

  // Copiar propuesta WhatsApp al portapapeles
  const copiarPropuestaWhatsApp = () => {
    let texto = '';
    if (usarReal && cotizacionReal) {
      texto = generarTextoPropuestaWhatsAppSalida(cotizacionReal);
    } else if (cotizacionMock) {
      texto = generarTextoPropuestaWhatsApp(cotizacionMock);
    }
    if (!texto) return;

    void navigator.clipboard.writeText(texto).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    });
  };

  // Manejar el guardado oficial de la cotización (0c.22)
  const manejarGuardarCotizacion = async (datos: {
    contactoId: string;
    titulo: string;
    vigenteHasta?: string | undefined;
  }) => {
    setGuardandoCotizacion(true);
    setErrorGuardar(null);

    try {
      const cuerpo = armarCuerpoGuardarCotizacion({
        contactoId: datos.contactoId,
        titulo: datos.titulo,
        composicion: {
          paqueteId,
          fecha,
          adultos: pideComposicion ? adultos : 2,
          ninos: pideComposicion ? ninos : 0,
          infantes: pideComposicion ? infantes : 0,
          acomodacion: acomodacionMock || undefined,
          vigenteHasta: datos.vigenteHasta,
        },
      });

      const guardada = await guardarCotizacionApi(cuerpo);
      setModalGuardarAbierto(false);
      router.push(`/cotizaciones/${guardada.id}`);
    } catch (err) {
      const interpretado = interpretarErrorCotizaciones(err);
      setErrorGuardar(interpretado);
    } finally {
      setGuardandoCotizacion(false);
    }
  };

  // Título sugerido para el modal
  const tituloSugerido = useMemo(() => {
    return sugerirTituloCotizacion(paqueteSeleccionado?.nombre || 'Paquete', fecha);
  }, [paqueteSeleccionado, fecha]);

  // Total estimado formateado para el modal
  const totalEstimadoTexto = useMemo(() => {
    if (cotizacionReal) return formatearDinero(cotizacionReal.total);
    if (cotizacionMock) return formatearDinero(cotizacionMock.totalVenta);
    return '$ 0 COP';
  }, [cotizacionReal, cotizacionMock]);

  return (
    <div className="flex h-screen w-full bg-neutral-50 dark:bg-neutral-950">
      <BarraModulos />

      <main className="min-w-0 flex-1 overflow-y-auto pb-24 md:pb-0">
        <div className="mx-auto max-w-7xl min-w-0 space-y-6 p-3.5 pb-28 sm:p-6 md:pb-8 lg:p-8">
          {/* Cabecera de Página */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                <Calculator className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-black text-neutral-900 dark:text-white">
                  Cotizador Comercial
                </h1>
                <p className="text-xs text-neutral-500">
                  Cotización oficial por composición de grupo y tarifario vigente
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <DistintivoDatosDemo />
              <Link
                href="/catalogo"
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
              >
                <Compass className="h-4 w-4" />
                <span>Ver Salidas en Catálogo</span>
              </Link>
            </div>
          </div>

          {/* Aviso si falta tenant en desarrollo */}
          {errorTenant && <AvisoConfiguracionTenant mensajeError={errorTenant} />}

          {/* Formulario y Panel de Resultados en Grilla */}
          {/* Estado de carga inicial */}
          {cargandoSalidas && (
            <div
              data-testid="cotizador-cargando"
              className="animate-pulse space-y-4 rounded-3xl border border-neutral-200 bg-white p-8 text-center dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="mx-auto h-12 w-12 rounded-2xl bg-neutral-200 dark:bg-neutral-800" />
              <div className="mx-auto h-4 w-48 rounded bg-neutral-200 dark:bg-neutral-800" />
              <div className="mx-auto h-3 w-64 rounded bg-neutral-100 dark:bg-neutral-800" />
            </div>
          )}

          {/* Estado Vacío cuando la agencia no tiene salidas ni excursiones publicadas (T-019) */}
          {!cargandoSalidas && !errorTenant && paquetesDisponibles.length === 0 ? (
            <AvisoSinCatalogo
              pantalla="cotizador"
              testId="cotizador-estado-vacio"
              onVerDemo={() => alternarDemo()}
            />
          ) : (
            !cargandoSalidas && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Sidebar de Parámetros (4 col) */}
                <aside className="lg:col-span-4">
                  <div className="min-w-0 space-y-4 rounded-2xl border border-neutral-200 bg-white p-3.5 shadow-xs sm:p-5 dark:border-neutral-800 dark:bg-neutral-900">
                    <h2 className="text-xs font-bold tracking-wider text-neutral-500 uppercase">
                      Parámetros de Cotización
                    </h2>

                    {/* Selector de Paquete */}
                    <div>
                      <label
                        htmlFor="select-paquete-cotizador"
                        className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                      >
                        Paquete Turístico
                      </label>
                      <select
                        id="select-paquete-cotizador"
                        value={paqueteId}
                        onChange={(e) => setPaqueteId(e.target.value)}
                        className="mt-1.5 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white p-2.5 text-xs text-neutral-900 shadow-2xs focus:border-purple-600 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                      >
                        {paquetesDisponibles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre} ({p.destino})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Fecha de Salida */}
                    <div>
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="input-fecha-cotizador"
                          className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                        >
                          {paqueteSeleccionado?.noches === 0
                            ? 'Fecha de la Excursión'
                            : 'Fecha de Salida'}
                        </label>
                        {paqueteSeleccionado?.noches === 0 && (
                          <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                            Pasadía (1 día)
                          </span>
                        )}
                      </div>
                      <input
                        id="input-fecha-cotizador"
                        type="date"
                        value={fecha}
                        onChange={(e) => setFecha(e.target.value)}
                        className="mt-1.5 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white p-2.5 text-xs text-neutral-900 shadow-2xs focus:border-purple-600 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                      />
                      {fechasDelPaquete.length > 0 && (
                        <div className="mt-2">
                          <span className="text-[11px] text-neutral-400">Salidas programadas:</span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {fechasDelPaquete.map((f) => (
                              <button
                                key={f}
                                type="button"
                                onClick={() => setFecha(f)}
                                className={`flex min-h-[44px] items-center rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                                  fecha === f
                                    ? 'bg-purple-700 text-white'
                                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300'
                                }`}
                              >
                                {f}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Eje 3 de ADR-0009: Composicion de Pasajeros */}
                    <div className="border-t border-neutral-100 pt-4 dark:border-neutral-800">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                          Composición del Grupo
                        </span>
                        {!pideComposicion && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Tarifa fija por salida
                          </span>
                        )}
                      </div>

                      {!pideComposicion ? (
                        <p className="mt-2 text-[11px] text-neutral-500">
                          El tarifario vigente para este paquete no desglosa por persona; aplica
                          tarifa global de salida.
                        </p>
                      ) : (
                        <div className="mt-3 space-y-3">
                          {/* Adultos */}
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                                Adultos
                              </span>
                              <span className="block text-[10px] text-neutral-400">
                                Mayor a 12 años
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setAdultos(Math.max(1, adultos - 1))}
                                className="flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-lg border border-neutral-300 bg-white text-sm font-bold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                              >
                                -
                              </button>
                              <span className="cifra w-6 text-center text-sm font-bold text-neutral-900 dark:text-white">
                                {adultos}
                              </span>
                              <button
                                type="button"
                                onClick={() => setAdultos(adultos + 1)}
                                className="flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-lg border border-neutral-300 bg-white text-sm font-bold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
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
                              <span className="block text-[10px] text-neutral-400">
                                2 a 11 años
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setNinos(Math.max(0, ninos - 1))}
                                className="flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-lg border border-neutral-300 bg-white text-sm font-bold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                              >
                                -
                              </button>
                              <span className="cifra w-6 text-center text-sm font-bold text-neutral-900 dark:text-white">
                                {ninos}
                              </span>
                              <button
                                type="button"
                                onClick={() => setNinos(ninos + 1)}
                                className="flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-lg border border-neutral-300 bg-white text-sm font-bold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
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
                                className="flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-lg border border-neutral-300 bg-white text-sm font-bold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                              >
                                -
                              </button>
                              <span className="cifra w-6 text-center text-sm font-bold text-neutral-900 dark:text-white">
                                {infantes}
                              </span>
                              <button
                                type="button"
                                onClick={() => setInfantes(infantes + 1)}
                                className="flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-lg border border-neutral-300 bg-white text-sm font-bold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
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
                        onClick={() => alternarDemo()}
                        className="w-full text-center text-xs font-semibold text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                      >
                        Modo: {usarReal ? 'Conectado a API real' : 'Modo demostración (simulado)'}{' '}
                        (Alternar)
                      </button>
                    </div>
                  </div>
                </aside>

                {/* Panel de Resultados de la Cotización (8 col) */}
                <div className="lg:col-span-8">
                  {/* Estado de carga (Esqueleto - 0c.25) */}
                  {calculando && (
                    <div className="animate-pulse space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xs select-none dark:border-neutral-800 dark:bg-neutral-900">
                      <div className="flex items-center justify-between border-b border-neutral-100 pb-4 dark:border-neutral-800">
                        <div className="space-y-2">
                          <div className="h-4 w-48 rounded bg-neutral-200 dark:bg-neutral-700" />
                          <div className="h-3 w-32 rounded bg-neutral-100 dark:bg-neutral-800" />
                        </div>
                        <div className="h-8 w-28 rounded-xl bg-neutral-100 dark:bg-neutral-800" />
                      </div>
                      <div className="space-y-3 py-2">
                        <div className="h-3.5 w-full rounded bg-neutral-100 dark:bg-neutral-800" />
                        <div className="h-3.5 w-4/5 rounded bg-neutral-100 dark:bg-neutral-800" />
                        <div className="h-3.5 w-3/5 rounded bg-neutral-100 dark:bg-neutral-800" />
                      </div>
                      <div className="flex items-center justify-between border-t border-neutral-100 pt-4 dark:border-neutral-800">
                        <div className="h-3 w-24 rounded bg-neutral-100 dark:bg-neutral-800" />
                        <div className="h-6 w-36 rounded bg-purple-200 dark:bg-purple-900" />
                      </div>
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

                  {/* Resultado Cotización Real (0c.16.2 & 0c.22) */}
                  {!calculando && !errorMensaje && usarReal && cotizacionReal && (
                    <DesgloseCotizacionSalida
                      cotizacion={cotizacionReal}
                      copiado={copiado}
                      alCopiarWhatsApp={copiarPropuestaWhatsApp}
                      alGuardarCotizacion={() => setModalGuardarAbierto(true)}
                      guardando={guardandoCotizacion}
                    />
                  )}

                  {/* Resultado Cotización Mock (Fallback & Demostración) */}
                  {!calculando && !errorMensaje && !usarReal && cotizacionMock && (
                    <section className="space-y-6">
                      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              {paqueteSeleccionado?.noches === 0 ? (
                                <span className="rounded-md bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800 uppercase dark:bg-sky-950 dark:text-sky-300">
                                  Excursión de 1 día (Pasadía)
                                </span>
                              ) : (
                                <span className="rounded-md bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700 uppercase dark:bg-purple-950 dark:text-purple-300">
                                  Cotización de demostración
                                </span>
                              )}
                              <span className="text-xs text-neutral-400">Fecha: {fecha}</span>
                            </div>

                            <h2 className="mt-2 text-xl font-black text-neutral-900 dark:text-white">
                              {cotizacionMock.paqueteNombre}
                            </h2>

                            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-600 dark:text-neutral-400">
                              <span>📍 {cotizacionMock.destino}</span>
                              <span>
                                👥 {adultos + ninos + infantes} pasajero(s) ({adultos} adt
                                {ninos > 0 ? `, ${ninos} chd` : ''}
                                {infantes > 0 ? `, ${infantes} inf` : ''})
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col items-start sm:items-end">
                            <span className="text-xs font-bold text-neutral-500 uppercase">
                              Total Venta Sugerido
                            </span>
                            <div className="cifra mt-1 text-3xl font-black text-neutral-900 dark:text-white">
                              {formatearDinero(cotizacionMock.totalVenta)}
                            </div>
                            <span className="mt-0.5 text-[10px] text-neutral-500">
                              Tarifa calculada por persona en COP
                            </span>
                          </div>
                        </div>

                        {/* Aviso de Tasa Portuaria / Impuesto de Muelle */}
                        {requiereAvisoImpuestoMuelle(
                          cotizacionMock.destino,
                          cotizacionMock.paqueteNombre,
                        ) && (
                          <div
                            data-testid="aviso-impuesto-muelle"
                            role="note"
                            className="mt-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50/90 p-3.5 text-xs text-amber-900 shadow-2xs dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200"
                          >
                            <Ship className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                            <div>
                              <span className="font-bold">Aviso obligatorio para el viajero:</span>{' '}
                              Impuesto de muelle no incluido. La tasa portuaria se cancela
                              directamente en taquilla antes de abordar la embarcación (aprox.
                              $26.500 COP por persona en taquilla del muelle de La Bodeguita /
                              puntos de zarpe). No está incluida en el valor del tour.
                            </div>
                          </div>
                        )}

                        {/* Tabla de desglose de pasajeros */}
                        <div className="mt-6 overflow-x-auto rounded-xl border border-neutral-100 dark:border-neutral-800">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-neutral-100 bg-neutral-50 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-400">
                                <th className="px-4 py-2.5 text-left font-medium">Pasajero</th>
                                <th className="px-4 py-2.5 text-right font-medium">Cantidad</th>
                                <th className="px-4 py-2.5 text-right font-medium">
                                  Precio Unitario
                                </th>
                                <th className="px-4 py-2.5 text-right font-medium">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
                              {cotizacionMock.lineas.map((linea) => (
                                <tr key={linea.tipoPasajero}>
                                  <td className="px-4 py-3 font-bold text-neutral-800 dark:text-neutral-200">
                                    {linea.tipoPasajero === 'ADT'
                                      ? 'Adulto (Mayor de 12 años)'
                                      : linea.tipoPasajero === 'CHD'
                                        ? 'Niño (Menor)'
                                        : 'Infante'}
                                  </td>
                                  <td className="cifra px-4 py-3 text-right font-semibold text-neutral-700 dark:text-neutral-300">
                                    {linea.cantidad}x
                                  </td>
                                  <td className="cifra px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">
                                    {formatearDinero(linea.precioUnitarioVenta)}
                                  </td>
                                  <td className="cifra px-4 py-3 text-right font-bold text-neutral-900 dark:text-white">
                                    {formatearDinero(linea.subtotalVenta)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-neutral-200 bg-neutral-50/80 font-bold dark:border-neutral-700 dark:bg-neutral-800/60">
                                <td
                                  colSpan={3}
                                  className="px-4 py-3 text-right text-neutral-800 dark:text-neutral-200"
                                >
                                  Total Cotización:
                                </td>
                                <td className="cifra text-acento-600 dark:text-acento-400 px-4 py-3 text-right text-base">
                                  {formatearDinero(cotizacionMock.totalVenta)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>

                        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                          <button
                            type="button"
                            onClick={() => setModalGuardarAbierto(true)}
                            disabled={guardandoCotizacion}
                            className="flex min-h-[44px] items-center gap-2 rounded-xl bg-purple-700 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-purple-800"
                          >
                            <Bookmark className="h-4 w-4" />
                            <span>Guardar Cotización Oficial</span>
                          </button>
                          <button
                            type="button"
                            onClick={copiarPropuestaWhatsApp}
                            className="bg-ok-600 hover:bg-ok-700 flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-colors"
                          >
                            {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            <span>
                              {copiado ? '¡Copiado al portapapeles!' : 'Copiar para WhatsApp'}
                            </span>
                          </button>
                        </div>
                      </div>
                    </section>
                  )}
                </div>
              </div>
            )
          )}
        </div>

        {/* Modal Guardar Cotización (0c.22) */}
        <ModalGuardarCotizacion
          abierto={modalGuardarAbierto}
          alCerrar={() => setModalGuardarAbierto(false)}
          alConfirmar={manejarGuardarCotizacion}
          guardando={guardandoCotizacion}
          error={errorGuardar}
          tituloSugerido={tituloSugerido}
          contactoIdInicial={contactoIdInicial}
          contactosDisponibles={contactosDisponibles}
          paqueteNombre={paqueteSeleccionado?.nombre || 'Paquete Turístico'}
          fechaSalida={fecha}
          adultos={adultos}
          ninos={ninos}
          infantes={infantes}
          totalEstimadoFormateado={totalEstimadoTexto}
        />
      </main>
    </div>
  );
}

export default function Cotizador() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-neutral-50 p-6 select-none dark:bg-neutral-950">
          <div className="h-full w-full max-w-5xl animate-pulse rounded-2xl border border-neutral-200 bg-white p-8 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="h-6 w-48 rounded bg-neutral-200 dark:bg-neutral-700" />
            <div className="mt-4 h-4 w-96 rounded bg-neutral-100 dark:bg-neutral-800" />
          </div>
        </div>
      }
    >
      <ContenidoCotizador />
    </Suspense>
  );
}
