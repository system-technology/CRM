'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { Package, Search, Compass, Calendar } from 'lucide-react';
import type { PlanAlimentacion, SalidaPublicada } from '@viajapro/contracts';
import { useModoDemo } from '../../lib/modo-demo';
import { BarraModulos } from '../../components/bandeja/barra-modulos';
import { DistintivoDatosDemo } from '../../components/comun/distintivo-datos-demo';
import { EsqueletoGridTarjetas, AvisoErrorAccionable } from '../../components/comun/esqueletos';
import {
  construirMensajeErrorAccionable,
  formatearErrorAmigable,
} from '../../lib/estados-ui-logica';
import { AvisoConfiguracionTenant } from '../../components/crm/aviso-configuracion-tenant';
import { FichaDetallePaquete } from '../../components/catalogo/ficha-detalle-paquete';
import { TarjetaExcursionCatalogo } from '../../components/catalogo/tarjeta-excursion-catalogo';
import { FichaDetalleExcursion } from '../../components/catalogo/ficha-detalle-excursion';
import { MOCK_PAQUETES_CATALOGO, type PaqueteConDetalle } from '../../lib/mock-catalogo';
import {
  filtrarPaquetes,
  obtenerPrecioDesde,
  verificarVigenciaTarifario,
  extraerDestinosDeSalidas,
  filtrarSalidasPublicadas,
  agruparSalidasPorProducto,
  detectarTipoTurismo,
  formatearHorarioExcursion,
  requiereAvisoImpuestoMuelle,
  obtenerEtiquetaPrecio,
  type ProductoCatalogoAgrupado,
} from '../../lib/catalogo-logica';
import { estaUsandoCatalogoReal, listarSalidasApi } from '../../lib/catalogo-api';

