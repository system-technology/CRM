'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  X,
  Clock,
  Compass,
  MapPin,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';
import type { ProductoCatalogoAgrupado, SalidaChipInfo } from '../../lib/catalogo-logica';

interface FichaDetalleExcursionProps {
  producto: ProductoCatalogoAgrupado | null;
  alCerrar: () => void;
}

export function FichaDetalleExcursion({ producto, alCerrar }: FichaDetalleExcursionProps) {
  const [salidaSeleccionada, setSalidaSeleccionada] = useState<SalidaChipInfo | null>(() => {
    return producto?.salidas[0] ?? null;
  });
  const [copiado, setCopiado] = useState(false);

  if (!producto) return null;

  const salidaActiva = salidaSeleccionada ?? producto.salidas[0];

  const generarTextoWhatsApp = () => {
    const fechaTxt = salidaActiva ? salidaActiva.fecha : 'A consultar';
    let texto = `*${producto.nombre}*\n`;
    texto += `📍 *Destino:* ${producto.destino}\n`;
    texto += `⏱️ *Duración y Horario:* ${producto.noches === 0 ? '1 día (Pasadía)' : `${producto.dias}D/${producto.noches}N`} · ${producto.horario}\n`;
    texto += `🏷️ *Tarifa:* ${producto.precioEtiqueta}\n`;
    texto += `📅 *Salida seleccionada:* ${fechaTxt}\n\n`;

    texto += `✅ *Incluye:*\n${producto.inclusiones.map((inc) => ` • ${inc}`).join('\n')}\n\n`;

    if (producto.requiereImpuestoMuelle) {
      texto += `⚠️ *Aviso importante:* Impuesto de muelle no incluido (tasa portuaria requerida al abordar en taquilla del muelle, no incluida en el valor del tour).\n\n`;
    }

    texto += `_¿Deseas apartar tus cupos para esta fecha? Quedo atento a tus comentarios._`;
    return texto;
  };

  const copiarPropuesta = async () => {
    const texto = generarTextoWhatsApp();
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Fallback
    }
  };

  const urlCotizador = salidaActiva
    ? `/cotizador?paqueteId=${encodeURIComponent(producto.paqueteId)}&fecha=${encodeURIComponent(salidaActiva.fecha)}`
    : `/cotizador?paqueteId=${encodeURIComponent(producto.paqueteId)}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-ficha-excursion"
      data-testid="modal-ficha-excursion"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-xs sm:p-6"
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-neutral-900">
        {/* Cabecera modal */}
        <div className="flex items-start justify-between border-b border-neutral-100 bg-neutral-50/80 p-4 sm:p-5 dark:border-neutral-800 dark:bg-neutral-800/40">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-[11px] font-bold text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                {producto.noches === 0
                  ? 'Excursión de 1 día'
                  : `${producto.dias}D / ${producto.noches}N`}
              </span>
              <span className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                <MapPin className="h-3.5 w-3.5 text-neutral-400" />
                {producto.destino}
              </span>
            </div>
            <h2
              id="titulo-ficha-excursion"
              className="mt-2 text-lg font-bold text-neutral-900 dark:text-white"
            >
              {producto.nombre}
            </h2>
          </div>

          <button
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar ficha"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2 text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Contenido deslizable */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {/* Horario y precio general */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 dark:border-neutral-800 dark:bg-neutral-800/50">
              <span className="text-[11px] font-medium text-neutral-400 uppercase">
                Horario operativo:
              </span>
              <div className="mt-1 flex items-center gap-1.5 font-bold text-neutral-800 dark:text-neutral-200">
                <Clock className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                <span>{producto.horario}</span>
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 dark:border-neutral-800 dark:bg-neutral-800/50">
              <span className="text-[11px] font-medium text-neutral-400 uppercase">
                Tarifa de referencia:
              </span>
              <div className="mt-1 font-bold text-neutral-800 dark:text-neutral-200">
                <span className="text-base text-teal-700 dark:text-teal-400">
                  {producto.precioEtiqueta}
                </span>
              </div>
            </div>
          </div>

          {/* Aviso de muelle si aplica */}
          {producto.requiereImpuestoMuelle && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <strong className="font-semibold">Impuesto de muelle no incluido:</strong> Tasa
                portuaria requerida al abordar en taquilla del muelle (aprox. $26.500 COP por
                persona, pago directo en efectivo o tarjeta en taquilla).
              </div>
            </div>
          )}

          {/* Selector de salidas programadas */}
          <div>
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Próximas salidas programadas ({producto.salidas.length})
              </h4>
              <span className="text-xs text-neutral-400">Selecciona una fecha</span>
            </div>

            {producto.salidas.length > 0 ? (
              <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {producto.salidas.map((s) => {
                  const activa = salidaActiva?.vigenciaId === s.vigenciaId;
                  return (
                    <button
                      key={s.vigenciaId}
                      type="button"
                      onClick={() => setSalidaSeleccionada(s)}
                      className={`flex min-h-[44px] flex-col justify-center rounded-xl border p-2.5 text-left text-xs transition-colors ${
                        activa
                          ? 'border-teal-500 bg-teal-50/80 text-teal-950 ring-2 ring-teal-500/20 dark:bg-teal-950/40 dark:text-teal-200'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold capitalize">{s.etiquetaFecha}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            s.estadoCupo === 'ULTIMOS_CUPOS'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                              : s.estadoCupo === 'AGOTADO'
                                ? 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                          }`}
                        >
                          {s.etiquetaCupo}
                        </span>
                      </div>
                      <span className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                        {s.fecha}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 text-xs text-neutral-400 italic">
                No hay salidas disponibles registradas.
              </p>
            )}
          </div>

          {/* Inclusiones y Exclusiones */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-neutral-200 p-3.5 dark:border-neutral-800">
              <h4 className="flex items-center gap-1.5 text-xs font-bold text-neutral-800 dark:text-neutral-200">
                <CheckCircle2 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                <span>El tour incluye</span>
              </h4>
              <ul className="mt-2 space-y-1.5 text-xs text-neutral-600 dark:text-neutral-300">
                {producto.inclusiones.map((inc, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                    <span>{inc}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-neutral-200 p-3.5 dark:border-neutral-800">
              <h4 className="flex items-center gap-1.5 text-xs font-bold text-neutral-800 dark:text-neutral-200">
                <XCircle className="h-4 w-4 text-neutral-400" />
                <span>No incluye</span>
              </h4>
              <ul className="mt-2 space-y-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                {producto.exclusiones.map((exc, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-neutral-300 dark:bg-neutral-600" />
                    <span>{exc}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Pie con acciones */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 bg-neutral-50 p-4 sm:p-5 dark:border-neutral-800 dark:bg-neutral-800/60">
          <button
            type="button"
            onClick={() => {
              void copiarPropuesta();
            }}
            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            {copiado ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            <span>{copiado ? '¡Copiado para WhatsApp!' : 'Copiar propuesta rápida'}</span>
          </button>

          <Link
            href={urlCotizador}
            className="flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-teal-700"
          >
            <Compass className="h-4 w-4" />
            <span>Cotizar fecha seleccionada</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
