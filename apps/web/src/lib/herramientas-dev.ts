/**
 * Herramientas de desarrollo visibles en la interfaz (alternar API real, prueba de estrés).
 * Apagadas por defecto: el asesor y quien hace una demostración no deben verlas.
 * Se encienden con NEXT_PUBLIC_HERRAMIENTAS_DEV=true en el entorno de desarrollo.
 */
export function herramientasDevActivas(): boolean {
  return process.env['NEXT_PUBLIC_HERRAMIENTAS_DEV'] === 'true';
}
