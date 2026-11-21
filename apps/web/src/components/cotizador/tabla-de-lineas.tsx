import React from 'react';

export interface ColumnaDeLineas {
  id: string;
  titulo: string;
  /** El nombre de la línea: ocupa el ancho entero de la tarjeta en el celular. */
  esConcepto?: boolean;
  /** Se alinea a la derecha en la tabla (cifras). */
  derecha?: boolean;
  /** La cifra de la fila: sale en negrita. */
  esSubtotal?: boolean;
}

export interface FilaDeLineas {
  clave: string;
  celdas: Record<string, React.ReactNode>;
}

export interface TablaDeLineasProps {
  columnas: ColumnaDeLineas[];
  filas: FilaDeLineas[];
  /** Texto del pie («Total Cotización:») y la cifra, que nunca se corta. */
  etiquetaTotal: string;
  total: string;
  /** Para las pruebas de navegador: un id único por tabla. */
  testId?: string;
}

/**
 * El desglose de líneas de precio con UN solo DOM: tabla desde `md`, y en el celular cada fila es
 * una tarjeta (concepto arriba, una cifra por renglón con su etiqueta) y el total queda entero en
 * su propio renglón. Sin desplazamiento lateral dentro del contenedor: el total de la tabla salía
 * cortado («10.800.») a 390 px.
 */
export function TablaDeLineas({
  columnas,
  filas,
  etiquetaTotal,
  total,
  testId,
}: TablaDeLineasProps) {
  return (
    <div
      data-testid={testId}
      className="rounded-xl border border-neutral-100 md:overflow-x-auto dark:border-neutral-800"
    >
      <table className="block w-full text-xs md:table">
        <thead className="hidden md:table-header-group">
          <tr className="border-b border-neutral-100 bg-neutral-50 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-400">
            {columnas.map((c) => (
              <th
                key={c.id}
                className={`px-4 py-2.5 font-medium ${c.derecha ? 'text-right' : 'text-left'}`}
              >
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="block divide-y divide-neutral-100 md:table-row-group dark:divide-neutral-800/60">
          {filas.map((fila) => (
            <tr
              key={fila.clave}
              className="block space-y-1 px-3 py-3 md:table-row md:space-y-0 md:p-0"
            >
              {columnas.map((c) => (
                <td
                  key={c.id}
                  data-etiqueta={c.titulo}
                  className={`${
                    c.esConcepto
                      ? 'block font-bold text-neutral-800 dark:text-neutral-200'
                      : 'flex items-baseline justify-between gap-3 before:text-neutral-600 before:content-[attr(data-etiqueta)] dark:before:text-neutral-400'
                  } md:table-cell md:px-4 md:py-3 md:before:content-none ${
                    c.derecha ? 'cifra md:text-right' : 'text-neutral-600'
                  } ${
                    c.esSubtotal
                      ? 'text-sm font-black text-neutral-900 dark:text-white'
                      : c.esConcepto
                        ? ''
                        : 'text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  {c.esConcepto || !c.derecha ? (
                    c.esConcepto ? (
                      fila.celdas[c.id]
                    ) : (
                      <span>{fila.celdas[c.id]}</span>
                    )
                  ) : (
                    <span className="text-right">{fila.celdas[c.id]}</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot className="block md:table-footer-group">
          <tr className="flex items-baseline justify-between gap-3 border-t-2 border-neutral-200 bg-neutral-50/80 px-3 py-3 font-bold md:table-row md:p-0 dark:border-neutral-700 dark:bg-neutral-800/60">
            <td
              colSpan={Math.max(1, columnas.length - 1)}
              className="min-w-0 text-neutral-800 md:px-4 md:py-3 md:text-right dark:text-neutral-200"
            >
              {etiquetaTotal}
            </td>
            <td
              data-testid={testId ? `${testId}-total` : undefined}
              className="cifra text-acento-700 dark:text-acento-400 shrink-0 text-base font-black whitespace-nowrap md:px-4 md:py-3 md:text-right"
            >
              {total}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