function adaptarPaqueteConDetalleAProducto(paquete: PaqueteConDetalle): ProductoCatalogoAgrupado {
  const precioDesde = obtenerPrecioDesde(paquete);
  const _vigencia = verificarVigenciaTarifario(paquete.temporadas);
  const reqMuelle = requiereAvisoImpuestoMuelle(paquete.destino, paquete.nombre);

  // Generar salidas de muestra para el paquete
  const salidas = [
    {
      vigenciaId: `${paquete.id}-s1`,
      fecha: '2026-10-03',
      etiquetaFecha: 'sáb 3 oct',
      cupoTotal: 12,
      etiquetaCupo: '12 cupos',
      estadoCupo: 'DISPONIBLE' as const,
      desde: precioDesde ?? { unidades: '0', moneda: 'COP' as const },
      desdeEsDeGrupo: false,
    },
    {
      vigenciaId: `${paquete.id}-s2`,
      fecha: '2026-10-04',
      etiquetaFecha: 'dom 4 oct',
      cupoTotal: 4,
      etiquetaCupo: 'quedan 4',
      estadoCupo: 'ULTIMOS_CUPOS' as const,
      desde: precioDesde ?? { unidades: '0', moneda: 'COP' as const },
      desdeEsDeGrupo: false,
    },
    {
      vigenciaId: `${paquete.id}-s3`,
      fecha: '2026-10-10',
      etiquetaFecha: 'sáb 10 oct',
      cupoTotal: 0,
      etiquetaCupo: 'Agotado',
      estadoCupo: 'AGOTADO' as const,
      desde: precioDesde ?? { unidades: '0', moneda: 'COP' as const },
      desdeEsDeGrupo: false,
    },
  ];

  return {
    paqueteId: paquete.id,
    nombre: paquete.nombre,
    destino: paquete.destino,
    noches: paquete.noches,
    dias: paquete.dias,
    tipoTurismo: detectarTipoTurismo(paquete.destino, paquete.nombre),
    horario: formatearHorarioExcursion(
      paquete.noches,
      paquete.nombre,
      paquete.descripcion ?? undefined,
    ),
    inclusiones: paquete.inclusiones,
    exclusiones: paquete.exclusiones,
    descripcion: paquete.descripcion,
    requiereImpuestoMuelle: reqMuelle,
    precioDesde,
    precioEtiqueta: obtenerEtiquetaPrecio(precioDesde),
    tienePromo: paquete.temporadas.length > 1,
    desdeEsDeGrupo: false,
    salidas,
  };
}

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

  // Ficha seleccionada
  const [productoSeleccionado, setProductoSeleccionado] = useState<ProductoCatalogoAgrupado | null>(
    null,
  );
  const [paqueteMockSeleccionado, setPaqueteMockSeleccionado] = useState<PaqueteConDetalle | null>(
    null,
  );

  // Carga de salidas reales si el interruptor está activo
  useEffect(() => {
    if (!usarReal) return;

    setCargando(true);
    setErrorTenant(null);

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

  // Salidas reales filtradas y agrupadas por producto
  const productosRealesAgrupados = useMemo(() => {
    if (!usarReal || errorTenant) return [];
    const filtradas = filtrarSalidasPublicadas(salidasReales, {
      busqueda,
      destino: destinoFiltro,
    });
    return agruparSalidasPorProducto(filtradas);
  }, [usarReal, errorTenant, salidasReales, busqueda, destinoFiltro]);

  // Paquetes mock adaptados y filtrados
  const productosMockAgrupados = useMemo(() => {
    const filtrados = filtrarPaquetes(MOCK_PAQUETES_CATALOGO, {
      busqueda,
      planAlimentacion: planFiltro,
      destino: destinoFiltro,
      soloVigentes,
    });
    return filtrados.map(adaptarPaqueteConDetalleAProducto);
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
                  Catálogo de Excursiones y Tours
                </h1>
                <DistintivoDatosDemo visible={!usarReal || !!errorTenant} />
              </div>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {usarReal && !errorTenant
                  ? `Catálogo oficial de la agencia — ${salidasReales.length} salidas programadas`
                  : 'Tarifarios y excursiones para cotización rápida en WhatsApp'}
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
          </div>

          {/* Filtros y Búsqueda */}
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            {/* Buscador */}
            <div className="relative">
              <Search className="absolute top-2.5 left-3 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar tour por destino o nombre..."
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
        </header>

        {/* Contenido */}
        <section className="min-w-0 flex-1 p-3.5 pb-24 sm:p-6 md:pb-6">
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
            /* LISTADO REAL DE PRODUCTOS Y SALIDAS (T-018) */
            productosRealesAgrupados.length === 0 ? (
              <div
                data-testid="catalogo-estado-vacio"
                className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 py-16 text-center dark:border-neutral-800"
              >
                <Calendar className="h-10 w-10 text-neutral-400" />
                <h3 className="mt-3 text-sm font-bold text-neutral-800 dark:text-white">
                  No se encontraron excursiones para este criterio
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
                {productosRealesAgrupados.map((producto) => (
                  <TarjetaExcursionCatalogo
                    key={producto.paqueteId}
                    producto={producto}
                    alSeleccionar={setProductoSeleccionado}
                  />
                ))}
              </div>
            )
          ) : /* LISTADO MOCK (MODO SIMULADO O FALLBACK) */
          productosMockAgrupados.length === 0 ? (
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
              {productosMockAgrupados.map((producto) => (
                <TarjetaExcursionCatalogo
                  key={producto.paqueteId}
                  producto={producto}
                  alSeleccionar={setProductoSeleccionado}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* 3. Modal Ficha Detalle Excursión (T-018) */}
      <FichaDetalleExcursion
        producto={productoSeleccionado}
        alCerrar={() => setProductoSeleccionado(null)}
      />

      {/* 4. Modal Legacy Ficha Detalle Paquete (Mock) */}
      <FichaDetallePaquete
        paquete={paqueteMockSeleccionado}
        alCerrar={() => setPaqueteMockSeleccionado(null)}
      />
    </div>
  );
}
