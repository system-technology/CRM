'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import type { CotizacionGuardada } from '@viajapro/contracts';
import { obtenerCotizacionGuardadaApi } from '../../lib/cotizaciones-api';
import { TarjetaCotizacion } from './tarjeta-cotizacion';

interface TarjetaCotizacionEnviadaProps {
  cotizacionId: string;
  /** La conversación donde está la tarjeta: el detalle la conserva para «Volver al chat». */
  conversacionId?: string | undefined;
  /** Texto del mensaje tal como se envió; es lo único que se muestra si la cotización no carga. */
  texto: string | null;
}

/**
 * Tarjeta de un mensaje con `cotizacionId`: muestra la cotización REAL (titulo, destino, venta,
 * vigencia, versión). Mientras carga o si falla, solo el texto enviado y un enlace a la
 * cotización. Nunca datos inventados.
 */
export function TarjetaCotizacionEnviada({
  cotizacionId,
  conversacionId,
  texto,
}: TarjetaCotizacionEnviadaProps) {
  const sufijoConversacion = conversacionId
    ? `?conversacion=${encodeURIComponent(conversacionId)}`
    : '';
  const [cotizacion, setCotizacion] = useState<CotizacionGuardada | null>(null);

  useEffect(() => {
    let vigente = true;
    setCotizacion(null);
    obtenerCotizacionGuardadaApi(cotizacionId)
      .then((c) => {
        if (vigente) setCotizacion(c);
      })
      .catch(() => {
        // Sin datos: se queda el respaldo (texto enviado + enlace).
      });
    return () => {
      vigente = false;
    };
  }, [cotizacionId]);

  const version = cotizacion
    ? (cotizacion.versiones.find((v) => v.numero === cotizacion.versionEnviada) ??
      cotizacion.versiones[cotizacion.versiones.length - 1])
    : undefined;

  if (cotizacion && version) {
    return (
      <TarjetaCotizacion
        id={cotizacion.id}
        titulo={cotizacion.titulo}
        destino={version.destino}
        unidades={version.venta.unidades}
        moneda={version.venta.moneda}
        version={version.numero}
        href={`/cotizaciones/${cotizacion.id}${sufijoConversacion}`}
      />
    );
  }

  return (
    <div
      data-testid="cotizacion-respaldo"
      className="w-full max-w-[400px] rounded-xl border border-neutral-200 bg-white p-3.5 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
    >
      {texto && <p className="whitespace-pre-wrap">{texto}</p>}
      <Link
        href={`/cotizaciones/${cotizacionId}${sufijoConversacion}`}
        className="text-acento-700 dark:text-acento-400 mt-2 inline-flex min-h-[44px] items-center gap-1.5 font-semibold hover:underline"
      >
        <FileText className="h-3.5 w-3.5" />
        <span>Ver cotización</span>
      </Link>
    </div>
  );
}
