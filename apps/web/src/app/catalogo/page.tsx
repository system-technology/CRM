'use client';

import { useModoDemo } from '../../lib/modo-demo';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Package,
  Search,
  Building2,
  Clock,
  Compass,
  CheckCircle2,
  AlertTriangle,
  Eye,
  MapPin,
  Utensils,
  Calendar,
} from 'lucide-react';
import type {
  PlanAlimentacion,
  SalidaPublicada,
  ResumenDePaqueteGestion,
} from '@viajapro/contracts';
import { BarraModulos } from '../../components/bandeja/barra-modulos';
import { DistintivoDatosDemo } from '../../components/comun/distintivo-datos-demo';
import { EsqueletoGridTarjetas, AvisoErrorAccionable } from '../../components/comun/esqueletos';
import {
  construirMensajeErrorAccionable,
  formatearErrorAmigable,
} from '../../lib/estados-ui-logica';
import { AvisoConfiguracionTenant } from '../../components/crm/aviso-configuracion-tenant';
import { FichaDetallePaquete } from '../../components/catalogo/ficha-detalle-paquete';
import { TarjetaSalidaPublicada } from '../../components/catalogo/tarjeta-salida-publicada';
import { TablaGestionCatalogo } from '../../components/catalogo/tabla-gestion-catalogo';
import { ModalFormularioPaquete } from '../../components/catalogo/modal-formulario-paquete';
import { DialogoDesactivarPaquete } from '../../components/catalogo/dialogo-desactivar-paquete';
import { MOCK_PAQUETES_CATALOGO, type PaqueteConDetalle } from '../../lib/mock-catalogo';
import {
  filtrarPaquetes,
  obtenerPrecioDesde,
  verificarVigenciaTarifario,
  extraerDestinosDeSalidas,
  filtrarSalidasPublicadas,
} from '../../lib/catalogo-logica';
import {
  estaUsandoCatalogoReal,
  listarSalidasApi,
  listarPaquetesGestionApi,
  crearPaqueteApi,
  editarPaqueteApi,
  desactivarPaqueteApi,
} from '../../lib/catalogo-api';
import {
  type FormularioPaqueteValores,
  validarFormularioCrearPaquete,
  validarFormularioEditarPaquete,
} from '../../lib/catalogo-gestion-logica';
import { formatearDinero } from '../../lib/api';

