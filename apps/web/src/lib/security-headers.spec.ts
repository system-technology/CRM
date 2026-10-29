import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextConfig } from 'next';
import { NextRequest } from 'next/server';
import { buildCsp } from './csp';
import { middleware } from '../middleware';

interface HeadersEntry {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

interface NextConfigWithHeaders extends NextConfig {
  headers?: () => Promise<HeadersEntry[]>;
}

async function loadConfig(): Promise<NextConfigWithHeaders> {
  const configModule = await import('../../next.config.mjs');
  return configModule.default;
}

const directiva = (csp: string, nombre: string): string =>
  csp.split('; ').find((d) => d.startsWith(nombre)) ?? '';

describe('Cabeceras de seguridad estaticas en next.config.mjs', () => {
  let config: NextConfigWithHeaders;

  beforeEach(async () => {
    vi.resetModules();
    config = await loadConfig();
  });

  it('emite X-Content-Type-Options y Referrer-Policy, y ya no la CSP (la emite el middleware)', async () => {
    const entradas = await config.headers!();
    const claves = entradas.flatMap((e) => e.headers.map((h) => h.key));

    expect(claves).toContain('X-Content-Type-Options');
    expect(claves).toContain('Referrer-Policy');
    expect(claves).not.toContain('Content-Security-Policy');

    const todas = entradas.flatMap((e) => e.headers);
    expect(todas.find((h) => h.key === 'X-Content-Type-Options')?.value).toBe('nosniff');
    expect(todas.find((h) => h.key === 'Referrer-Policy')?.value).toBe(
      'strict-origin-when-cross-origin',
    );
  });
});

describe('HSTS y Permissions-Policy (T-092, mitad web)', () => {
  it('emite Strict-Transport-Security y una Permissions-Policy minima', async () => {
    vi.resetModules();
    const config = await loadConfig();
    const todas = (await config.headers!()).flatMap((e) => e.headers);

    expect(todas.find((h) => h.key === 'Strict-Transport-Security')?.value).toBe(
      'max-age=31536000; includeSubDomains',
    );
    expect(todas.find((h) => h.key === 'Permissions-Policy')?.value).toBe(
      'camera=(), microphone=(), geolocation=()',
    );
  });
});

describe('buildCsp', () => {
  it('en produccion usa nonce y strict-dynamic, sin unsafe-inline ni unsafe-eval en script-src', () => {
    const csp = buildCsp('abc123', { NODE_ENV: 'production' });
    const script = directiva(csp, 'script-src');

    expect(script).toContain("'nonce-abc123'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain('unsafe-inline');
    expect(script).not.toContain('unsafe-eval');
    expect(csp).not.toContain('unsafe-eval');
  });

  it("en desarrollo mantiene 'unsafe-inline' y 'unsafe-eval' (recargador de React)", () => {
    const script = directiva(buildCsp('abc123', { NODE_ENV: 'development' }), 'script-src');
    expect(script).toContain("'unsafe-eval'");
    expect(script).toContain("'unsafe-inline'");
  });

  it('en pruebas no permite unsafe-eval', () => {
    expect(buildCsp('n', { NODE_ENV: 'test' })).not.toContain('unsafe-eval');
  });

  it('conserva el resto de directivas', () => {
    const csp = buildCsp('n', { NODE_ENV: 'production' });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain("font-src 'self' data:");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it('incluye los origenes de API y WebSocket del entorno', () => {
    const csp = buildCsp('n', {
      NODE_ENV: 'production',
      NEXT_PUBLIC_API_URL: 'https://api.example.com',
      NEXT_PUBLIC_WS_URL: 'wss://ws.example.com',
    });
    expect(csp).toContain('https://api.example.com');
    expect(csp).toContain('wss://ws.example.com');
  });

  it('deriva el origen WS del de la API cuando no hay NEXT_PUBLIC_WS_URL', () => {
    expect(
      buildCsp('n', { NODE_ENV: 'production', NEXT_PUBLIC_API_URL: 'https://api.example.com' }),
    ).toContain('wss://api.example.com');
    expect(
      buildCsp('n', { NODE_ENV: 'production', NEXT_PUBLIC_API_URL: 'http://localhost:3333' }),
    ).toContain('ws://localhost:3333');
  });
});

describe('middleware', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('pone la CSP con un nonce distinto por peticion y lo pasa en x-nonce', () => {
    const r1 = middleware(new NextRequest('http://localhost:3000/'));
    const r2 = middleware(new NextRequest('http://localhost:3000/'));

    const csp1 = r1.headers.get('Content-Security-Policy') ?? '';
    const csp2 = r2.headers.get('Content-Security-Policy') ?? '';
    const nonce1 = /'nonce-([^']+)'/.exec(csp1)?.[1];
    const nonce2 = /'nonce-([^']+)'/.exec(csp2)?.[1];

    expect(nonce1).toBeTruthy();
    expect(nonce2).toBeTruthy();
    expect(nonce1).not.toBe(nonce2);
    // Next reenvia al render las cabeceras de peticion declaradas en x-middleware-override-headers.
    expect(r1.headers.get('x-middleware-request-x-nonce')).toBe(nonce1);
    expect(r1.headers.get('x-middleware-override-headers')).toContain('x-nonce');
  });
});
