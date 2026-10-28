/**
 * Politica de seguridad de contenido (CSP) con nonce por peticion (T-069).
 * Next inyecta scripts en linea para hidratar; sin nonce, 'script-src self' los bloquea.
 * Con 'nonce-<n>' + 'strict-dynamic' no hace falta 'unsafe-inline' ni 'unsafe-eval' en produccion.
 */
export function buildCsp(nonce: string, env: NodeJS.ProcessEnv = process.env): string {
  const isDev = env['NODE_ENV'] === 'development';
  const apiOrigin = env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3333';
  const wsOrigin =
    env['NEXT_PUBLIC_WS_URL'] ??
    apiOrigin.replace('http://', 'ws://').replace('https://', 'wss://');

  return [
    "default-src 'self'",
    `connect-src 'self' ${apiOrigin} ${wsOrigin}`,
    // En desarrollo se mantiene lo anterior: el recargador de React exige 'unsafe-eval'.
    isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}