export default function CatalogoPage() {
  const { esDemo } = useModoDemo();
  const modoRealActivo = !esDemo && estaUsandoCatalogoReal();
  const [usarReal, setUsarReal] = useState(() => modoRealActivo);

  useEffect(() => {
    setUsarReal(modoRealActivo);
  }, [modoRealActivo]);
  const [salidasReales, setSalidasReales] = useState<SalidaPublicada[]>([]);
  const [cargando, setCargando] = useState(false);
  const [errorTenant, setErrorTenant] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [planFiltro, setPlanFiltro] = useState<PlanAlimentacion | 'TODOS'>('TODOS');
  const [destinoFiltro, setDestinoFiltro] = useState<string>('TODOS');
  const [soloVigentes, setSoloVigentes] = useState<boolean>(true);
  const [paqueteSeleccionado, setPaqueteSeleccionado] = useState<PaqueteConDetalle | null>(null);

  // Pestaña activa: 'EXPLORAR' o 'GESTION' (T-031)
  const [pestanaActiva, setPestanaActiva] = useState<'EXPLORAR' | 'GESTION'>('EXPLORAR');

  // Estado para gestión del catálogo (T-031)
  const [paquetesGestion, setPaquetesGestion] = useState<ResumenDePaqueteGestion[]>([]);
  const [cargandoGestion, setCargandoGestion] = useState(false);
  const [modalPaqueteAbierto, setModalPaqueteAbierto] = useState(false);
  const [paqueteAEditar, setPaqueteAEditar] = useState<ResumenDePaqueteGestion | null>(null);
  const [dialogoDesactivarAbierto, setDialogoDesactivarAbierto] = useState(false);
  const [paqueteADesactivar, setPaqueteADesactivar] = useState<ResumenDePaqueteGestion | null>(
    null,
  );
  const [desactivando, setDesactivando] = useState(false);

  const cargarGestion = useCallback(() => {
    setCargandoGestion(true);
    listarPaquetesGestionApi({ incluirInactivos: true })
      .then((res) => {
        setPaquetesGestion(res.datos);
      })
      .catch((err) => {
        console.error('Error cargando gestión de catálogo:', err);
      })
      .finally(() => {
        setCargandoGestion(false);
      });
  }, []);

  useEffect(() => {
    cargarGestion();
  }, [cargarGestion, usarReal]);

  async function handleGuardarPaquete(valores: FormularioPaqueteValores, idEdicion?: string) {
    if (idEdicion) {
      const validado = validarFormularioEditarPaquete(valores);
      if (validado.exito) {
        await editarPaqueteApi(idEdicion, validado.datos);
      }
    } else {
      const validado = validarFormularioCrearPaquete(valores);
      if (validado.exito) {
        await crearPaqueteApi(validado.datos);
      }
    }
    cargarGestion();
  }

  async function handleConfirmarDesactivar(id: string) {
    try {
      setDesactivando(true);
      await desactivarPaqueteApi(id);
      setDialogoDesactivarAbierto(false);
      setPaqueteADesactivar(null);
      cargarGestion();
    } finally {
      setDesactivando(false);
    }
  }

  // Carga de salidas reales si el interruptor está activo (0c.16.1)
  useEffect(() => {
    if (!usarReal) return;

    setCargando(true);
    setErrorTenant(null);

    // Salidas a partir de octubre de 2026 (campaña del tarifario)
    listarSalidasApi({ desde: '2026-10-01' })
      .then((salidas) => {
        setSalidasReales(salidas);
        setErrorTenant(null);
      })
      .catch((err) => {
        console.error('Error cargando salidas reales:', err);
        setErrorTenant(
          formatearErrorAmigable(err, 'No fue posible conectar con el catálogo de salidas.'),
        );
      })
      .finally(() => {
        setCargando(false);
      });
  }, [usarReal]);

  // Destinos únicos según la fuente activa
  const destinosDisponibles = useMemo(() => {
    if (usarReal && !errorTenant && salidasReales.length > 0) {
      return extraerDestinosDeSalidas(salidasReales);
    }
    const setDestinos = new Set(MOCK_PAQUETES_CATALOGO.map((p) => p.destino));
    return Array.from(setDestinos).sort();
  }, [usarReal, errorTenant, salidasReales]);

  // Salidas reales filtradas
  const salidasFiltradas = useMemo(() => {
    if (!usarReal || errorTenant) return [];
    return filtrarSalidasPublicadas(salidasReales, {
      busqueda,
      destino: destinoFiltro,
    });
  }, [usarReal, errorTenant, salidasReales, busqueda, destinoFiltro]);

  // Paquetes mock filtrados
  const paquetesFiltrados = useMemo(() => {
    return filtrarPaquetes(MOCK_PAQUETES_CATALOGO, {
      busqueda,
      planAlimentacion: planFiltro,
      destino: destinoFiltro,
      soloVigentes,
    });
  }, [busqueda, planFiltro, destinoFiltro, soloVigentes]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-neutral-50 dark:bg-neutral-950">
      {/* 1. Barra de Módulos */}
      <BarraModulos />

      {/* 2. Área Principal */}
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto pb-24 md:pb-0">
        {/* Cabecera */}
        <header className="border-b border-neutral-200 bg-white px-3.5 py-3.5 sm:px-6 sm:py-5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-acento-100 text-acento-800 dark:bg-acento-950 dark:text-acento-300 rounded-lg p-1.5">
                  <Package className="h-5 w-5" />
                </span>
                <h1 className="text-base font-bold break-words text-neutral-900 sm:text-xl dark:text-white">
                  {usarReal && !errorTenant
                    ? 'Salidas y Catálogo de Tarifas'
                    : 'Catálogo de Paquetes y Tarifarios'}
                </h1>
                {/* 0c.14 y 0c.16: solo visible si usamos datos simulados o hay error de tenant */}
                <DistintivoDatosDemo visible={!usarReal || !!errorTenant} />
              </div>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {usarReal && !errorTenant
                  ? `Salidas programadas y tarifas reales (Agencias André's Tours — ${salidasReales.length} salidas)`
                  : 'Tarifarios oficiales para cotización rápida de viajes y excursiones'}
              </p>
            </div>

            {/* Acciones principales */}
            <div className="flex items-center gap-2">
              <Link
                href="/cotizador"
                className="bg-acento-600 hover:bg-acento-700 flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition-colors"
              >
                <Compass className="h-4 w-4" />
                Ir al Cotizador
              </Link>
            </div>
            {/* Selector de Pestañas: Explorar vs Gestión (T-031) */}
            <div className="mt-4 flex flex-wrap items-center gap-1 rounded-xl border border-neutral-200 bg-neutral-100 p-1 dark:border-neutral-800 dark:bg-neutral-800">
              <button
                type="button"
                onClick={() => setPestanaActiva('EXPLORAR')}
                data-testid="tab-explorar-catalogo"
                className={`flex min-h-[36px] items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors ${
                  pestanaActiva === 'EXPLORAR'
                    ? 'bg-white text-neutral-900 shadow-2xs dark:bg-neutral-700 dark:text-white'
                    : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>Explorar salidas y tarifas</span>
              </button>
              <button
                type="button"
                onClick={() => setPestanaActiva('GESTION')}
                data-testid="tab-gestion-catalogo"
                className={`flex min-h-[36px] items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors ${
                  pestanaActiva === 'GESTION'
                    ? 'bg-white text-teal-800 shadow-2xs dark:bg-neutral-700 dark:text-teal-300'
                    : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                }`}
              >
                <Package className="h-3.5 w-3.5" />
                <span>Gestión de productos ({paquetesGestion.length})</span>
              </button>
            </div>
          </div>

          {/* Filtros y Búsqueda (solo en vista Explorar) */}
          {pestanaActiva === 'EXPLORAR' && (
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
              {/* Buscador */}
              <div className="relative">
                <Search className="absolute top-2.5 left-3 h-4 w-4 text-neutral-400" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por destino o nombre..."
                  className="focus:border-acento-500 focus:ring-acento-500 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white py-2.5 pr-3 pl-9 text-xs text-neutral-900 placeholder-neutral-400 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              {/* Selector de Destino */}
              <div>
                <select
                  value={destinoFiltro}
                  onChange={(e) => setDestinoFiltro(e.target.value)}
                  className="focus:border-acento-500 focus:ring-acento-500 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-xs text-neutral-700 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                >
                  <option value="TODOS">Todos los destinos ({destinosDisponibles.length})</option>
                  {destinosDisponibles.map((dest) => (
                    <option key={dest} value={dest}>
                      {dest}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro de Plan / Tipo */}
              {!usarReal && (
                <div>
                  <select
                    value={planFiltro}
                    onChange={(e) => setPlanFiltro(e.target.value as PlanAlimentacion | 'TODOS')}
                    className="focus:border-acento-500 focus:ring-acento-500 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-xs text-neutral-700 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                  >
                    <option value="TODOS">Todo tipo de plan</option>
                    <option value="SOLO_DESAYUNO">Solo Desayuno</option>
                    <option value="MEDIA_PENSION">Media Pensión</option>
                    <option value="PENSION_COMPLETA">Pensión Completa</option>
                    <option value="TODO_INCLUIDO">Todo Incluido</option>
                    <option value="SIN_ALIMENTACION">Sin Alimentación</option>
                  </select>
                </div>
              )}

              {/* Interruptor modo Real / Demo para depuración o contingencia */}
              <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 sm:col-span-1 dark:border-neutral-800 dark:bg-neutral-900">
                <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  {usarReal ? 'Conectado a API real' : 'Datos simulados'}
                </span>
                <button
                  type="button"
                  onClick={() => setUsarReal(!usarReal)}
                  className="text-acento-600 hover:text-acento-700 dark:text-acento-400 flex min-h-[44px] items-center px-2 py-2 text-xs font-semibold"
                >
                  {usarReal ? 'Cambiar a Demo' : 'Probar API Real'}
                </button>
              </div>
            </div>
          )}
        </header>

        {/* Contenido */}
        <section className="min-w-0 flex-1 p-3.5 pb-24 sm:p-6 md:pb-6">
          {pestanaActiva === 'GESTION' ? (
            <TablaGestionCatalogo
              paquetes={paquetesGestion}
              alCrear={() => {
                setPaqueteAEditar(null);
                setModalPaqueteAbierto(true);
              }}
              alEditar={(p) => {
                setPaqueteAEditar(p);
                setModalPaqueteAbierto(true);
              }}
              alDesactivar={(p) => {
                setPaqueteADesactivar(p);
                setDialogoDesactivarAbierto(true);
              }}
              cargando={cargandoGestion}
            />
          ) : (
            <>
              {/* Error de configuración de tenant o red en modo API real */}
              {usarReal && errorTenant && (
                <div className="mb-6">
                  {errorTenant.includes('DEV_TENANT_ID') || errorTenant.includes('SIN_SESION') ? (
                    <AvisoConfiguracionTenant
                      onContinuarConDemo={() => {
                        setUsarReal(false);
                        setErrorTenant(null);
                      }}
                    />
                  ) : (
                    <AvisoErrorAccionable
                      error={construirMensajeErrorAccionable(errorTenant, 'CATALOGO_SALIDAS')}
                      onReintentar={() => {
                        setCargando(true);
                        listarSalidasApi({ desde: '2026-10-01' })
                          .then((salidas) => {
                            setSalidasReales(salidas);
                            setErrorTenant(null);
                          })
                          .catch((err) => {
                            setErrorTenant(
                              formatearErrorAmigable(
                                err,
                                'No se pudo cotizar la salida en este momento.',
                              ),
                            );
                          })
                          .finally(() => setCargando(false));
                      }}
                      onAccionSecundaria={() => {
                        setUsarReal(false);
                        setErrorTenant(null);
                      }}
                      etiquetaSecundaria="Cambiar a Datos Demo"
                    />
                  )}
                </div>
              )}

              {/* Estado de carga */}
              {cargando ? (
                <EsqueletoGridTarjetas cantidad={6} />
              ) : usarReal && !errorTenant ? (
                /* LISTADO REAL DE SALIDAS PUBLICADAS (0c.16.1) */
                salidasFiltradas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 py-16 text-center dark:border-neutral-800">
                    <Calendar className="h-10 w-10 text-neutral-400" />
                    <h3 className="mt-3 text-sm font-bold text-neutral-800 dark:text-white">
                      No se encontraron salidas para este criterio
                    </h3>
                    <p className="mt-1 text-xs text-neutral-500">
                      Prueba ajustando el término de búsqueda o seleccionando otro destino.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setBusqueda('');
                        setDestinoFiltro('TODOS');
                      }}
                      className="text-acento-600 hover:text-acento-700 mt-4 text-xs font-semibold"
                    >
                      Restablecer todos los filtros
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {salidasFiltradas.map((salida) => (
                      <TarjetaSalidaPublicada key={salida.vigenciaId} salida={salida} />
                    ))}
                  </div>
                )
              ) : /* LISTADO MOCK (MODO SIMULADO O FALLBACK) */
              paquetesFiltrados.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 py-16 text-center dark:border-neutral-800">
                  <Package className="h-10 w-10 text-neutral-400" />
                  <h3 className="mt-3 text-sm font-bold text-neutral-800 dark:text-white">
                    No se encontraron paquetes para este criterio
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setBusqueda('');
                      setPlanFiltro('TODOS');
                      setDestinoFiltro('TODOS');
                      setSoloVigentes(false);
                    }}
                    className="text-acento-600 hover:text-acento-700 mt-4 text-xs font-semibold"
                  >
                    Restablecer todos los filtros
                  </button>
                </div>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {paquetesFiltrados.map((paquete) => {
                    const precioDesde = obtenerPrecioDesde(paquete);
                    const vigencia = verificarVigenciaTarifario(paquete.temporadas);

                    return (
                      <article
                        key={paquete.id}
                        className="flex flex-col justify-between overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
                      >
                        <div>
                          {/* Cabecera de la tarjeta */}
                          <div className="border-b border-neutral-100 bg-neutral-50/70 p-4 dark:border-neutral-800/80 dark:bg-neutral-800/30">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1 rounded-full bg-neutral-200/80 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                                <MapPin className="h-3 w-3" />
                                {paquete.destino}
                              </span>
                              <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                                {paquete.dias}D / {paquete.noches}N
                              </span>
                            </div>

                            <h3 className="mt-3 line-clamp-2 text-sm font-bold text-neutral-900 dark:text-white">
                              {paquete.nombre}
                            </h3>

                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                              <span className="flex items-center gap-1 rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                                <Utensils className="h-3 w-3 text-neutral-400" />
                                {paquete.planAlimentacion.replace(/_/g, ' ')}
                              </span>

                              {paquete.mayorista && (
                                <span className="flex items-center gap-1 rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                                  <Building2 className="h-3 w-3 text-neutral-400" />
                                  {paquete.mayorista.nombre}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Cuerpo de la tarjeta */}
                          <div className="space-y-3 p-4">
                            {vigencia.estaVigente ? (
                              <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">
                                  Vigente hasta {vigencia.proximoVencimiento}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-400">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                <span>Tarifario vencido</span>
                              </div>
                            )}

                            {paquete.mayorista?.diasTimeLimit !== null &&
                              paquete.mayorista?.diasTimeLimit !== undefined && (
                                <div className="flex items-center gap-1 text-[11px] text-amber-800 dark:text-amber-400">
                                  <Clock className="h-3 w-3" />
                                  <span>
                                    Time limit mayorista: {paquete.mayorista.diasTimeLimit} días
                                  </span>
                                </div>
                              )}

                            <div>
                              <div className="text-[11px] font-semibold text-neutral-400 uppercase">
                                Inclusiones destacadas:
                              </div>
                              <ul className="mt-1 space-y-1 text-xs text-neutral-600 dark:text-neutral-300">
                                {paquete.inclusiones.slice(0, 2).map((inc, i) => (
                                  <li key={i} className="flex items-center gap-1.5 truncate">
                                    <span className="h-1 w-1 rounded-full bg-neutral-400" />
                                    <span className="truncate">{inc}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>

                        {/* Pie de tarjeta con precio y botones */}
                        <div className="border-t border-neutral-100 bg-neutral-50/50 p-4 dark:border-neutral-800/80 dark:bg-neutral-800/20">
                          <div className="mb-3 flex items-baseline justify-between">
                            <span className="text-xs text-neutral-500 dark:text-neutral-400">
                              Tarifa desde:
                            </span>
                            {precioDesde ? (
                              <div className="text-right">
                                <span className="cifra text-base font-extrabold text-neutral-900 dark:text-white">
                                  {formatearDinero(precioDesde)}
                                </span>
                                <span className="block text-[10px] text-neutral-400">
                                  por persona
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-neutral-400">A consultar</span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPaqueteSeleccionado(paquete)}
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-300 bg-white py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Ver tarifario
                            </button>

                            <Link
                              href="/cotizador"
                              className="bg-acento-600 hover:bg-acento-700 flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold text-white shadow-xs transition-colors"
                            >
                              <Compass className="h-3.5 w-3.5" />
                              Cotizar
                            </Link>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {/* 3. Modal / Drawer Ficha Detalle Paquete (Mock) */}
      <FichaDetallePaquete
        paquete={paqueteSeleccionado}
        alCerrar={() => setPaqueteSeleccionado(null)}
      />

      {/* 4. Modales de Gestión del Catálogo (T-031) */}
      <ModalFormularioPaquete
        abierto={modalPaqueteAbierto}
        alCerrar={() => {
          setModalPaqueteAbierto(false);
          setPaqueteAEditar(null);
        }}
        alGuardar={handleGuardarPaquete}
        paqueteAEditar={paqueteAEditar}
      />

      <DialogoDesactivarPaquete
        abierto={dialogoDesactivarAbierto}
        paquete={paqueteADesactivar}
        alCerrar={() => {
          setDialogoDesactivarAbierto(false);
          setPaqueteADesactivar(null);
        }}
        alConfirmar={handleConfirmarDesactivar}
        cargando={desactivando}
      />
    </div>
  );
}
