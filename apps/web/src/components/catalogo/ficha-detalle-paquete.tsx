'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  X,
  Calendar,
  Clock,
  Building2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Compass,
} from 'lucide-react';
import type { Acomodacion, TipoPasajero } from '@viajapro/contracts';
import { formatearDinero } from '../../lib/api';
import { usePermisos } from '../../lib/permisos';
import { MOCK_SESION_DUENO } from '../../lib/auth-api';
import type { PaqueteConDetalle } from '../../lib/mock-catalogo';
import {
  agruparPreciosPorAcomodacion,
  verificarVigenciaTarifario,
} from '../../lib/catalogo-logica';

interface FichaDetallePaqueteProps {
  paquete: PaqueteConDetalle | null;
  alCerrar: () => void;
  puedeVerNetoYMargen?: boolean;
}

const ACOMODACIONES: Acomodacion[] = ['SENCILLA', 'DOBLE', 'TRIPLE', 'CUADRUPLE'];
const TIPOS_PASAJERO: { tipo: TipoPasajero; etiqueta: string }[] = [
  { tipo: 'ADT', etiqueta: 'Adulto (ADT)' },
  { tipo: 'CHD', etiqueta: 'Niño (CHD)' },
  { tipo: 'INF', etiqueta: 'Infante (INF)' },
];

