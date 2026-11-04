/**
 * T-088: `req.ip` detrás de la cadena real de staging, simulada con cabeceras.
 *
 * Cadena: cliente -> balanceador de Render -> Next (rewrite `/api/v1/*`) -> API. Cada salto añade
 * la dirección de su par a `x-forwarded-for`. El valor de `API_TRUST_PROXY` debe igualar los saltos
 * que SÍ son nuestros: con uno de menos, `req.ip` es la del proxy y toda la web comparte cuota de
 * límite de intentos; con uno de más, el atacante elige su IP escribiendo la cabecera.
 *
 * Esto fija la aritmética. La prueba de humo con dos redes reales sigue siendo manual y está en
 * `docs/07-ingenieria/despliegue-staging.md` (paso 7).
 */
import express from 'express';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { leerProxyDeConfianza } from './proxy-de-confianza.js';

let servidor: Server | undefined;

afterEach(() => {
  servidor?.close();
  servidor = undefined;
});

/** Levanta la API con el `trust proxy` que daría `API_TRUST_PROXY` y devuelve la `req.ip` vista. */
async function ipVistaPorLaApi(apiTrustProxy: string | undefined, xff: string): Promise<string> {
  const app = express();
  app.set('trust proxy', leerProxyDeConfianza({ API_TRUST_PROXY: apiTrustProxy }));
  app.get('/ip', (req, res) => {
    res.send(req.ip ?? '');
  });
  const s = createServer(app);
  servidor = s;
  await new Promise<void>((ok) => s.listen(0, '127.0.0.1', ok));
  const { port } = s.address() as AddressInfo;
  return new Promise<string>((ok, mal) => {
    const r = request(
      { host: '127.0.0.1', port, path: '/ip', headers: { 'x-forwarded-for': xff } },
      (res) => {
        let cuerpo = '';
        res.on('data', (c: Buffer) => (cuerpo += c.toString()));
        res.on('end', () => ok(cuerpo));
      },
    );
    r.on('error', mal);
    r.end();
  });
}

describe('req.ip detrás del rewrite de Next', () => {
  // El API recibe, de Next, `x-forwarded-for: <cliente>, <par que vio Next>` y su propio socket es
  // Next (red privada de Render). Hay dos saltos nuestros: Next (socket) y el balanceador.
  const LB = '10.0.0.7';
  const a = (cliente: string): string => `${cliente}, ${LB}`;

  it('con 2 saltos, dos clientes distintos dan dos IP distintas', async () => {
    expect(await ipVistaPorLaApi('2', a('203.0.113.10'))).toBe('203.0.113.10');
    expect(await ipVistaPorLaApi('2', a('198.51.100.20'))).toBe('198.51.100.20');
  });

  it('con 1 salto de menos, todos los clientes se ven como el balanceador', async () => {
    const x = await ipVistaPorLaApi('1', a('203.0.113.10'));
    const y = await ipVistaPorLaApi('1', a('198.51.100.20'));
    expect(x).toBe(LB);
    expect(y).toBe(LB);
  });

  it('con 2 saltos, una cabecera falsificada por el cliente no elige su IP', async () => {
    // El cliente escribe `x-forwarded-for: 1.2.3.4`; el balanceador añade la real y Next el LB.
    expect(await ipVistaPorLaApi('2', `1.2.3.4, 203.0.113.10, ${LB}`)).toBe('203.0.113.10');
  });

  it('sin API_TRUST_PROXY se ignora la cabecera (por defecto, seguro)', async () => {
    expect(await ipVistaPorLaApi(undefined, a('203.0.113.10'))).toBe('127.0.0.1');
  });
});
