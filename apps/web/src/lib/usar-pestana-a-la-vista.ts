import { useEffect, type RefObject } from 'react';

/**
 * Lleva la pestaña activa a la vista dentro de su tira desplazable (T-631).
 *
 * Por qué: medido el 2026-11-24 a 390 px, `/configuracion` tiene **nueve** pestañas que ocupan 1414 px
 * en un hueco de 342 —**siete quedan fuera**—. Si la activa es una de esas, se entra a la pantalla sin
 * ver en cuál se está. Pulsar una pestaña a medias también la revela, junto con parte de la siguiente,
 * así que quien use ratón sin rueda horizontal puede recorrerlas todas.
 *
 * `block: 'nearest'` es lo que evita que la página salte en vertical al corregir el horizontal, que es
 * el fallo clásico de usar `scrollIntoView` en una tira. No se usa `container: 'nearest'` —que lo
 * acotaría al propio desplazador— porque hoy casi ningún navegador lo implementa; con `block:
 * 'nearest'` el efecto práctico es el mismo en estas pantallas.
 */
export function usarPestanaALaVista<T extends HTMLElement>(
  tira: RefObject<T | null>,
  activa: string | number,
): void {
  useEffect(() => {
    const contenedor = tira.current;
    if (!contenedor) return;
    // Las dos formas que conviven en el producto: `/catálogo` marca la activa con `aria-selected`
    // (tiene semántica de pestañas completa) y `/configuración` con `aria-current` (T-631).
    const seleccionada = contenedor.querySelector<HTMLElement>(
      '[aria-selected="true"], [aria-current="true"]',
    );
    if (!seleccionada) return;
    seleccionada.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tira, activa]);
}
