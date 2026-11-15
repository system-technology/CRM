import { RUTAS_DE_ACCESO } from './redirigir-a-ingreso';

/**
 * Rutas que se pueden abrir sin sesión (T-126). Todo lo demás es del dashboard y exige sesión
 * cuando la autenticación real está activa.
 */
const PREFIJOS_PUBLICOS = [
  ...RUTAS_DE_ACCESO,
  '/aceptar-invitacion',
  '/terminos',
  '/privacidad',
  '/cookies',
  '/politica-cookies',
  '/salud',
];

export function esRutaPublica(ruta: string | null | undefined): boolean {
  if (!ruta) return false;
  return PREFIJOS_PUBLICOS.some((p) => ruta === p || ruta.startsWith(p + '/'));
}

/** Destino de login que conserva a dónde quería ir el asesor. */
export function destinoDeIngreso(ruta: string): string {
  const base = '/ingresar?motivo=sesion_requerida';
  return ruta && ruta !== '/' ? `${base}&redirigir=${encodeURIComponent(ruta)}` : base;
}
