'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { VersionDeCotizacion } from '@viajapro/contracts';
import {
  ArrowLeftRight,
  Check,
  Lock,
  Minus,
  Plus,
  Scale,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  compararVersionesCotizacion,
  formatearDeltaDinero,
  type DiffLineaPrecio,
} from '../../lib/cotizaciones-diff';
import { formatearDinero, formatearFecha } from '../../lib/formato';
import { PERMISO_VER_NETO_Y_MARGEN, usePermisos } from '../../lib/permisos';

export interface ModalCompararVersionesProps {
  abierto: boolean;
  onCerrar: () => void;
  versiones: VersionDeCotizacion[];
  versionInicialA?: number;
  versionInicialB?: number;
  tituloCotizacion?: string;
}

export function ModalCompararVersiones({
  abierto,
  onCerrar,
  versiones,
  versionInicialA,
  versionInicialB,
  tituloCotizacion,
}: ModalCompararVersionesProps) {
  // Ordenar versiones de menor a mayor número
  const versionesOrdenadas = useMemo(() => {
    return [...versiones].sort((a, b) => a.numero - b.numero);
  }, [versiones]);

  const [numeroA, setNumeroA] = useState<number>(() => {
    if (versionInicialA) return versionInicialA;
    return versionesOrdenadas[0]?.numero ?? 1;
  });

  const [numeroB, setNumeroB] = useState<number>(() => {
    if (versionInicialB && versionInicialB !== versionInicialA) return versionInicialB;
    if (versionesOrdenadas.length > 1) {
      return versionesOrdenadas[versionesOrdenadas.length - 1]?.numero ?? 2;
    }
    return versionesOrdenadas[0]?.numero ?? 1;
  });

  // Permiso para ver neto y margen (ADR-0011)
  const { tienePermiso } = usePermisos();
  const puedeVerNetoYMargen = tienePermiso(PERMISO_VER_NETO_Y_MARGEN);

  // Cerrar al pulsar Escape
  useEffect(() => {
    if (!abierto) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCerrar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [abierto, onCerrar]);

  const versionA = useMemo(
    () => versiones.find((v) => v.numero === numeroA) ?? versionesOrdenadas[0],
    [versiones, numeroA, versionesOrdenadas],
  );

  const versionB = useMemo(
    () =>
      versiones.find((v) => v.numero === numeroB) ??
      versionesOrdenadas[versionesOrdenadas.length - 1],
    [versiones, numeroB, versionesOrdenadas],
  );

  const diff = useMemo(() => {
    if (!versionA || !versionB) return null;
    return compararVersionesCotizacion(versionA, versionB, puedeVerNetoYMargen);
  }, [versionA, versionB, puedeVerNetoYMargen]);

  const invertirComparacion = () => {
    setNumeroA(numeroB);
    setNumeroB(numeroA);
  };

  if (!abierto || !diff || !versionA || !versionB) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-comparar"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-xs select-none sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl border border-neutral-200 bg-white shadow-2xl transition-all dark:border-neutral-800 dark:bg-neutral-900">
        {/* Cabecera del comparador */}
        <div className="flex shrink-0 items-start justify-between border-b border-neutral-100 p-5 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="bg-acento-50 text-acento-600 dark:bg-acento-950/60 dark:text-acento-400 flex h-10 w-10 items-center justify-center rounded-xl">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="titulo-modal-comparar"
                className="text-base font-bold text-neutral-900 dark:text-neutral-100"
              >
                Comparar Versiones Lado a Lado
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {tituloCotizacion ? `${tituloCotizacion} · ` : ''}
                {diff.paqueteNombre}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar modal de comparación"
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Barra de selección de versiones a comparar */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-neutral-100 bg-neutral-50/70 px-5 py-3 dark:border-neutral-800 dark:bg-neutral-800/40">
          <div className="flex items-center gap-3">
            <div>
              <label
                htmlFor="select-version-a"
                className="block text-[10px] font-bold tracking-wider text-neutral-500 uppercase dark:text-neutral-400"
              >
                Versión Base (A)
              </label>
              <select
                id="select-version-a"
                value={numeroA}
                onChange={(e) => setNumeroA(Number(e.target.value))}
                className="focus:ring-acento-500 mt-0.5 rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-800 focus:ring-2 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
              >
                {versionesOrdenadas.map((v) => (
                  <option key={v.id} value={v.numero}>
                    Versión {v.numero} ({formatearDinero(v.venta)})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={invertirComparacion}
              aria-label="Invertir versiones a comparar"
              className="mt-3.5 flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
              title="Invertir versión base y comparada"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </button>

            <div>
              <label
                htmlFor="select-version-b"
                className="block text-[10px] font-bold tracking-wider text-neutral-500 uppercase dark:text-neutral-400"
              >
                Versión Comparada (B)
              </label>
              <select
                id="select-version-b"
                value={numeroB}
                onChange={(e) => setNumeroB(Number(e.target.value))}
                className="focus:ring-acento-500 mt-0.5 rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-800 focus:ring-2 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
              >
                {versionesOrdenadas.map((v) => (
                  <option key={v.id} value={v.numero}>
                    Versión {v.numero} ({formatearDinero(v.venta)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Badge del efecto en el total */}
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold ${
                diff.totales.efectoVenta === 'AUMENTO'
                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'
                  : diff.totales.efectoVenta === 'DISMINUCION'
                    ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200'
              }`}
            >
              {diff.totales.efectoVenta === 'AUMENTO' && <TrendingUp className="h-4 w-4" />}
              {diff.totales.efectoVenta === 'DISMINUCION' && <TrendingDown className="h-4 w-4" />}
              {diff.totales.efectoVenta === 'NEUTRO' && <Minus className="h-4 w-4" />}
              <span>
                Variación Total: {formatearDeltaDinero(diff.totales.deltaVenta)}{' '}
                {diff.totales.porcentajeVariacionVenta !== 0 &&
                  `(${diff.totales.porcentajeVariacionVenta > 0 ? '+' : ''}${diff.totales.porcentajeVariacionVenta.toFixed(1)} %)`}
              </span>
            </div>
          </div>
        </div>

        {/* Cuerpo con scroll */}
        <div className="flex-1 space-y-6 overflow-y-auto p-5 text-xs">
          {/* Tarjeta de Resumen del Efecto */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-800/30">
            <div className="flex items-center gap-2 font-bold text-neutral-900 dark:text-neutral-100">
              <Sparkles className="text-acento-600 dark:text-acento-400 h-4 w-4" />
              <span>Resumen de Cambios</span>
            </div>
            <p className="mt-1 font-semibold text-neutral-700 dark:text-neutral-300">
              {diff.resumenEfectoTotal}
            </p>

            {diff.resumenCambios.length > 0 ? (
              <ul className="mt-2.5 list-disc space-y-1 pl-5 text-neutral-600 dark:text-neutral-400">
                {diff.resumenCambios.map((cambio, idx) => (
                  <li key={idx}>{cambio}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-neutral-500 italic dark:text-neutral-400">
                Ambas versiones tienen idénticos parámetros y líneas cotizadas.
              </p>
            )}
          </div>

          {/* Tabla 1: Composición y Parámetros */}
          <div>
            <h3 className="mb-2 text-xs font-bold tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
              1. Parámetros de Viaje y Pasajeros
            </h3>
            <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
              <table className="w-full text-left">
                <thead className="bg-neutral-100/70 text-[11px] font-semibold text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-400">
                  <tr>
                    <th className="p-2.5">Parámetro</th>
                    <th className="p-2.5">Versión {versionA.numero}</th>
                    <th className="p-2.5">Versión {versionB.numero}</th>
                    <th className="p-2.5">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {/* Pasajeros adultos */}
                  <tr
                    className={
                      diff.parametros.adultos.haCambiado
                        ? 'bg-amber-50/40 dark:bg-amber-950/20'
                        : ''
                    }
                  >
                    <td className="p-2.5 font-medium text-neutral-900 dark:text-neutral-100">
                      Adultos
                    </td>
                    <td className="p-2.5">{diff.parametros.adultos.anterior}</td>
                    <td className="p-2.5">{diff.parametros.adultos.nuevo}</td>
                    <td className="p-2.5">
                      {diff.parametros.adultos.haCambiado ? (
                        <span className="font-bold text-amber-700 dark:text-amber-400">
                          {diff.parametros.adultos.nuevo - diff.parametros.adultos.anterior > 0
                            ? `+${diff.parametros.adultos.nuevo - diff.parametros.adultos.anterior}`
                            : diff.parametros.adultos.nuevo - diff.parametros.adultos.anterior}
                        </span>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                  </tr>

                  {/* Pasajeros niños */}
                  <tr
                    className={
                      diff.parametros.ninos.haCambiado ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''
                    }
                  >
                    <td className="p-2.5 font-medium text-neutral-900 dark:text-neutral-100">
                      Niños
                    </td>
                    <td className="p-2.5">{diff.parametros.ninos.anterior}</td>
                    <td className="p-2.5">{diff.parametros.ninos.nuevo}</td>
                    <td className="p-2.5">
                      {diff.parametros.ninos.haCambiado ? (
                        <span className="font-bold text-amber-700 dark:text-amber-400">
                          {diff.parametros.ninos.nuevo - diff.parametros.ninos.anterior > 0
                            ? `+${diff.parametros.ninos.nuevo - diff.parametros.ninos.anterior}`
                            : diff.parametros.ninos.nuevo - diff.parametros.ninos.anterior}
                        </span>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                  </tr>

                  {/* Pasajeros infantes */}
                  <tr
                    className={
                      diff.parametros.infantes.haCambiado
                        ? 'bg-amber-50/40 dark:bg-amber-950/20'
                        : ''
                    }
                  >
                    <td className="p-2.5 font-medium text-neutral-900 dark:text-neutral-100">
                      Infantes
                    </td>
                    <td className="p-2.5">{diff.parametros.infantes.anterior}</td>
                    <td className="p-2.5">{diff.parametros.infantes.nuevo}</td>
                    <td className="p-2.5">
                      {diff.parametros.infantes.haCambiado ? (
                        <span className="font-bold text-amber-700 dark:text-amber-400">
                          {diff.parametros.infantes.nuevo - diff.parametros.infantes.anterior > 0
                            ? `+${diff.parametros.infantes.nuevo - diff.parametros.infantes.anterior}`
                            : diff.parametros.infantes.nuevo - diff.parametros.infantes.anterior}
                        </span>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                  </tr>

                  {/* Fecha de salida */}
                  <tr
                    className={
                      diff.parametros.fechaSalida.haCambiado
                        ? 'bg-amber-50/40 dark:bg-amber-950/20'
                        : ''
                    }
                  >
                    <td className="p-2.5 font-medium text-neutral-900 dark:text-neutral-100">
                      Fecha de Salida
                    </td>
                    <td className="p-2.5">
                      {formatearFecha(diff.parametros.fechaSalida.anterior)}
                    </td>
                    <td className="p-2.5">{formatearFecha(diff.parametros.fechaSalida.nuevo)}</td>
                    <td className="p-2.5">
                      {diff.parametros.fechaSalida.haCambiado ? (
                        <span className="font-semibold text-amber-700 dark:text-amber-400">
                          Cambió de fecha
                        </span>
                      ) : (
                        <span className="text-neutral-400">Sin cambio</span>
                      )}
                    </td>
                  </tr>

                  {/* Noches */}
                  <tr
                    className={
                      diff.parametros.noches.haCambiado ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''
                    }
                  >
                    <td className="p-2.5 font-medium text-neutral-900 dark:text-neutral-100">
                      Noches de Estadía
                    </td>
                    <td className="p-2.5">{diff.parametros.noches.anterior} noches</td>
                    <td className="p-2.5">{diff.parametros.noches.nuevo} noches</td>
                    <td className="p-2.5">
                      {diff.parametros.noches.haCambiado ? (
                        <span className="font-bold text-amber-700 dark:text-amber-400">
                          {diff.parametros.noches.nuevo - diff.parametros.noches.anterior > 0
                            ? `+${diff.parametros.noches.nuevo - diff.parametros.noches.anterior}`
                            : diff.parametros.noches.nuevo - diff.parametros.noches.anterior}{' '}
                          noches
                        </span>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                  </tr>

                  {/* Acomodación */}
                  <tr
                    className={
                      diff.parametros.acomodacion.haCambiado
                        ? 'bg-amber-50/40 dark:bg-amber-950/20'
                        : ''
                    }
                  >
                    <td className="p-2.5 font-medium text-neutral-900 dark:text-neutral-100">
                      Acomodación
                    </td>
                    <td className="p-2.5">
                      {diff.parametros.acomodacion.anterior ?? 'No definida'}
                    </td>
                    <td className="p-2.5">{diff.parametros.acomodacion.nuevo ?? 'No definida'}</td>
                    <td className="p-2.5">
                      {diff.parametros.acomodacion.haCambiado ? (
                        <span className="font-semibold text-amber-700 dark:text-amber-400">
                          Cambió acomodación
                        </span>
                      ) : (
                        <span className="text-neutral-400">Sin cambio</span>
                      )}
                    </td>
                  </tr>

                  {/* Vigencia de la oferta */}
                  <tr
                    className={
                      diff.parametros.vigenteHasta.haCambiado
                        ? 'bg-amber-50/40 dark:bg-amber-950/20'
                        : ''
                    }
                  >
                    <td className="p-2.5 font-medium text-neutral-900 dark:text-neutral-100">
                      Vigente Hasta
                    </td>
                    <td className="p-2.5">
                      {diff.parametros.vigenteHasta.anterior
                        ? formatearFecha(diff.parametros.vigenteHasta.anterior)
                        : 'Indefinida'}
                    </td>
                    <td className="p-2.5">
                      {diff.parametros.vigenteHasta.nuevo
                        ? formatearFecha(diff.parametros.vigenteHasta.nuevo)
                        : 'Indefinida'}
                    </td>
                    <td className="p-2.5">
                      {diff.parametros.vigenteHasta.haCambiado ? (
                        <span className="font-semibold text-amber-700 dark:text-amber-400">
                          Vigencia actualizada
                        </span>
                      ) : (
                        <span className="text-neutral-400">Sin cambio</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Tabla 2: Líneas de Precio y Cargos */}
          <div>
            <h3 className="mb-2 text-xs font-bold tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
              2. Comparativa Línea por Línea (Tarifas y Cargos)
            </h3>
            <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
              <table className="w-full text-left">
                <thead className="bg-neutral-100/70 text-[11px] font-semibold text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-400">
                  <tr>
                    <th className="p-2.5">Concepto / Tarifa</th>
                    <th className="p-2.5">Estado</th>
                    <th className="p-2.5">Versión {versionA.numero}</th>
                    <th className="p-2.5">Versión {versionB.numero}</th>
                    <th className="p-2.5">Diferencia Total</th>
                    {puedeVerNetoYMargen && <th className="p-2.5 text-right">Dif. Margen</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {diff.lineas.map((linea: DiffLineaPrecio) => (
                    <tr
                      key={linea.tarifaId}
                      className={
                        linea.tipo === 'AGREGADA'
                          ? 'bg-emerald-50/40 dark:bg-emerald-950/20'
                          : linea.tipo === 'ELIMINADA'
                            ? 'bg-rose-50/40 dark:bg-rose-950/20'
                            : linea.tipo === 'MODIFICADA'
                              ? 'bg-amber-50/40 dark:bg-amber-950/20'
                              : ''
                      }
                    >
                      <td className="p-2.5 font-medium text-neutral-900 dark:text-neutral-100">
                        {linea.nombre}
                      </td>
                      <td className="p-2.5">
                        {linea.tipo === 'AGREGADA' && (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            <Plus className="h-3 w-3" /> Añadida
                          </span>
                        )}
                        {linea.tipo === 'ELIMINADA' && (
                          <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            <Minus className="h-3 w-3" /> Removida
                          </span>
                        )}
                        {linea.tipo === 'MODIFICADA' && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Modificada
                          </span>
                        )}
                        {linea.tipo === 'SIN_CAMBIO' && (
                          <span className="text-neutral-400">Sin cambio</span>
                        )}
                      </td>
                      <td className="p-2.5 text-neutral-600 dark:text-neutral-400">
                        {linea.totalA ? (
                          <>
                            <div>{formatearDinero(linea.totalA)}</div>
                            <div className="text-[10px] text-neutral-400">
                              {linea.vecesA}x a {formatearDinero(linea.precioUnitarioA)}
                            </div>
                          </>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="p-2.5 text-neutral-600 dark:text-neutral-400">
                        {linea.totalB ? (
                          <>
                            <div>{formatearDinero(linea.totalB)}</div>
                            <div className="text-[10px] text-neutral-400">
                              {linea.vecesB}x a {formatearDinero(linea.precioUnitarioB)}
                            </div>
                          </>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="p-2.5 font-bold">
                        <span
                          className={
                            linea.efecto === 'AUMENTO'
                              ? 'text-amber-700 dark:text-amber-400'
                              : linea.efecto === 'DISMINUCION'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-neutral-400'
                          }
                        >
                          {formatearDeltaDinero(linea.deltaTotal)}
                        </span>
                      </td>

                      {/* Diferencia en margen (solo si tiene permiso) */}
                      {puedeVerNetoYMargen && (
                        <td className="p-2.5 text-right font-medium text-neutral-600 dark:text-neutral-400">
                          {linea.deltaMargen ? (
                            <span>{formatearDeltaDinero(linea.deltaMargen)}</span>
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tabla 3: Totales Finales Consolidados */}
          <div>
            <h3 className="mb-2 text-xs font-bold tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
              3. Totales y Variación Monetaria
            </h3>
            <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
              <table className="w-full text-left">
                <thead className="bg-neutral-100/70 text-[11px] font-semibold text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-400">
                  <tr>
                    <th className="p-2.5">Concepto</th>
                    <th className="p-2.5">Versión {versionA.numero}</th>
                    <th className="p-2.5">Versión {versionB.numero}</th>
                    <th className="p-2.5">Diferencia</th>
                    <th className="p-2.5 text-right">Variación %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-semibold dark:divide-neutral-800">
                  {/* Total Venta */}
                  <tr className="bg-neutral-50/50 dark:bg-neutral-800/30">
                    <td className="p-2.5 font-bold text-neutral-900 dark:text-neutral-100">
                      Total Venta al Cliente
                    </td>
                    <td className="p-2.5 font-bold text-neutral-800 dark:text-neutral-200">
                      {formatearDinero(diff.totales.ventaA)}
                    </td>
                    <td className="p-2.5 font-bold text-neutral-800 dark:text-neutral-200">
                      {formatearDinero(diff.totales.ventaB)}
                    </td>
                    <td className="p-2.5 font-bold">
                      <span
                        className={
                          diff.totales.efectoVenta === 'AUMENTO'
                            ? 'text-amber-700 dark:text-amber-400'
                            : diff.totales.efectoVenta === 'DISMINUCION'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-neutral-600'
                        }
                      >
                        {formatearDeltaDinero(diff.totales.deltaVenta)}
                      </span>
                    </td>
                    <td className="p-2.5 text-right font-bold text-neutral-700 dark:text-neutral-300">
                      {diff.totales.porcentajeVariacionVenta > 0 ? '+' : ''}
                      {diff.totales.porcentajeVariacionVenta.toFixed(1)} %
                    </td>
                  </tr>

                  {/* Neto y Margen con permiso */}
                  {puedeVerNetoYMargen ? (
                    <>
                      {diff.totales.netoA && diff.totales.netoB && diff.totales.deltaNeto && (
                        <tr className="text-neutral-600 dark:text-neutral-400">
                          <td className="p-2.5">Tarifa Neta Proveedor</td>
                          <td className="p-2.5">{formatearDinero(diff.totales.netoA)}</td>
                          <td className="p-2.5">{formatearDinero(diff.totales.netoB)}</td>
                          <td className="p-2.5">{formatearDeltaDinero(diff.totales.deltaNeto)}</td>
                          <td className="p-2.5 text-right">—</td>
                        </tr>
                      )}
                      {diff.totales.margenA && diff.totales.margenB && diff.totales.deltaMargen && (
                        <tr className="text-neutral-600 dark:text-neutral-400">
                          <td className="p-2.5">Margen Comercial Agencia</td>
                          <td className="p-2.5">{formatearDinero(diff.totales.margenA)}</td>
                          <td className="p-2.5">{formatearDinero(diff.totales.margenB)}</td>
                          <td className="p-2.5">
                            {formatearDeltaDinero(diff.totales.deltaMargen)}
                          </td>
                          <td className="p-2.5 text-right">—</td>
                        </tr>
                      )}
                    </>
                  ) : (
                    <tr>
                      <td
                        colSpan={5}
                        className="bg-neutral-50/30 p-2 text-center text-[10px] text-neutral-400 italic dark:bg-neutral-900/30"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <Lock className="h-3 w-3" />
                          <span>
                            Costos netos y márgenes comerciales restringidos (requiere permiso
                            cotizacion.ver_neto_y_margen).
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Pie de modal */}
        <div className="flex shrink-0 items-center justify-between border-t border-neutral-100 p-4 dark:border-neutral-800">
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Comparando Versión {versionA.numero} vs Versión {versionB.numero}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="flex items-center gap-1.5 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            <Check className="h-4 w-4" />
            <span>Cerrar Comparación</span>
          </button>
        </div>
      </div>
    </div>
  );
}
