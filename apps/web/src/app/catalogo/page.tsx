'use client';

import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import type { PlanAlimentacion } from '@viajapro/contracts';
import { BarraModulos } from '../../components/bandeja/barra-modulos';
import { DistintivoDatosDemo } from '../../components/comun/distintivo-datos-demo';
import { FichaDetallePaquete } from '../../components/catalogo/ficha-detalle-paquete';
import {
  MOCK_PAQUETES_CATALOGO,
  MOCK_MAYORISTAS,
  type PaqueteConDetalle,
} from '../../lib/mock-catalogo';
import {
  filtrarPaquetes,
  obtenerPrecioDesde,
  verificarVigenciaTarifario,
} from '../../lib/catalogo-logica';
import { formatearDinero } from '../../lib/api';

export default function CatalogoPage() {
  const [busqueda, setBusqueda] = useState('');
  const [planFiltro, setPlanFiltro] = useState<PlanAlimentacion | 'TODOS'>('TODOS');
  const [destinoFiltro, setDestinoFiltro] = useState<string>('TODOS');
  const [soloVigentes, setSoloVigentes] = useState<boolean>(true);
  const [paqueteSeleccionado, setPaqueteSeleccionado] = useState<PaqueteConDetalle | null>(null);

  // Lista de destinos únicos para el selector
  const destinosDisponibles = useMemo(() => {
    const setDestinos = new Set(MOCK_PAQUETES_CATALOGO.map((p) => p.destino));
    return Array.from(setDestinos).sort();
  }, []);

  // Paquetes filtrados
  const paquetesFiltrados = useMemo(() => {
    return filtrarPaquetes(MOCK_PAQUETES_CATALOGO, {
      busqueda,
      planAlimentacion: planFiltro,
      destino: destinoFiltro,
      soloVigentes,
    });
  }, [busqueda, planFiltro, destinoFiltro, soloVigentes]);

  // Métricas
  const totalPaquetes = MOCK_PAQUETES_CATALOGO.length;
  const paquetesVigentes = useMemo(() => {
    return MOCK_PAQUETES_CATALOGO.filter(
      (p) => verificarVigenciaTarifario(p.temporadas).estaVigente,
    ).length;
  }, []);

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
                  <Package className="h-5 w-5" />
                </span>
                <h1 className="text-xl font-bold text-neutral-900 dark:text-white">
                  Catálogo de Paquetes y Tarifarios
                </h1>
                <DistintivoDatosDemo visible={true} />
              </div>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Planes prearmados de mayoristas aliados. Precios verificados con vigencia de
                temporadas y enlace directo al cotizador.
              </p>
            </div>

            {/* Acciones de cabecera */}
            <div className="flex items-center gap-3">
              <Link
                href="/cotizador"
                className="bg-acento-600 hover:bg-acento-700 flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors"
              >
                <Compass className="h-4 w-4" />
                Ir al Cotizador
              </Link>
            </div>
          </div>

          {/* Tarjetas de Métricas Rápidas */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-800/40">
              <div className="text-xs text-neutral-500 dark:text-neutral-400">Total Paquetes</div>
              <div className="cifra mt-1 text-xl font-bold text-neutral-900 dark:text-white">
                {totalPaquetes}
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <div className="text-xs text-emerald-800 dark:text-emerald-300">
                Tarifarios Vigentes
              </div>
              <div className="cifra mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-400">
                {paquetesVigentes}
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-800/40">
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Mayoristas Aliados
              </div>
              <div className="cifra mt-1 text-xl font-bold text-neutral-900 dark:text-white">
                {MOCK_MAYORISTAS.length}
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-800/40">
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Destinos Disponibles
              </div>
              <div className="cifra mt-1 text-xl font-bold text-neutral-900 dark:text-white">
                {destinosDisponibles.length}
              </div>
            </div>
          </div>
        </header>

        {/* Barra de Filtros */}
        <section className="border-b border-neutral-200 bg-white px-6 py-3 dark:border-neutral-800 dark:bg-neutral-900/50">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* Buscador */}
            <div className="relative max-w-md flex-1">
              <Search className="absolute top-2.5 left-3 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por destino, nombre, mayorista o inclusión..."
                className="focus:border-acento-500 focus:ring-acento-500/20 w-full rounded-lg border border-neutral-300 bg-neutral-50 py-2 pr-4 pl-9 text-xs text-neutral-900 transition-colors focus:ring-2 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>

            {/* Selectores */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Filtro Destino */}
              <select
                value={destinoFiltro}
                onChange={(e) => setDestinoFiltro(e.target.value)}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              >
                <option value="TODOS">Todos los destinos</option>
                {destinosDisponibles.map((dest) => (
                  <option key={dest} value={dest}>
                    {dest}
                  </option>
                ))}
              </select>

              {/* Filtro Plan Alimentación */}
              <select
                value={planFiltro}
                onChange={(e) => setPlanFiltro(e.target.value as PlanAlimentacion | 'TODOS')}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              >
                <option value="TODOS">Todos los planes</option>
                <option value="TODO_INCLUIDO">Todo Incluido</option>
                <option value="DESAYUNO">Solo Desayuno</option>
                <option value="MEDIA_PENSION">Media Pensión</option>
                <option value="PENSION_COMPLETA">Pensión Completa</option>
                <option value="SIN_ALIMENTACION">Sin Alimentación</option>
              </select>

              {/* Toggle Solo Vigentes */}
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700 select-none dark:border-neutral-800 dark:bg-neutral-800/80 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={soloVigentes}
                  onChange={(e) => setSoloVigentes(e.target.checked)}
                  className="text-acento-600 rounded border-neutral-300 focus:ring-0 dark:border-neutral-600"
                />
                <span>Solo tarifas vigentes</span>
              </label>
            </div>
          </div>
        </section>

        {/* Grid de Paquetes */}
        <section className="flex-1 p-6">
          {paquetesFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center dark:border-neutral-800 dark:bg-neutral-900">
              <Package className="h-10 w-10 text-neutral-400" />
              <h3 className="mt-3 text-sm font-semibold text-neutral-900 dark:text-white">
                No se encontraron paquetes
              </h3>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                No hay resultados para los filtros seleccionados. Intenta restablecer los términos
                de búsqueda o desmarcar «Solo tarifas vigentes».
              </p>
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
                        {/* Indicador de Vigencia */}
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

                        {/* Mayorista Time Limit */}
                        {paquete.mayorista?.diasTimeLimit !== null &&
                          paquete.mayorista?.diasTimeLimit !== undefined && (
                            <div className="flex items-center gap-1 text-[11px] text-amber-800 dark:text-amber-400">
                              <Clock className="h-3 w-3" />
                              <span>
                                Time limit mayorista: {paquete.mayorista.diasTimeLimit} días
                              </span>
                            </div>
                          )}

                        {/* Inclusiones destacadas */}
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
                            <span className="block text-[10px] text-neutral-400">por persona</span>
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
        </section>
      </main>

      {/* 3. Modal / Drawer Ficha Detalle Paquete */}
      <FichaDetallePaquete
        paquete={paqueteSeleccionado}
        alCerrar={() => setPaqueteSeleccionado(null)}
      />
    </div>
  );
}
