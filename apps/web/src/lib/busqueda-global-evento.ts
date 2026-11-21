/**
 * Apertura de la búsqueda global (la paleta Ctrl+K) desde fuera de quien la monta.
 *
 * La paleta la monta `BarraModulos`, una sola vez en el marco. La lupa fija de la cabecera móvil
 * (T-320, variante B) vive en otro punto del marco y le pide abrirse con este evento, igual que
 * el pie legal pide el modal de cookies: así no hay una segunda paleta ni estado compartido.
 */
export const EVENTO_ABRIR_BUSQUEDA_GLOBAL = 'viajapro:abrir-busqueda-global';

export function pedirAperturaDeBusquedaGlobal(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_BUSQUEDA_GLOBAL));
  }
}
