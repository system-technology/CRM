/**
 * Vista de la demostración (T-566): ver el producto con los ojos de un asesor.
 *
 * En una agencia real los asesores son la mayoría de los usuarios. La demostración arranca con la
 * vista del DUEÑO (todo visible); esta preferencia deja mirarla como un asesor puro: «Mis números»
 * en vez de «Reportes de la agencia», sin Configuración.
 *
 * Límites, a propósito:
 * - Solo existe DENTRO del modo demostración (`esModoDemo()`); fuera de él siempre es `dueno`.
 *   No es un cambio de rol ni un atajo: no toca `tienePermiso`, ni la sesión, ni la API. Los
 *   permisos reales los decide el servidor (ADR-0011) y esta preferencia no llega a él.
 * - Solo decide qué se pinta: qué entradas del menú y qué alcance simulan los datos de muestra.
 * - Es visible: la insignia de demostración de la barra la nombra y permite cambiarla.
 */
import { useEffect, useState } from 'react';
import type { Permiso } from '@viajapro/contracts';
import { esModoDemo } from './modo-demo';

export type VistaDemo = 'dueno' | 'asesor';

export const CLAVE_LOCALSTORAGE_VISTA_DEMO = 'viajapro_vista_demo';
export const EVENTO_CAMBIO_VISTA_DEMO = 'viajapro:cambio-vista-demo';

/**
 * Lo que tiene un asesor puro: opera la bandeja, escribe en el CRM y cotiza; no ve neto y margen,
 * ni las conversaciones ajenas, ni los reportes de la agencia, ni administra equipo, roles o catálogo.
 * Solo alimenta el menú de la demostración; nunca se consulta para autorizar nada.
 */
export const PERMISOS_ASESOR_DEMO: readonly Permiso[] = [
  'bandeja.operar',
  'crm.escribir',
  'cotizacion.escribir',
];

/** Vista activa. `?vista=asesor|dueno` manda sobre lo guardado; `?alcanceDemo=propio` es su alias anterior. */
export function vistaDemo(): VistaDemo {
  if (!esModoDemo()) return 'dueno';
  if (typeof window === 'undefined') return 'dueno';
  try {
    const consulta = new URLSearchParams(window.location.search);
    const param = consulta.get('vista');
    if (param === 'asesor') return 'asesor';
    if (param === 'dueno') return 'dueno';
    if (consulta.get('alcanceDemo') === 'propio') return 'asesor';
    return window.localStorage.getItem(CLAVE_LOCALSTORAGE_VISTA_DEMO) === 'asesor'
      ? 'asesor'
      : 'dueno';
  } catch {
    return 'dueno';
  }
}

export function fijarVistaDemo(vista: VistaDemo): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLAVE_LOCALSTORAGE_VISTA_DEMO, vista);
    window.dispatchEvent(new CustomEvent(EVENTO_CAMBIO_VISTA_DEMO, { detail: { vista } }));
  } catch {
    // Almacenamiento bloqueado: la vista no se recuerda, la pantalla sigue como estaba.
  }
}

export function useVistaDemo(): { vista: VistaDemo; alternar: () => void } {
  const [vista, setVista] = useState<VistaDemo>(() => vistaDemo());

  useEffect(() => {
    const releer = () => setVista(vistaDemo());
    releer();
    window.addEventListener(EVENTO_CAMBIO_VISTA_DEMO, releer);
    window.addEventListener('viajapro:cambio-modo-demo', releer);
    window.addEventListener('storage', releer);
    return () => {
      window.removeEventListener(EVENTO_CAMBIO_VISTA_DEMO, releer);
      window.removeEventListener('viajapro:cambio-modo-demo', releer);
      window.removeEventListener('storage', releer);
    };
  }, []);

  return { vista, alternar: () => fijarVistaDemo(vista === 'asesor' ? 'dueno' : 'asesor') };
}
