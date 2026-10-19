'use client';

import React from 'react';
import Link from 'next/link';
import { Plane, Calendar, FileText, ArrowRight } from 'lucide-react';

interface TarjetaCotizacionProps {
  id?: string;
  titulo: string;
  destino?: string;
  unidades: string;
  moneda: string;
  vigenteHasta?: string | null;
  version?: number;
}

export function TarjetaCotizacion({
  id: _id = 'cot-preview',
  titulo,
  destino,
  unidades,
  moneda,
  vigenteHasta,
  version = 1,
}: TarjetaCotizacionProps) {
  const precioFormateado = (parseInt(unidades, 10) / 100).toLocaleString('es-CO');

  return (
    <div className="w-full max-w-[400px] overflow-hidden rounded-xl border border-neutral-200 bg-white text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100">
      {/* Cabecera de la propuesta */}
      <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50/80 px-3.5 py-2.5 dark:border-neutral-700/60 dark:bg-neutral-800/80">
        <div className="flex items-center gap-2">
          <div className="bg-acento-50 text-acento-700 dark:bg-acento-950/60 dark:text-acento-300 rounded-md p-1">
            <Plane className="h-4 w-4" />
          </div>
          <div>
            <span className="text-xs font-bold">Propuesta de Paquete</span>
            <span className="py-0.2 ml-1.5 rounded bg-neutral-200 px-1 text-[9px] font-semibold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300">
              v{version}
            </span>
          </div>
        </div>
        <span className="bg-ok-50 text-ok-700 dark:bg-ok-950/60 dark:text-ok-400 rounded-full px-2 py-0.5 text-[10px] font-bold">
          Enviada
        </span>
      </div>

      {/* Contenido */}
      <div className="space-y-2.5 p-3.5 text-xs">
        <div>
          <h4 className="font-bold text-neutral-900 dark:text-neutral-100">{titulo}</h4>
          {destino && (
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Destino: {destino}</p>
          )}
        </div>

        {vigenteHasta && (
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
            <Calendar className="h-3.5 w-3.5 text-neutral-400" />
            <span>Válido hasta: {vigenteHasta}</span>
          </div>
        )}

        {/* Precio en grande con clase .cifra */}
        <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-2.5 dark:border-neutral-700/40 dark:bg-neutral-900/40">
          <span className="text-[10px] font-medium text-neutral-400">Total cotizado:</span>
          <p className="cifra text-acento-700 dark:text-acento-400 text-base font-extrabold">
            $ {precioFormateado} <span className="text-xs font-semibold">{moneda}</span>
          </p>
        </div>
      </div>

      {/* Acción */}
      <div className="border-t border-neutral-100 bg-neutral-50/50 p-2.5 dark:border-neutral-700/60 dark:bg-neutral-800/40">
        <Link
          href="/cotizador"
          className="bg-acento-700 hover:bg-acento-800 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold text-white shadow-2xs transition-colors"
        >
          <FileText className="h-3.5 w-3.5" />
          <span>Ver propuesta en Cotizador</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
