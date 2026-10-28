'use client';

import React, { useState, useMemo } from 'react';
import {
  Package,
  Plus,
  Search,
  Edit,
  PowerOff,
  CheckCircle,
  MapPin,
  Calendar,
  Loader2,
} from 'lucide-react';
import type { ResumenDePaqueteGestion } from '@viajapro/contracts';
import { filtrarPaquetesGestion } from '../../lib/catalogo-gestion-logica';

interface TablaGestionCatalogoProps {
  paquetes: ResumenDePaqueteGestion[];
  alEditar: (paquete: ResumenDePaqueteGestion) => void;
  alDesactivar: (paquete: ResumenDePaqueteGestion) => void;
  alCrear: () => void;
  cargando?: boolean;
}

export function TablaGestionCatalogo({
  paquetes,
  alEditar,
  alDesactivar,
  alCrear,
  cargando = false,
}: TablaGestionCatalogoProps) {
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | 'ACTIVOS' | 'INACTIVOS'>('TODOS');
  const [filtroDestino, setFiltroDestino] = useState('TODOS');

  // Estadísticas KPI superiores
  const stats = useMemo(() => {
    const total = paquetes.length;
    const activos = paquetes.filter((p) => p.activo).length;
    const inactivos = total - activos;
    return { total, activos, inactivos };
  }, [paquetes]);

  // Lista de destinos disponibles
  const destinos = useMemo(() => {
    const set = new Set(paquetes.map((p) => p.destino));
    return Array.from(set).sort();
  }, [paquetes]);

  // Paquetes filtrados
  const paquetesFiltrados = useMemo(() => {
    return filtrarPaquetesGestion(paquetes, {
      busqueda,
      estado: filtroEstado,
      destino: filtroDestino,
    });
  }, [paquetes, busqueda, filtroEstado, filtroDestino]);

  return (
    <div className="flex w-full flex-col space-y-5" data-testid="seccion-gestion-catalogo">
      {/* 1. Barra de KPIs Superiores y Acción Principal */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
          <div>
            <p className="text-[11px] font-bold tracking-wider text-neutral-400 uppercase">
              Total Productos
            </p>
            <p
              data-testid="kpi-total-paquetes"
              className="cifra mt-1 text-2xl font-black text-neutral-900 dark:text-white"
            >
              {stats.total}
            </p>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            <Package className="h-5 w-5" />
          </span>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-2xs dark:border-emerald-950 dark:bg-emerald-950/20">
          <div>
            <p className="text-[11px] font-bold tracking-wider text-emerald-700 uppercase dark:text-emerald-400">
              Activos para Venta
            </p>
            <p
              data-testid="kpi-activos-paquetes"
              className="cifra mt-1 text-2xl font-black text-emerald-900 dark:text-emerald-200"
            >
              {stats.activos}
            </p>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
            <CheckCircle className="h-5 w-5" />
          </span>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
          <div>
            <p className="text-[11px] font-bold tracking-wider text-neutral-400 uppercase">
              Pausados / Inactivos
            </p>
            <p
              data-testid="kpi-inactivos-paquetes"
              className="cifra mt-1 text-2xl font-black text-neutral-500 dark:text-neutral-400"
            >
              {stats.inactivos}
            </p>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            <PowerOff className="h-5 w-5" />
          </span>
        </div>

        <div className="flex items-center justify-end rounded-2xl border border-teal-200 bg-teal-50/40 p-4 dark:border-teal-950 dark:bg-teal-950/20">
          <button
            type="button"
            onClick={alCrear}
            data-testid="boton-abrir-nuevo-paquete"
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-teal-700"
          >
            <Plus className="h-4 w-4" />
            <span>+ Nuevo producto</span>
          </button>
        </div>
      </div>

      {/* 2. Barra de Filtros y Búsqueda */}
      <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xs md:flex-row md:items-center md:justify-between dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-1 flex-col gap-2.5 sm:flex-row sm:items-center">
          {/* Buscador */}
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute top-3 left-3 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por código, nombre o destino..."
              data-testid="buscador-gestion-catalogo"
              className="min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white pr-3 pl-9 text-xs text-neutral-900 placeholder-neutral-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>

          {/* Selector de Destino */}
          <div className="min-w-[160px]">
            <select
              value={filtroDestino}
              onChange={(e) => setFiltroDestino(e.target.value)}
              data-testid="filtro-destino-gestion"
              className="min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-700 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              <option value="TODOS">Todos los destinos</option>
              {destinos.map((dest) => (
                <option key={dest} value={dest}>
                  {dest}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Pestañas Segmentadas de Estado */}
        <div className="flex rounded-xl border border-neutral-200 bg-neutral-100 p-1 dark:border-neutral-800 dark:bg-neutral-800">
          <button
            type="button"
            onClick={() => setFiltroEstado('TODOS')}
            data-testid="tab-estado-todos"
            className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              filtroEstado === 'TODOS'
                ? 'bg-white text-neutral-900 shadow-2xs dark:bg-neutral-700 dark:text-white'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
            }`}
          >
            Todos ({stats.total})
          </button>
          <button
            type="button"
            onClick={() => setFiltroEstado('ACTIVOS')}
            data-testid="tab-estado-activos"
            className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              filtroEstado === 'ACTIVOS'
                ? 'bg-white text-emerald-800 shadow-2xs dark:bg-neutral-700 dark:text-emerald-300'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
            }`}
          >
            Activos ({stats.activos})
          </button>
          <button
            type="button"
            onClick={() => setFiltroEstado('INACTIVOS')}
            data-testid="tab-estado-inactivos"
            className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              filtroEstado === 'INACTIVOS'
                ? 'bg-white text-neutral-700 shadow-2xs dark:bg-neutral-700 dark:text-neutral-300'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
            }`}
          >
            Inactivos ({stats.inactivos})
          </button>
        </div>
      </div>

      {/* 3. Tabla / Listado de Paquetes */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
        {cargando ? (
          <div
            data-testid="gestion-catalogo-cargando"
            className="flex flex-col items-center justify-center p-12 text-center"
          >
            <Loader2 className="h-8 w-8 animate-spin text-teal-600 dark:text-teal-400" />
            <p className="mt-3 text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Cargando catálogo de productos...
            </p>
          </div>
        ) : paquetesFiltrados.length === 0 ? (
          <div
            data-testid="gestion-catalogo-vacio"
            className="flex flex-col items-center justify-center p-12 text-center"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400 dark:bg-neutral-800">
              <Package className="h-6 w-6" />
            </div>
            <h4 className="mt-3 text-sm font-bold text-neutral-800 dark:text-neutral-200">
              No se encontraron productos
            </h4>
            <p className="mt-1 max-w-sm text-xs text-neutral-500 dark:text-neutral-400">
              No hay productos que coincidan con los filtros activos. Modifica tu búsqueda o
              registra uno nuevo.
            </p>
            <button
              type="button"
              onClick={alCrear}
              className="mt-4 flex min-h-[44px] items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-700"
            >
              <Plus className="h-4 w-4" />
              <span>Registrar producto</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-200 bg-neutral-50 font-bold text-neutral-500 uppercase dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-400">
                <tr>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Producto / Destino</th>
                  <th className="px-4 py-3">Duración</th>
                  <th className="px-4 py-3 text-right">Tarifa «Desde»</th>
                  <th className="px-4 py-3 text-center">Vigencias</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {paquetesFiltrados.map((p) => {
                  const tarifaDesde = p.desde?.[0];
                  const textoDesde = tarifaDesde
                    ? new Intl.NumberFormat('es-CO', {
                        style: 'currency',
                        currency: tarifaDesde.moneda,
                        maximumFractionDigits: 0,
                      }).format(Number(tarifaDesde.unidades))
                    : 'A consultar';

                  return (
                    <tr
                      key={p.id}
                      data-testid={`fila-paquete-${p.id}`}
                      className="hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40"
                    >
                      {/* Código */}
                      <td className="px-4 py-3 font-mono font-medium text-neutral-600 dark:text-neutral-300">
                        {p.codigo || <span className="text-neutral-400 italic">S/C</span>}
                      </td>

                      {/* Nombre y Destino */}
                      <td className="px-4 py-3">
                        <div className="font-bold text-neutral-900 dark:text-white">{p.nombre}</div>
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                          <MapPin className="h-3 w-3 shrink-0 text-cyan-600 dark:text-cyan-400" />
                          <span>{p.destino}</span>
                          {p.formato && (
                            <span className="py-0.2 ml-1 rounded-md bg-neutral-100 px-1.5 text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                              {p.formato.nombre}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Duración */}
                      <td className="px-4 py-3 whitespace-nowrap text-neutral-700 dark:text-neutral-300">
                        <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-semibold dark:bg-neutral-800">
                          {p.noches === 0 ? '1D (Pasadía)' : `${p.dias}D / ${p.noches}N`}
                        </span>
                      </td>

                      {/* Desde */}
                      <td className="cifra px-4 py-3 text-right font-bold text-neutral-900 dark:text-white">
                        {textoDesde}
                      </td>

                      {/* Vigencias activas */}
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-300">
                          <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                          <span>{p.vigenciasActivas}</span>
                        </span>
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3">
                        {p.activo ? (
                          <span
                            data-testid={`badge-estado-activo-${p.id}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Activo en venta
                          </span>
                        ) : (
                          <span
                            data-testid={`badge-estado-inactivo-${p.id}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-400"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
                            Pausado
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => alEditar(p)}
                            data-testid={`boton-editar-paquete-${p.id}`}
                            className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                            title="Editar producto"
                            aria-label={`Editar ${p.nombre}`}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>

                          {p.activo && (
                            <button
                              type="button"
                              onClick={() => alDesactivar(p)}
                              data-testid={`boton-desactivar-paquete-${p.id}`}
                              className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-neutral-200 bg-white text-amber-700 hover:bg-amber-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-amber-400 dark:hover:bg-amber-950/30"
                              title="Desactivar producto"
                              aria-label={`Desactivar ${p.nombre}`}
                            >
                              <PowerOff className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
