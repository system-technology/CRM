/**
 * Qué alcance tiene quien mira una vista de agencia (reportes, seguimientos, ficha del contacto).
 *
 * Hoy el servidor da «toda la agencia» a quien tiene `conversaciones.ver_todas` y «solo lo suyo» al
 * resto (cierre provisional, PR #395). El ADR-0035 (T-342) cambia la llave a un permiso propio de
 * reportes y la respuesta traerá su `alcance`. **Todo lo que depende de esa llave vive aquí**: las
 * pantallas preguntan `alcanceDeVista(sesion)` y muestran estos textos, sin nombrar el permiso.
 * Cuando llegue T-342 se cambia esta función; las pantallas y los textos no se tocan.
 */
import type { SesionActual } from '@viajapro/contracts';
import { puedeVerTodasConversaciones } from './permisos';

export type AlcanceDeVista = 'AGENCIA' | 'PROPIO' | 'DESCONOCIDO';

/**
 * `DESCONOCIDO` si no hay sesión con acceso a una agencia (demostración, o la sesión aún carga):
 * ahí no se afirma nada, para no mentirle a nadie.
 */
export function alcanceDeVista(sesion: SesionActual | null | undefined): AlcanceDeVista {
  if (!sesion?.acceso) return 'DESCONOCIDO';
  return puedeVerTodasConversaciones(sesion) ? 'AGENCIA' : 'PROPIO';
}

/** Reportes: el servidor responde 403 `PERMISO_DENEGADO` a quien solo ve lo suyo. */
export const TEXTO_REPORTES_SOLO_ADMINISTRACION = {
  titulo: 'Esta vista es de administración',
  detalle:
    'Los reportes de la agencia los ve quien la administra. Tus conversaciones, cotizaciones y seguimientos los sigues viendo en Bandeja, Cotizaciones y Seguimientos.',
} as const;

/** Seguimientos y ficha del contacto: sin el alcance de agencia solo se listan los del asesor. */
export const TEXTO_SOLO_LO_PROPIO = {
  seguimientos:
    'Ves solo tus seguimientos. Los de tus compañeros los ve quien administra la agencia.',
  fichaContacto:
    'Aquí ves solo tus seguimientos de este contacto. Los de tus compañeros los ve quien administra la agencia.',
} as const;