export function FichaDetallePaquete({
  paquete,
  alCerrar,
  puedeVerNetoYMargen: puedeVerNetoProp,
}: FichaDetallePaqueteProps) {
  const { puedeVerNetoYMargen: puedeVerNetoHook } = usePermisos(
    puedeVerNetoProp !== undefined ? (puedeVerNetoProp ? MOCK_SESION_DUENO : null) : undefined,
  );
  const tienePermisoNeto = puedeVerNetoProp !== undefined ? puedeVerNetoProp : puedeVerNetoHook;
  const [temporadaSeleccionadaId, setTemporadaSeleccionadaId] = useState<string>('');

  if (!paquete) return null;

  const temporadaActiva =
    paquete.temporadas.find((t) => t.id === temporadaSeleccionadaId) ?? paquete.temporadas[0];

  const vigencia = verificarVigenciaTarifario(paquete.temporadas);
  const matrizPrecios = temporadaActiva
    ? agruparPreciosPorAcomodacion(temporadaActiva.precios)
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-ficha-paquete"
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-xs transition-opacity"
      onClick={alCerrar}
    >
      <div
        className="anim-panel-lateral flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl transition-transform dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex items-start justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-2">
              <span className="bg-acento-100 text-acento-800 dark:bg-acento-950 dark:text-acento-300 rounded px-2 py-0.5 text-xs font-semibold">
                {paquete.destino} {paquete.paisIso ? '(' + paquete.paisIso + ')' : ''}
              </span>
              <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                {paquete.dias} días / {paquete.noches} noches
              </span>
              <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                {paquete.planAlimentacion.replace(/_/g, ' ')}
              </span>
            </div>
            <h2
              id="titulo-ficha-paquete"
              className="mt-2 text-lg font-bold text-neutral-900 dark:text-white"
            >
              {paquete.nombre}
            </h2>
          </div>
          <button
            type="button"
            onClick={alCerrar}
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            aria-label="Cerrar ficha de paquete"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Contenido con scroll */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
          {/* Alerta de Vigencia */}
          {vigencia.estaVigente ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                <strong>Tarifario vigente.</strong> Próximo corte de temporada:{' '}
                {vigencia.proximoVencimiento} (UTC). Precios validados para cotización.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50/50 p-3 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>
                <strong>Tarifario vencido.</strong> Las temporadas de este paquete ya caducaron.
                Requiere actualización del mayorista antes de emitir cotizaciones válidas.
              </span>
            </div>
          )}

          {/* Ficha del Mayorista Aliado */}
          {paquete.mayorista && (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="text-acento-600 dark:text-acento-400 h-4 w-4" />
                  <span className="text-xs font-semibold text-neutral-500 uppercase dark:text-neutral-400">
                    Mayorista Proveedor
                  </span>
                </div>
                {paquete.mayorista.diasTimeLimit !== null && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                    <Clock className="h-3 w-3" />
                    Time Limit: {paquete.mayorista.diasTimeLimit} días para pago
                  </span>
                )}
              </div>
              <div className="mt-2 text-sm font-bold text-neutral-900 dark:text-white">
                {paquete.mayorista.nombre}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                {paquete.mayorista.contactoNombre && (
                  <span>Contacto: {paquete.mayorista.contactoNombre}</span>
                )}
                {paquete.mayorista.contactoTelefono && (
                  <span>Tel: {paquete.mayorista.contactoTelefono}</span>
                )}
                {paquete.mayorista.contactoCorreo && (
                  <span>Email: {paquete.mayorista.contactoCorreo}</span>
                )}
              </div>
              {paquete.mayorista.notas && (
                <p className="mt-2 border-t border-neutral-200 pt-2 text-xs text-neutral-500 italic dark:border-neutral-700 dark:text-neutral-400">
                  {paquete.mayorista.notas}
                </p>
              )}
            </div>
          )}

          {/* Selector de Temporadas */}
          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="selector-temporada"
                className="text-xs font-bold text-neutral-700 uppercase dark:text-neutral-300"
              >
                Temporadas y Tarifarios ({paquete.temporadas.length})
              </label>
              {temporadaActiva && (
                <span className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                  <Calendar className="h-3.5 w-3.5" />
                  Vigencia: {temporadaActiva.desde} a {temporadaActiva.hasta}
                </span>
              )}
            </div>

            {paquete.temporadas.length > 1 && (
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {paquete.temporadas.map((temp) => (
                  <button
                    key={temp.id}
                    type="button"
                    onClick={() => setTemporadaSeleccionadaId(temp.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                      temporadaActiva?.id === temp.id
                        ? 'bg-acento-600 text-white shadow-xs'
                        : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                    }`}
                  >
                    {temp.nombre}
                  </button>
                ))}
              </div>
            )}

            {/* Matriz de Tarifas por Acomodación */}
            {temporadaActiva && matrizPrecios && (
              <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                <div className="border-b border-neutral-200 bg-neutral-50/70 px-4 py-2.5 dark:border-neutral-800 dark:bg-neutral-800/50">
                  <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                    Matriz de Tarifas — {temporadaActiva.nombre}
                  </span>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Precios expresados por persona en pesos colombianos (COP).
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-neutral-200 bg-neutral-50/40 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/20 dark:text-neutral-400">
                        <th className="px-3 py-2 font-medium">Acomodación</th>
                        {TIPOS_PASAJERO.map((t) => (
                          <th key={t.tipo} className="px-3 py-2 text-right font-medium">
                            {t.etiqueta}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
                      {ACOMODACIONES.map((acom) => {
                        const fila = matrizPrecios[acom];
                        const tienePrecios = Object.keys(fila).length > 0;
                        if (!tienePrecios) return null;

                        return (
                          <tr
                            key={acom}
                            className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30"
                          >
                            <td className="px-3 py-2 font-semibold text-neutral-800 capitalize dark:text-neutral-200">
                              {acom.toLowerCase()}
                            </td>
                            {TIPOS_PASAJERO.map((t) => {
                              const precio = fila[t.tipo];
                              if (!precio) {
                                return (
                                  <td
                                    key={t.tipo}
                                    className="px-3 py-2 text-right text-neutral-300 dark:text-neutral-600"
                                  >
                                    —
                                  </td>
                                );
                              }

                              return (
                                <td key={t.tipo} className="px-3 py-2 text-right">
                                  <div className="cifra font-bold text-neutral-900 dark:text-white">
                                    {formatearDinero(precio.venta)}
                                  </div>
                                  {tienePermisoNeto && precio.neto && (
                                    <div className="cifra text-[10px] text-neutral-400 dark:text-neutral-500">
                                      Neto: {formatearDinero(precio.neto)}
                                    </div>
                                  )}
                                  {precio.edadMinima !== null && precio.edadMaxima !== null && (
                                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                                      {precio.edadMinima} a {precio.edadMaxima} años
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Inclusiones y Exclusiones */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <h4 className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 uppercase dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Inclusiones del Plan
              </h4>
              <ul className="mt-2 space-y-1.5 text-xs text-neutral-700 dark:text-neutral-300">
                {paquete.inclusiones.map((inc, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-emerald-600 dark:text-emerald-400">•</span>
                    <span>{inc}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50/30 p-4 dark:border-rose-900/40 dark:bg-rose-950/20">
              <h4 className="flex items-center gap-1.5 text-xs font-bold text-rose-800 uppercase dark:text-rose-300">
                <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                Exclusiones
              </h4>
              <ul className="mt-2 space-y-1.5 text-xs text-neutral-700 dark:text-neutral-300">
                {paquete.exclusiones.map((exc, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-rose-500">•</span>
                    <span>{exc}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Cargos en destino (No incluidos en el total - ADR-0017 §9) */}
          {paquete.cargosEnDestino && paquete.cargosEnDestino.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
              <div className="flex items-center justify-between">
                <h4 className="flex items-center gap-1.5 text-xs font-bold text-amber-800 uppercase dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  Cargos a Pagar en Destino (No Incluidos)
                </h4>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                  Pago directo
                </span>
              </div>
              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                Estos valores se abonan en destino (impuestos de muelle, tasas o reservas naturales)
                y nunca se suman al total de la cotización.
              </p>
              <ul className="mt-2.5 space-y-1.5 divide-y divide-amber-100 dark:divide-amber-900/40">
                {paquete.cargosEnDestino.map((cargo, idx) => (
                  <li
                    key={idx}
                    className="flex items-center justify-between pt-1.5 text-xs text-neutral-800 dark:text-neutral-200"
                  >
                    <span className="font-medium">{cargo.concepto}</span>
                    <span className="cifra font-bold text-neutral-900 dark:text-white">
                      {cargo.monto ? formatearDinero(cargo.monto) : 'Monto por confirmar'}{' '}
                      {cargo.unidad === 'POR_PERSONA' ? 'por persona' : 'por grupo'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Descripción general */}
          {paquete.descripcion && (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-800/30">
              <h4 className="flex items-center gap-1.5 text-xs font-bold text-neutral-700 uppercase dark:text-neutral-300">
                <Info className="h-4 w-4 text-neutral-500" />
                Descripción del Paquete
              </h4>
              <p className="mt-1.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                {paquete.descripcion}
              </p>
            </div>
          )}
        </div>

        {/* Pie de acción */}
        <div className="flex items-center justify-between border-t border-neutral-200 bg-neutral-50/50 px-6 py-4 dark:border-neutral-800 dark:bg-neutral-800/40">
          <button
            type="button"
            onClick={alCerrar}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Volver al catálogo
          </button>

          <Link
            href="/cotizador"
            className="bg-acento-600 hover:bg-acento-700 flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors"
          >
            <Compass className="h-4 w-4" />
            Cotizar este paquete ahora
          </Link>
        </div>
      </div>
    </div>
  );
}
