'use client';

import React, { useState } from 'react';
import { SlidersHorizontal, ChevronDown } from 'lucide-react';

/**
 * Filtros que en el teléfono se pliegan detrás de un botón, y en pantalla ancha no cambian (T-630).
 *
 * Por qué existe, medido el 2026-11-24 a 390 px sobre las once pantallas: antes del primer dato había
 * entre 253 y 429 px de controles. Al descomponer la cabecera, **la muralla son los filtros**, no los
 * botones de exportar: 198 px en `/contactos`, 156 en `/catálogo`, 123 en `/cotizaciones`, porque cada
 * `select` ocupa su propia fila de 44 px. (T-630 señalaba «Exportar CSV», y ese botón **comparte fila
 * en tres de las cinco pantallas**: quitarlo recupera cero píxeles.)
 *
 * El buscador NO entra aquí: en el teléfono buscar es la acción principal de estas pantallas, así que
 * se queda siempre a la vista. Lo que se pliega es filtrar y las acciones secundarias.
 *
 * **El botón dice cuántos filtros hay activos.** Plegar un filtro esconde el estado, y una lista
 * filtrada que no se anuncia es peor que una muralla: la asesora busca un contacto que sí existe, no
 * lo ve, y no sabe por qué. Por eso `activos` no es opcional.
 *
 * Se resuelve con estado de React y no con `popover` ni `details`: es un panel que empuja el
 * contenido, no una capa flotante, y así el conteo y el `aria-expanded` quedan en un solo sitio.
 */
export function FiltrosPlegables({
  activos,
  children,
  etiqueta = 'Filtros',
  id = 'filtros-plegables',
}: {
  /** Cuántos filtros hay puestos ahora mismo. Se enseña en el botón. */
  activos: number;
  children: React.ReactNode;
  etiqueta?: string;
  id?: string;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      {/* Solo teléfono: el botón que pliega. */}
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-controls={id}
        data-testid="abrir-filtros"
        className="focus-visible:ring-acento-600 flex min-h-[44px] items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-xs font-semibold text-neutral-700 focus-visible:ring-2 focus-visible:outline-none sm:hidden dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-200"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{etiqueta}</span>
        {activos > 0 && (
          <span
            data-testid="filtros-activos"
            className="bg-acento-600 texto-micro flex min-w-4 items-center justify-center rounded-full px-1 font-bold text-white"
          >
            {activos}
          </span>
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${abierto ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {/*
        En el teléfono aparece solo al desplegar; de `sm:` en adelante está siempre, en línea, como
        antes. `flex` lo pone la clase de `sm:`, así que en ancho no depende del estado.
      */}
      <div
        id={id}
        data-testid="panel-de-filtros"
        className={`${abierto ? 'flex' : 'hidden'} w-full flex-wrap items-center gap-3 sm:flex sm:w-auto`}
      >
        {children}
      </div>
    </>
  );
}
