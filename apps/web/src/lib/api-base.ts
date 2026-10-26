/**
 * URL base y configuración de cliente para la API de ViajaPro.
 *
 * Conforme a ADR-0011 §2 (Mismo origen) y ADR-0013 (Despliegue staging):
 * - En el navegador, si NEXT_PUBLIC_API_URL no está definida explícitamente o es vacía,
 *   Next.js reescribe /api/v1/* hacia la API backend. Esto garantiza que las peticiones
 *   sean de primer origen (same-origin), permitiendo que las cookies HttpOnly funcionen
 *   en todos los navegadores (incluyendo Safari en iOS) sin problemas de SameSite o bloqueo de terceros.
 * - Si NEXT_PUBLIC_API_URL contiene un valor no vacío (por ejemplo en pruebas o proxies externos),
 *   se respeta como base absoluta.
 * - En el servidor (SSR / Server Components) o entorno de pruebas Node, utiliza
 *   API_INTERNAL_URL, NEXT_PUBLIC_API_URL o el fallback local 'http://localhost:3333'.
 */

export function obtenerBaseApi(): string {
  const envUrl = process.env['NEXT_PUBLIC_API_URL'];
  if (envUrl !== undefined && envUrl !== '') {
    return envUrl;
  }
  if (typeof window !== 'undefined') {
    return '';
  }
  return (
    process.env['API_INTERNAL_URL'] || process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3333'
  );
}
