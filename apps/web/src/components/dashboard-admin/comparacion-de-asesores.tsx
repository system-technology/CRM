'use client';

/**
 * Comparación entre asesores (T-344, ADR-0035 §6: solo con alcance de agencia).
 *
 * Escritorio: tabla. Móvil: una tarjeta por asesor con lo esencial (ventas cerradas, lo vendido por
 * moneda, aceptación y respuesta); el resto —conversión y fracción de respuesta— queda en «Más
 * cifras», desplegable, para no perderlo ni desbordar. Se ordena por ventas CERRADAS (un número):
 * un total de dinero obligaría a sumar monedas (R8).
 */
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatearDinero } from '../../lib/formato';
import type { FilaDeAsesor } from '../../lib/dashboard-admin-logica';
import { formatearMinutosReporte } from '../../lib/reportes-logica';

function Monedas({ lista }: { lista: FilaDeAsesor['ventas'] }) {
  if (lista.length === 0) return <span className="text-neutral-600 dark:text-neutral-400">—</span>;
  return (
    <span className="flex flex-col">
      {lista.map((d) => (
        <span key={d.moneda} className="cifra">
          {formatearDinero(d, { conCodigo: true })}
        </span>
      ))}
    </span>
  );
}

function NoDisponible() {
  return (
    <span className="text-aviso-700 flex items-center gap-1.5 text-sm">
      <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
      No disponible: no se pudo leer a este asesor
    </span>
  );
}

const TEXTO_SIN_ACTIVIDAD = 'Sin actividad en el periodo';

export function ComparacionDeAsesores({
  filas,
  recortado,
}: {
  filas: FilaDeAsesor[];
  recortado: boolean;
}) {
  if (filas.length === 0) {
    return (
      <p className="text-sm text-neutral-700 dark:text-neutral-300">
        Aún no hay asesores activos para comparar. Invita a tu equipo desde Configuración.
      </p>
    );
  }
  const hayMargen = filas.some((f) => f.hayMargen);

  return (
    <div>
      {/* Escritorio y tablet: tabla */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm" data-testid="tabla-asesores">
          <caption className="sr-only">
            Asesores ordenados por ventas cerradas en el periodo
          </caption>
          <thead>
            <tr className="border-b border-neutral-200 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
              <th scope="col" className="py-2 pr-3 font-medium">
                Asesor
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Ventas cerradas
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Vendido
              </th>
              {hayMargen ? (
                <th scope="col" className="px-3 py-2 font-medium">
                  Margen
                </th>
              ) : null}
              <th scope="col" className="px-3 py-2 font-medium">
                Cotizaciones aceptadas
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Ganadas de las cerradas
              </th>
              <th scope="col" className="py-2 pl-3 font-medium">
                Primera respuesta
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) =>
              f.noDisponible ? (
                <tr key={f.id} className="border-b border-neutral-100 dark:border-neutral-800">
                  <th scope="row" className="py-2.5 pr-3 font-medium">
                    {f.nombre}
                  </th>
                  <td colSpan={hayMargen ? 6 : 5} className="px-3 py-2.5">
                    <NoDisponible />
                  </td>
                </tr>
              ) : (
                <tr
                  key={f.id}
                  data-testid="fila-asesor"
                  className={`border-b border-neutral-100 align-top dark:border-neutral-800 ${
                    f.sinActividad ? 'text-neutral-600 dark:text-neutral-400' : ''
                  }`}
                >
                  <th
                    scope="row"
                    className="py-2.5 pr-3 font-medium text-neutral-900 dark:text-white"
                  >
                    {f.nombre}
                  </th>
                  {f.sinActividad ? (
                    <td colSpan={hayMargen ? 6 : 5} className="px-3 py-2.5">
                      {TEXTO_SIN_ACTIVIDAD}
                    </td>
                  ) : (
                    <>
                      <td className="cifra px-3 py-2.5 text-right font-semibold">
                        {f.ventasCerradas}
                      </td>
                      <td className="px-3 py-2.5">
                        <Monedas lista={f.ventas} />
                      </td>
                      {hayMargen ? (
                        <td className="px-3 py-2.5">
                          <Monedas lista={f.margenes} />
                        </td>
                      ) : null}
                      <td className="px-3 py-2.5">
                        <span className="cifra">{f.aceptacion.texto}</span>
                        {f.aceptacion.esPorcentaje ? (
                          <span className="block text-xs text-neutral-600 dark:text-neutral-400">
                            {f.aceptacion.fraccion}
                          </span>
                        ) : null}
                      </td>
                      <td className="cifra px-3 py-2.5">{f.conversion.texto}</td>
                      <td className="py-2.5 pl-3">
                        <span className="cifra">{formatearMinutosReporte(f.medianaMinutos)}</span>
                        <span className="block text-xs text-neutral-600 dark:text-neutral-400">
                          {f.respondidas.fraccion} respondidas
                        </span>
                      </td>
                    </>
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      {/* Móvil: tarjetas */}
      <ul className="space-y-3 md:hidden" data-testid="tarjetas-asesores">
        {filas.map((f) => (
          <li
            key={f.id}
            className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
          >
            <p className="font-medium text-neutral-900 dark:text-white">{f.nombre}</p>
            {f.noDisponible ? (
              <p className="mt-1">
                <NoDisponible />
              </p>
            ) : f.sinActividad ? (
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                {TEXTO_SIN_ACTIVIDAD}
              </p>
            ) : (
              <>
                <p className="mt-1 text-sm">
                  <span className="cifra text-xl font-extrabold text-neutral-900 dark:text-white">
                    {f.ventasCerradas}
                  </span>{' '}
                  <span className="text-neutral-700 dark:text-neutral-300">
                    {f.ventasCerradas === 1 ? 'venta cerrada' : 'ventas cerradas'}
                  </span>
                </p>
                <div className="mt-1 text-sm text-neutral-800 dark:text-neutral-200">
                  <Monedas lista={f.ventas} />
                </div>
                {f.hayMargen && f.margenes.length > 0 ? (
                  <p className="mt-1 text-xs text-neutral-700 dark:text-neutral-300">
                    Margen:{' '}
                    {f.margenes.map((m) => formatearDinero(m, { conCodigo: true })).join(' · ')}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-neutral-700 dark:text-neutral-300">
                  Aceptación: <span className="font-semibold">{f.aceptacion.texto}</span>
                  {' · '}Primera respuesta:{' '}
                  <span className="font-semibold">{formatearMinutosReporte(f.medianaMinutos)}</span>
                </p>
                <details className="mt-2 text-xs">
                  <summary className="text-acento-700 focus-visible:outline-acento-600 dark:text-acento-300 min-h-11 cursor-pointer py-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-2">
                    Más cifras
                  </summary>
                  <dl className="space-y-1 text-neutral-700 dark:text-neutral-300">
                    <div className="flex justify-between gap-2">
                      <dt>Ganadas de las cerradas</dt>
                      <dd className="cifra font-semibold">{f.conversion.texto}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Conversaciones respondidas</dt>
                      <dd className="cifra font-semibold">{f.respondidas.fraccion}</dd>
                    </div>
                  </dl>
                </details>
              </>
            )}
          </li>
        ))}
      </ul>

      {recortado ? (
        <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-400">
          Se comparan los primeros 12 asesores activos.
        </p>
      ) : null}
    </div>
  );
}
