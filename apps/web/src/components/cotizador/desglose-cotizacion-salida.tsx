'use client';

/**
 * Componente de Desglose de Cotización de Salida — Módulo Comercial (ADR-0009 - 0c.16 & 0c.22)
 *
 * Muestra el desglose por tipo de pasajero, total protagonista, tarifas alternativas
 * de grupo y tarifas no aplicables con motivo. Cero filtración de datos de margen/neto (R3, R10).
 * Integra acción para guardar cotización oficial versionada (0c.22).
 */

import React from 'react';
import type { CotizacionDeSalida } from '@viajapro/contracts';
import {
  Calendar,
  Users,
  Copy,
  Check,
  Sparkles,
  HelpCircle,
  Info,
  MapPin,
  Bookmark,
  Ship,
  Tag,
} from 'lucide-react';
import { requiereAvisoImpuestoMuelle } from '../../lib/cotizador-logica';
import { formatearDinero } from '../../lib/api';

export interface DesgloseCotizacionSalidaProps {
  cotizacion: CotizacionDeSalida;
  copiado: boolean;
  alCopiarWhatsApp: () => void;
  alGuardarCotizacion?: () => void;
  guardando?: boolean;
}

export function DesgloseCotizacionSalida({
  cotizacion,
  copiado,
  alCopiarWhatsApp,
  alGuardarCotizacion,
  guardando = false,
}: DesgloseCotizacionSalidaProps) {
  return (
    <div className="space-y-6">
      {/* 1. Resumen Cabecera y Total Protagonista (0c.16.2) */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              {cotizacion.noches === 0 ? (
                <span className="rounded-md bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800 uppercase dark:bg-sky-950 dark:text-sky-300">
                  Excursión de 1 día (Pasadía)
                </span>
              ) : (
                <span className="rounded-md bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700 uppercase dark:bg-purple-950 dark:text-purple-300">
                  {cotizacion.deSalidaProgramada ? 'Salida Confirmada' : 'Vigencia Abierta'}
                </span>
              )}
              <span className="text-xs text-neutral-400">
                Vigencia: {cotizacion.vigenciaDesde} al {cotizacion.vigenciaHasta}
              </span>
            </div>

            <h1 className="mt-2 text-xl font-black text-neutral-900 dark:text-white">
              {cotizacion.paqueteNombre}
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-neutral-600 dark:text-neutral-400">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-neutral-400" />
                {cotizacion.destino}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                Fecha: <strong>{cotizacion.fecha}</strong>
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-neutral-400" />
                {cotizacion.pasajeros} persona(s) ({cotizacion.adultos} adt
                {cotizacion.ninos > 0 ? `, ${cotizacion.ninos} chd` : ''}
                {cotizacion.infantes > 0 ? `, ${cotizacion.infantes} inf` : ''})
              </span>
            </div>
          </div>

          {/* Gran Total Protagonista (0c.16.2) */}
          <div className="flex flex-col items-start sm:items-end">
            <span className="text-xs font-bold text-neutral-500 uppercase">
              Total Venta Sugerido
            </span>
            {cotizacion.alternativas.some((a) => a.masBarata || a.unidad === 'POR_GRUPO') && (
              <div
                data-testid="badge-promo-vigente"
                className="mb-1 flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              >
                <Tag className="h-3 w-3" />
                <span>Promo vigente disponible</span>
              </div>
            )}
            <div className="cifra mt-1 text-3xl font-black text-neutral-900 dark:text-white">
              {formatearDinero(cotizacion.total)}
            </div>
            <span className="mt-0.5 text-[10px] text-neutral-500">
              El número que el asesor copia y pega en WhatsApp
            </span>
          </div>
        </div>

        {/* Aviso obligatorio de tasa portuaria / impuesto de muelle */}
        {requiereAvisoImpuestoMuelle(cotizacion.destino, cotizacion.paqueteNombre) && (
          <div
            data-testid="aviso-impuesto-muelle"
            role="note"
            className="mt-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50/90 p-3.5 text-xs text-amber-900 shadow-2xs dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <Ship className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
            <div>
              <span className="font-bold">Aviso obligatorio para el viajero:</span> Impuesto de
              muelle no incluido. La tasa portuaria se cancela directamente en taquilla antes de
              abordar la embarcación (aprox. $26.500 COP por persona en taquilla del muelle de La
              Bodeguita / puntos de zarpe). No está incluida en el valor del tour.
            </div>
          </div>
        )}

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
                    {linea.presentacion?.listaTachada && (
                      <span
                        data-testid="linea-lista-tachada"
                        className="mr-1.5 text-[11px] font-semibold text-neutral-400 line-through dark:text-neutral-500"
                      >
                        {formatearDinero(linea.presentacion.listaTachada)}
                      </span>
                    )}
                    <span>
                      {formatearDinero(linea.presentacion?.venta ?? linea.precioUnitario)}
                    </span>
                    {linea.presentacion?.leyenda === 'PROMO_VENCIDA' && (
                      <span
                        data-testid="linea-promo-vencida"
                        className="ml-1.5 inline-block rounded bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                      >
                        Promo vencida
                      </span>
                    )}
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

        {/* Cargos que el viajero paga en destino: aparte y NUNCA dentro del total */}
        {cotizacion.cargosEnDestino && cotizacion.cargosEnDestino.length > 0 && (
          <div
            data-testid="cargos-en-destino"
            className="mt-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/40"
          >
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                Cargos en destino
              </h3>
              <span className="rounded-md bg-neutral-200 px-2 py-0.5 text-[10px] font-bold text-neutral-800 uppercase dark:bg-neutral-700 dark:text-neutral-100">
                No incluido
              </span>
            </div>
            <p className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-400">
              Se pagan en destino y no suman al total de la cotización.
            </p>
            <ul className="mt-2 space-y-1.5">
              {cotizacion.cargosEnDestino.map((cargo, i) => (
                <li
                  key={`${cargo.concepto}-${i}`}
                  className="flex items-start justify-between gap-3 text-xs"
                >
                  <span className="text-neutral-800 dark:text-neutral-200">
                    {cargo.concepto}
                    {cargo.nota && (
                      <span className="block text-[11px] text-neutral-500">{cargo.nota}</span>
                    )}
                  </span>
                  <span className="cifra shrink-0 text-right font-semibold text-neutral-900 dark:text-white">
                    {cargo.monto ? formatearDinero(cargo.monto) : 'Monto por confirmar'}
                    <span className="block text-[10px] font-normal text-neutral-500">
                      {cargo.unidad === 'POR_PERSONA' ? 'por persona' : 'por grupo'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Acción Destacada: Guardar Cotización debajo del Total (0c.22) */}
        {alGuardarCotizacion && (
          <div className="mt-4 flex flex-col items-center justify-between gap-3 rounded-xl border border-purple-200 bg-purple-50/60 p-4 sm:flex-row dark:border-purple-900/40 dark:bg-purple-950/20">
            <div>
              <h3 className="text-xs font-bold text-purple-950 dark:text-purple-200">
                ¿Deseas registrar esta cotización para el cliente?
              </h3>
              <p className="mt-0.5 text-[11px] text-purple-700 dark:text-purple-400">
                Guarda la Versión 1 oficial e inmutable. Podrás modificarla después generando nuevas
                versiones sin alterar el histórico.
              </p>
            </div>
            <button
              type="button"
              onClick={alGuardarCotizacion}
              disabled={guardando}
              className="flex min-h-[44px] w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-purple-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-purple-800 disabled:opacity-50 sm:w-auto"
            >
              <Bookmark className="h-4 w-4" />
              <span>Guardar cotización</span>
            </button>
          </div>
        )}
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
          {alGuardarCotizacion && (
            <button
              type="button"
              onClick={alGuardarCotizacion}
              disabled={guardando}
              className="flex min-h-[44px] items-center gap-2 rounded-xl border border-purple-300 bg-purple-50 px-4 py-2.5 text-xs font-bold text-purple-800 shadow-2xs transition-colors hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300"
            >
              <Bookmark className="h-4 w-4" />
              <span>Guardar Oficial</span>
            </button>
          )}

          <button
            type="button"
            onClick={alCopiarWhatsApp}
            className="bg-ok-600 hover:bg-ok-700 flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-3 text-xs font-bold text-white shadow-xs transition-colors"
          >
            {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copiado ? '¡Copiado al Portapapeles!' : 'Copiar Propuesta para WhatsApp'}
          </button>
        </div>
      </section>
    </div>
  );
}
