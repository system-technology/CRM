'use client';

import React from 'react';
import {
  Calendar,
  Check,
  Compass,
  Copy,
  Info,
  MapPin,
  Sparkles,
  Users,
  AlertTriangle,
  HelpCircle,
} from 'lucide-react';
import type { CotizacionDeSalida } from '@viajapro/contracts';
import { formatearDinero } from '../../lib/api';

interface DesgloseCotizacionSalidaProps {
  cotizacion: CotizacionDeSalida;
  copiado: boolean;
  alCopiarWhatsApp: () => void;
}

export function DesgloseCotizacionSalida({
  cotizacion,
  copiado,
  alCopiarWhatsApp,
}: DesgloseCotizacionSalidaProps) {
  return (
    <div className="space-y-6">
      {/* 1. Tarjeta Resumen Principal y Total Protagonista (0c.16.2) */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-acento-50 text-acento-700 dark:bg-acento-950/60 dark:text-acento-300 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold">
                <Compass className="h-3.5 w-3.5" />
                {cotizacion.paqueteNombre}
              </span>

              {/* 0c.16.4 — «Bajo consulta de cupo» vs salida programada */}
              {cotizacion.deSalidaProgramada ? (
                <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <Check className="h-3.5 w-3.5" />
                  Salida programada confirmada
                </span>
              ) : (
                <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Bajo consulta de cupo (vigencia abierta)
                </span>
              )}
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-neutral-400" />
                {cotizacion.destino}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                Fecha: <strong>{cotizacion.fecha}</strong>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-neutral-400" />
                {cotizacion.pasajeros} pasajero(s)
              </span>
            </div>
          </div>

          {/* El Total: El Protagonista de la Pantalla */}
          <div className="border-acento-200 bg-acento-50/50 dark:border-acento-900/40 dark:bg-acento-950/20 flex flex-col items-start rounded-xl border p-4 text-left sm:items-end sm:text-right">
            <span className="text-acento-800 dark:text-acento-300 text-[11px] font-bold tracking-wider uppercase">
              Total Venta Cotizada
            </span>
            <div className="cifra mt-1 text-3xl font-black text-neutral-900 dark:text-white">
              {formatearDinero(cotizacion.total)}
            </div>
            <span className="mt-0.5 text-[10px] text-neutral-500">
              El número que el asesor copia y pega en WhatsApp
            </span>
          </div>
        </div>

        {/* Aviso pedagógico si no es fecha fija (0c.16.4) */}
        {!cotizacion.deSalidaProgramada && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <strong>Bajo consulta de cupo:</strong> Esta cotización proviene de una vigencia
              abierta ({cotizacion.vigenciaDesde} al {cotizacion.vigenciaHasta}) sin salida grupal
              fija publicada en esa fecha. Valide disponibilidad con el mayorista u operador antes
              de comprometer el cupo.
            </div>
          </div>
        )}
      </section>

      {/* 2. Desglose de Cotización Armada (0c.16.2 — lineas) */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-neutral-900 dark:text-white">
              Cotización Armada por Tipo de Pasajero
            </h2>
            <p className="text-xs text-neutral-500">
              Suma exacta de tarifas aplicables a la composición del grupo
            </p>
          </div>
          <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            {cotizacion.lineas.length} {cotizacion.lineas.length === 1 ? 'línea' : 'líneas'}
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-neutral-100 dark:border-neutral-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-400">
                <th className="px-4 py-2.5 text-left font-medium">Concepto / Tarifa</th>
                <th className="px-4 py-2.5 text-left font-medium">Modalidad</th>
                <th className="px-4 py-2.5 text-right font-medium">Cantidad</th>
                <th className="px-4 py-2.5 text-right font-medium">Precio Unitario</th>
                <th className="px-4 py-2.5 text-right font-medium">Subtotal Venta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
              {cotizacion.lineas.map((linea) => (
                <tr
                  key={linea.tarifaId}
                  className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/20"
                >
                  <td className="px-4 py-3 font-bold text-neutral-800 dark:text-neutral-200">
                    {linea.nombre}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {linea.unidad === 'POR_PERSONA' ? 'Por persona' : 'Por grupo'}
                  </td>
                  <td className="cifra px-4 py-3 text-right font-semibold text-neutral-700 dark:text-neutral-300">
                    {linea.veces}x
                  </td>
                  <td className="cifra px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">
                    {formatearDinero(linea.precioUnitario)}
                  </td>
                  <td className="cifra px-4 py-3 text-right text-sm font-black text-neutral-900 dark:text-white">
                    {formatearDinero(linea.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-neutral-200 bg-neutral-50/80 font-bold dark:border-neutral-700 dark:bg-neutral-800/60">
                <td
                  colSpan={4}
                  className="px-4 py-3 text-right text-neutral-800 dark:text-neutral-200"
                >
                  Total Cotización Armada:
                </td>
                <td className="cifra text-acento-600 dark:text-acento-400 px-4 py-3 text-right text-base">
                  {formatearDinero(cotizacion.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* 3. Tarifas Alternativas de Grupo (0c.16.2 — alternativas) */}
      {cotizacion.alternativas.length > 0 && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-neutral-900 dark:text-white">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Tarifas de Grupo Alternativas
              </h2>
              <p className="text-xs text-neutral-500">
                Tarifas que reemplazan al armado. Se enseñan pero{' '}
                <strong>no se aplican solas</strong> (llevan condiciones comerciales).
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {cotizacion.alternativas.map((alt) => (
              <div
                key={alt.tarifaId}
                className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-800/40"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-neutral-900 dark:text-white">
                      {alt.nombre}
                    </span>
                    {alt.masBarata && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        Opción más económica
                      </span>
                    )}
                  </div>
                  <span className="mt-0.5 block text-[11px] text-neutral-500">
                    Cubre {alt.cubrePasajeros} persona(s) ({alt.veces}x)
                  </span>
                </div>

                <div className="text-right">
                  <span className="cifra text-base font-extrabold text-neutral-900 dark:text-white">
                    {formatearDinero(alt.total)}
                  </span>
                  <span className="block text-[10px] text-neutral-400">Total tarifa grupo</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. Lo que NO aplica y por qué (0c.16.2 — noAplicables) */}
      {cotizacion.noAplicables.length > 0 && (
        <section className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-5 dark:border-neutral-800 dark:bg-neutral-900/60">
          <div className="flex items-start gap-3">
            <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
            <div className="flex-1">
              <h3 className="text-xs font-bold text-neutral-700 dark:text-neutral-300">
                Tarifas no aplicables a este grupo ({cotizacion.noAplicables.length}):
              </h3>
              <ul className="mt-2 space-y-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                {cotizacion.noAplicables.map((na) => (
                  <li key={na.tarifaId} className="flex items-baseline gap-2">
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                      • {na.nombre}:
                    </span>
                    <span className="text-neutral-600 dark:text-neutral-400">{na.motivo}</span>
                  </li>
                ))}
              </ul>
              <span className="mt-2 block text-[11px] text-neutral-400">
                Transparencia de tarifario: se expone el motivo exacto para evitar cálculos externos
                que descuadren el informe de margen.
              </span>
            </div>
          </div>
        </section>
      )}

      {/* 5. Barra de Acciones de WhatsApp y Exportación */}
      <section className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
            Compartir con el Viajero
          </h4>
          <p className="text-[11px] text-neutral-500">
            Genera el mensaje limpio sin exponer netos ni márgenes internos de la agencia
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={alCopiarWhatsApp}
            className="bg-ok-600 hover:bg-ok-700 flex items-center gap-2 rounded-xl px-5 py-3 text-xs font-bold text-white shadow-xs transition-colors"
          >
            {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copiado ? '¡Copiado al Portapapeles!' : 'Copiar Propuesta para WhatsApp'}
          </button>
        </div>
      </section>
    </div>
  );
}
