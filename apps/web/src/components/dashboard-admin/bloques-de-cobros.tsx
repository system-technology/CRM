'use client';

/**
 * Cobros, salidas próximas y destinos (T-344). Salen de `GET /cobros`: los archivos ABIERTOS con
 * su saldo ya derivado por el servidor. El dinero va siempre por moneda (R8).
 *
 * Móvil: «Por cobrar» y «Salen pronto» van primero (lo que pide una acción hoy) y la lista de
 * salidas muestra cinco con «Ver las N»; en escritorio salen todas las de los próximos 30 días.
 */
import React, { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock } from 'lucide-react';
import type { FilaDeCobro } from '@viajapro/contracts';
import { formatearDinero, formatearFecha } from '../../lib/formato';
import {
  cobrosPorMoneda,
  DIAS_DE_SALIDAS_PROXIMAS,
  salidasProximas,
  textoDeDiasParaSalir,
} from '../../lib/dashboard-admin-logica';

const etiqueta = 'text-xs font-medium text-neutral-600 dark:text-neutral-400';

export interface DatosDeCobros {
  datos: FilaDeCobro[];
  truncado: boolean;
}

export function AvisoTruncado({ truncado }: { truncado: boolean }) {
  if (!truncado) return null;
  return (
    <p className="text-aviso-700 mt-3 text-xs" role="note">
      La agencia tiene más archivos abiertos de los que caben en esta vista: las cifras pueden estar
      incompletas.
    </p>
  );
}

export function CobrosPorCobrar({ datos }: { datos: DatosDeCobros }) {
  const monedas = cobrosPorMoneda(datos.datos).filter((m) => m.archivos > 0);
  const hayDeuda = monedas.some((m) => BigInt(m.porCobrar.unidades) > 0n);
  if (!hayDeuda) {
    return (
      <p className="text-sm text-neutral-700 dark:text-neutral-300">
        No hay saldos por cobrar en los archivos abiertos.
      </p>
    );
  }
  return (
    <div>
      <ul className="space-y-3">
        {monedas
          .filter((m) => BigInt(m.porCobrar.unidades) > 0n)
          .map((m) => (
            <li
              key={m.moneda}
              className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
              data-testid={`cobros-${m.moneda}`}
            >
              <p className={etiqueta}>Por cobrar en {m.moneda}</p>
              <p className="cifra mt-1 text-2xl font-extrabold break-words text-neutral-900 dark:text-white">
                {formatearDinero(m.porCobrar, { conCodigo: true })}
              </p>
              {BigInt(m.vencido.unidades) > 0n ? (
                <p className="text-alerta-700 mt-1.5 flex items-start gap-1.5 text-sm font-semibold">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Vencido: {formatearDinero(m.vencido, { conCodigo: true })} (
                    {m.archivosVencidos === 1 ? '1 archivo' : `${m.archivosVencidos} archivos`})
                  </span>
                </p>
              ) : null}
              {BigInt(m.porVencer.unidades) > 0n ? (
                <p className="text-aviso-700 mt-1 flex items-start gap-1.5 text-sm">
                  <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Por vencer: {formatearDinero(m.porVencer, { conCodigo: true })} (
                    {m.archivosPorVencer === 1 ? '1 archivo' : `${m.archivosPorVencer} archivos`})
                  </span>
                </p>
              ) : null}
            </li>
          ))}
      </ul>
      <AvisoTruncado truncado={datos.truncado} />
    </div>
  );
}

const LIMITE_MOVIL = 5;

export function SalidasProximas({ datos, hoy }: { datos: DatosDeCobros; hoy: string }) {
  const [verTodas, setVerTodas] = useState(false);
  const salidas = salidasProximas(datos.datos, hoy);
  if (salidas.length === 0) {
    return (
      <p className="text-sm text-neutral-700 dark:text-neutral-300">
        No hay salidas en los próximos {DIAS_DE_SALIDAS_PROXIMAS} días.
      </p>
    );
  }
  const ocultas = salidas.length - LIMITE_MOVIL;
  return (
    <div>
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {salidas.map((s, i) => (
          <li
            key={s.archivoId}
            data-testid="salida-proxima"
            className={`${
              i >= LIMITE_MOVIL && !verTodas ? 'hidden md:flex' : 'flex'
            } min-h-11 flex-col gap-0.5 py-2.5 md:flex-row md:items-center md:justify-between md:gap-3`}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                {s.destino}{' '}
                <span className="font-normal text-neutral-600 dark:text-neutral-400">
                  · {formatearFecha(s.fechaSalida, { zona: 'UTC' })}
                </span>
              </p>
              <p className="text-xs text-neutral-700 dark:text-neutral-300">
                {textoDeDiasParaSalir(s.diasParaSalir)} ·{' '}
                <Link
                  href={`/viajes?id=${s.archivoId}`}
                  className="text-acento-700 focus-visible:outline-acento-600 dark:text-acento-300 font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Archivo {s.numero}
                </Link>
              </p>
            </div>
            {s.conSaldo ? (
              <p
                className={`flex shrink-0 items-center gap-1.5 text-sm font-semibold ${
                  s.urgente ? 'text-aviso-700' : 'text-neutral-800 dark:text-neutral-200'
                }`}
              >
                {s.urgente ? <AlertTriangle aria-hidden="true" className="size-4" /> : null}
                <span className="cifra">Debe {formatearDinero(s.saldo, { conCodigo: true })}</span>
              </p>
            ) : (
              <p className="text-ok-700 shrink-0 text-sm">Pagado</p>
            )}
          </li>
        ))}
      </ul>
      {ocultas > 0 && !verTodas ? (
        <button
          type="button"
          onClick={() => setVerTodas(true)}
          className="text-acento-700 focus-visible:outline-acento-600 dark:text-acento-300 mt-2 min-h-11 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 md:hidden"
        >
          Ver las {salidas.length} salidas
        </button>
      ) : null}
    </div>
  );
}
