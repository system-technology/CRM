'use client';

import React from 'react';
import Link from 'next/link';
import { Calendar, Compass, MapPin, Sparkles, Users } from 'lucide-react';
import type { SalidaPublicada } from '@viajapro/contracts';
import { formatearNochesLabel, formatearCondicionDesde } from '../../lib/catalogo-logica';
import { formatearDinero } from '../../lib/api';

interface TarjetaSalidaPublicadaProps {
  salida: SalidaPublicada;
}

export function TarjetaSalidaPublicada({ salida }: TarjetaSalidaPublicadaProps) {
  // Formatear fecha amigable para Colombia (ej: Sábado, 3 de octubre de 2026)
  const fechaObj = new Date(salida.fecha + 'T12:00:00Z');
  const fechaTexto = new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(fechaObj);

  const nochesTxt = formatearNochesLabel(salida.noches);
  const condicionDesde = formatearCondicionDesde(salida);

  return (
    <article className="flex w-full min-w-0 flex-col justify-between overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs transition-all hover:border-neutral-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700">
      <div>
        {/* Cabecera de la tarjeta con Fecha y Tipo */}
        <div className="border-b border-neutral-100 bg-neutral-50/80 p-3.5 sm:p-4 dark:border-neutral-800/80 dark:bg-neutral-800/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="bg-acento-50 text-acento-700 dark:bg-acento-950/60 dark:text-acento-300 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold">
              <Calendar className="h-3.5 w-3.5" />
              <span className="capitalize">{fechaTexto}</span>
            </span>

            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {nochesTxt}
            </span>
          </div>

          <h3 className="mt-3 text-base font-bold text-neutral-900 dark:text-white">
            {salida.paqueteNombre}
          </h3>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
              {salida.destino}
            </span>

            {salida.tarifas > 1 && (
              <span className="flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                <Sparkles className="h-3 w-3" />
                {salida.tarifas} opciones / promo
              </span>
            )}

            {salida.desdeEsDeGrupo && (
              <span className="flex items-center gap-1 rounded bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700 dark:bg-purple-950/50 dark:text-purple-300">
                <Users className="h-3 w-3" />
                Promo grupal
              </span>
            )}
          </div>
        </div>

        {/* Cuerpo informativo */}
        <div className="space-y-2.5 p-3.5 text-xs text-neutral-600 sm:p-4 dark:text-neutral-300">
          <div className="flex flex-wrap items-center justify-between gap-1 border-b border-neutral-100 pb-2 dark:border-neutral-800">
            <span className="text-neutral-400">Salida:</span>
            <span className="font-semibold text-neutral-800 dark:text-neutral-200">
              Fecha fija confirmada ({salida.fecha})
            </span>
          </div>

          {salida.cupoTotal !== null ? (
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-neutral-400">Cupo total:</span>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                {salida.cupoTotal} sillas
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Cupo:</span>
              <span className="text-neutral-500">Salida programada grupal</span>
            </div>
          )}
        </div>
      </div>

      {/* Pie de tarjeta con Tarifa Desde y Botón Cotizar */}
      <div className="border-t border-neutral-100 bg-neutral-50/50 p-3.5 sm:p-4 dark:border-neutral-800/80 dark:bg-neutral-800/20">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-1">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">Tarifa desde:</span>
          <div className="text-right">
            <span className="cifra text-lg font-extrabold text-neutral-900 dark:text-white">
              {formatearDinero(salida.desde)}
            </span>
            <span
              className={`block text-[10px] ${
                condicionDesde.esGrupo
                  ? 'font-medium text-purple-700 dark:text-purple-300'
                  : 'text-neutral-400'
              }`}
            >
              {condicionDesde.subtitulo}
            </span>
          </div>
        </div>

        <Link
          href={`/cotizador?paqueteId=${encodeURIComponent(salida.paqueteId)}&fecha=${encodeURIComponent(salida.fecha)}`}
          className="bg-acento-600 hover:bg-acento-700 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold text-white shadow-xs transition-colors"
        >
          <Compass className="h-4 w-4" />
          Cotizar esta salida
        </Link>
      </div>
    </article>
  );
}
