/**
 * Dos cifras de HOY que sirve el servidor (T-528) y que «Mis números» y «Hoy» pintan igual
 * (T-546): las cotizaciones abiertas por antigüedad y lo que falta por cobrar, por moneda.
 *
 * - **Se pinta lo que llegó.** Nada de contar sobre listas de agencia en el cliente: el alcance
 *   lo impuso el servidor y la web no lo reconstruye.
 * - **Una fila por moneda (R8).** Enteros en la unidad mínima de cada moneda; nunca una suma entre
 *   monedas distintas.
 * - **`truncado` (T-538).** Si el servidor leyó solo una parte de los archivos abiertos, la cifra
 *   es un mínimo: se escribe «o más» y se avisa, en vez de presentarla como el total.
 */
import React from 'react';
import type { CotizacionesAbiertas, PorCobrar } from '@viajapro/contracts';
import { formatearDinero } from '../../lib/formato';
import {
  AVISO_POR_COBRAR_TRUNCADO,
  plural,
  textoDeArchivos,
  tramosDeAntiguedad,
} from '../../lib/mis-numeros-logica';

const rotulo = 'text-xs text-neutral-600 dark:text-neutral-400';

export function CotizacionesAbiertasPorAntiguedad({ datos }: { datos: CotizacionesAbiertas }) {
  return (
    <div data-testid="cotizaciones-abiertas-hoy">
      <p className="cifra text-2xl font-black text-neutral-900 dark:text-white">{datos.total}</p>
      <p className={rotulo}>
        {plural(datos.borradores, 'borrador', 'borradores')} ·{' '}
        {plural(datos.enviadas, 'enviada', 'enviadas')}
      </p>
      <p className="mt-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
        Enviadas sin respuesta
      </p>
      <ul data-testid="cotizaciones-por-antiguedad" className="mt-1 space-y-0.5">
        {tramosDeAntiguedad(datos.porAntiguedad).map((t) => (
          <li key={t.clave} className="flex justify-between gap-3">
            <span className={rotulo}>{t.rotulo}</span>
            <span
              className={`cifra text-xs font-semibold ${
                t.clave === 'masDeSiete' && t.cantidad > 0
                  ? 'text-alerta-700 dark:text-alerta-400'
                  : 'text-neutral-900 dark:text-white'
              }`}
            >
              {t.cantidad}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SaldoPorCobrarPorMoneda({ datos }: { datos: PorCobrar }) {
  const aviso = datos.truncado ? (
    <p
      className="text-aviso-700 mt-2 text-xs dark:text-amber-400"
      role="note"
      data-testid="por-cobrar-truncado"
    >
      {AVISO_POR_COBRAR_TRUNCADO}
    </p>
  ) : null;

  if (datos.porMoneda.length === 0) {
    return (
      <div data-testid="por-cobrar-hoy">
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          {datos.truncado
            ? 'No hay saldo pendiente entre los archivos revisados.'
            : 'Nada por cobrar en archivos abiertos.'}
        </p>
        {aviso}
      </div>
    );
  }

  return (
    <div data-testid="por-cobrar-hoy">
      <ul className="space-y-3">
        {datos.porMoneda.map((f) => (
          <li key={f.moneda} data-testid={`por-cobrar-${f.moneda}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="cifra text-xl font-extrabold text-neutral-900 dark:text-white">
                {formatearDinero(f.saldo)}
                {datos.truncado && (
                  <span
                    className="ml-1 text-xs font-semibold text-neutral-600 dark:text-neutral-400"
                    data-testid={`por-cobrar-minimo-${f.moneda}`}
                  >
                    o más
                  </span>
                )}
              </span>
              <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                {f.moneda}
              </span>
            </div>
            <p className={rotulo}>{textoDeArchivos(f.archivos, datos.truncado)} con saldo</p>
          </li>
        ))}
      </ul>
      {aviso}
    </div>
  );
}
