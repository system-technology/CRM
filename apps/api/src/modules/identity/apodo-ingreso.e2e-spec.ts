/**
 * Ingreso por apodo, de punta a punta (ADR-0031, PR 2).
 *
 * Aplicación ensamblada, HTTP real y PostgreSQL con RLS. Dos agencias:
 *
 *   · A: `ana` (dueña), `ana2` (otra dueña), `gina` (rol personalizado con SOLO
 *     `usuarios.administrar`), `beto` (asesor), `baja` (asesor desactivado), `tope` (asesora).
 *   · B: `eva` (asesora, con apodo propio) y `bruno` (asesor).
 *
 * **Con dos agencias en la base y el índice de apodos global, la función está APAGADA** (ADR-0031 §4,
 * B3), y eso es lo que se prueba primero, contra el catálogo y `tenants` reales. Para ejercitar el
 * resto, el bloque «encendida» sustituye SOLO el recuento de agencias por 1 (`vi.spyOn`): la base,
 * el índice, el disparador y Better Auth son los reales.
 *
 * Fixtures con el prefijo `fixture-aislamiento-` y correos `@fixture-identidad.test`; se borran por id.
 */
import 'reflect-metadata';

import { randomBytes } from 'node:crypto';
import { type INestApplication, type LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import type { SesionActual } from '@viajapro/contracts';
import { hashPassword } from 'better-auth/crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';
import { CorreoEnMemoria } from '../notifications/infrastructure/correo.en-memoria.js';
import { CORREO_CENTINELA } from './application/ingreso-por-identificador.js';
import { claveDeLimite, PREFIJO_DE_FALLOS_DE_INGRESO } from './application/limitador-de-envios.js';
import { AUTH } from './infrastructure/auth.provider.js';
import type { AuthDeViajaPro } from './infrastructure/crear-auth.js';
import { PuertoCatalogoDeApodos, hayIndiceGlobalDeApodos } from './domain/puertos-de-apodos.js';
import { CONSULTA_DE_INDICES_DE_ACCESOS } from './infrastructure/catalogo-de-apodos.prisma.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const ORIGEN_WEB = 'http://localhost:3000';
const CLAVE = 'una-clave-larga-de-prueba-1';
const marca = randomBytes(3).toString('hex');
const DOMINIO = '@fixture-identidad.test';

type Quien =
  'ana' | 'ana2' | 'gina' | 'beto' | 'baja' | 'tope' | 'eva' | 'bruno' | 'rafa' | 'rafb' | 'rafc';
const correo = (q: Quien): string => `fixture-aislamiento-apodo-${q}-${marca}${DOMINIO}`;
/** Apodos únicos por corrida: letra inicial, minúsculas y dígitos, sin prefijos reservados. */
const apodoDe = (q: Quien): string => `fx${marca}${q}`;
const IDENTIDAD: Record<Quien, string> = {
  ana: '',
  ana2: '',
  gina: '',
  beto: '',
  baja: '',
  tope: '',
  eva: '',
  bruno: '',
  rafa: '',
  rafb: '',
  rafc: '',
};
const USUARIO: Record<Quien, string> = {
  ana: '',
  ana2: '',
  gina: '',
  beto: '',
  baja: '',
  tope: '',
  eva: '',
  bruno: '',
  rafa: '',
  rafb: '',
  rafc: '',
};

let app: INestApplication;
let base: string;
let admin: PrismaClient;
let adminPg: Client;
let correoDePrueba: CorreoEnMemoria;
const lineasDeLog: string[] = [];
const clavesDeTope: string[] = [];

/** Captura TODO lo que la API escribe en sus logs, para afirmar que ningún apodo llega ahí. */
const capturador: LoggerService = {
  log: (m: unknown) => void lineasDeLog.push(String(m)),
  error: (m: unknown, ...resto: unknown[]) =>
    void lineasDeLog.push([m, ...resto].map(String).join(' ')),
  warn: (m: unknown) => void lineasDeLog.push(String(m)),
  debug: (m: unknown) => void lineasDeLog.push(String(m)),
  verbose: (m: unknown) => void lineasDeLog.push(String(m)),
};

interface Respuesta {
  estado: number;
  json: Record<string, unknown> & { error?: { code: string; message?: string } };
  setCookie: string[];
}

class Navegador {
  cookies = new Map<string, string>();
  constructor(readonly ip: string = `10.${rnd()}.${rnd()}.${rnd()}`) {}

  async llamar(
    metodo: 'GET' | 'POST' | 'PATCH',
    ruta: string,
    cuerpo?: unknown,
  ): Promise<Respuesta> {
    const cabeceras: Record<string, string> = {
      'x-forwarded-for': this.ip,
      ...(metodo === 'GET' ? {} : { 'content-type': 'application/json', origin: ORIGEN_WEB }),
    };
    if (this.cookies.size > 0) {
      cabeceras['cookie'] = [...this.cookies].map(([n, v]) => `${n}=${v}`).join('; ');
    }
    const r = await fetch(new URL(ruta, base), {
      method: metodo,
      headers: cabeceras,
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    });
    const texto = await r.text();
    const setCookie = r.headers.getSetCookie();
    for (const c of setCookie) {
      const [par] = c.split(';');
      const [nombre, ...valor] = (par ?? '').split('=');
      if (nombre) this.cookies.set(nombre, valor.join('='));
    }
    return {
      estado: r.status,
      json: texto ? (JSON.parse(texto) as Respuesta['json']) : {},
      setCookie,
    };
  }

  /** Iniciar sesión con lo que se le pase como `identificador` (correo o apodo). */
  entrar(identificador: string, contrasena = CLAVE): Promise<Respuesta> {
    return this.llamar('POST', '/api/v1/auth/sign-in/email', { identificador, contrasena });
  }

  apodo(id: string, apodo: string | null): Promise<Respuesta> {
    return this.llamar('PATCH', `/api/v1/identidad/miembros/${id}/apodo`, { apodo });
  }
}

function rnd(): number {
  return Math.floor(Math.random() * 250) + 1;
}

async function agencia(id: string, nombre: string) {
  await admin.tenant.create({
    data: { id, slug: `fixture-aislamiento-apodo-${id.slice(-12)}`, nombre, estado: 'ACTIVO' },
  });
  const dueno = await admin.rol.create({
    data: {
      tenantId: id,
      nombre: 'Dueño',
      clave: 'DUENO',
      permisos: ['usuarios.administrar', 'roles.administrar'],
    },
  });
  // Un rol personalizado con `usuarios.administrar` y NADA más: menos que el dueño.
  const gestor = await admin.rol.create({
    data: { tenantId: id, nombre: 'Gestor', permisos: ['usuarios.administrar'] },
  });
  const asesor = await admin.rol.create({
    data: { tenantId: id, nombre: 'Asesor', clave: 'ASESOR', permisos: [] },
  });
  return { dueno: dueno.id, gestor: gestor.id, asesor: asesor.id };
}

async function persona(q: Quien, tenantId: string, rolId: string): Promise<void> {
  const i = await admin.identidad.create({
    data: { correo: correo(q), nombre: `Fixture ${q}`, correoVerificado: true },
  });
  await admin.credencial.create({
    data: {
      identidadId: i.id,
      proveedor: 'credential',
      hashContrasena: await hashPassword(CLAVE),
    },
  });
  const u = await admin.usuario.create({
    data: { tenantId, identidadId: i.id, rolId, correo: correo(q), nombre: `Fixture ${q}` },
  });
  IDENTIDAD[q] = i.id;
  USUARIO[q] = u.id;
}

/** El apodo, puesto por la plataforma (dueña de la tabla): el disparador lo copia al índice. */
const fijarApodoDirecto = (q: Quien, apodo: string | null) =>
  admin.usuario.update({ where: { id: USUARIO[q] }, data: { apodo } });

const apodoEnElIndice = async (q: Quien): Promise<string | null> => {
  const { rows } = await adminPg.query<{ apodo: string | null }>(
    'SELECT apodo FROM accesos_identidad WHERE identidad_id = $1',
    [IDENTIDAD[q]],
  );
  return rows[0]?.apodo ?? null;
};

const secreto = (): string => process.env['BETTER_AUTH_SECRET'] ?? '';
const claveDe = (tipo: 'identidad' | 'identificador', valor: string): string => {
  const c = claveDeLimite(secreto(), tipo, valor, PREFIJO_DE_FALLOS_DE_INGRESO);
  clavesDeTope.push(c);
  return c;
};
const fallosDe = async (clave: string): Promise<number> =>
  (
    await adminPg.query(
      'SELECT 1 FROM verificaciones WHERE identificador = $1 AND expira_en > now()',
      [clave],
    )
  ).rowCount ?? 0;

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  const a = await agencia(TENANT_A, 'Agencia A');
  const b = await agencia(TENANT_B, 'Agencia B');
  await persona('ana', TENANT_A, a.dueno);
  await persona('ana2', TENANT_A, a.dueno);
  await persona('gina', TENANT_A, a.gestor);
  await persona('beto', TENANT_A, a.asesor);
  await persona('baja', TENANT_A, a.asesor);
  await persona('tope', TENANT_A, a.asesor);
  await persona('rafa', TENANT_A, a.asesor);
  await persona('rafb', TENANT_A, a.asesor);
  await persona('rafc', TENANT_A, a.asesor);
  await persona('eva', TENANT_B, b.asesor);
  await persona('bruno', TENANT_B, b.asesor);

  await fijarApodoDirecto('beto', apodoDe('beto'));
  await fijarApodoDirecto('eva', apodoDe('eva'));
  await fijarApodoDirecto('tope', apodoDe('tope'));
  await fijarApodoDirecto('baja', apodoDe('baja'));
  await fijarApodoDirecto('rafc', apodoDe('rafc'));
  // Desactivada: el disparador retira su par del índice y el apodo deja de resolver.
  await admin.usuario.update({
    where: { id: USUARIO.baja },
    data: { activo: false, eliminadoEn: new Date() },
  });

  app = await NestFactory.create(AppModule, { logger: capturador });
  app.useGlobalFilters(new DominioExcepcionFilter());
  (app as NestExpressApplication).set('trust proxy', 1);
  await app.listen(0);
  base = await app.getUrl();
  correoDePrueba = app.get(CorreoEnMemoria);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await app?.close();
  if (adminPg) {
    try {
      type Limpiador = (c: Client, ids: string[]) => Promise<unknown>;
      const ruta = '../../../../../packages/database/scripts/borrar-tenants.mjs';
      const modulo = (await import(new URL(ruta, import.meta.url).href)) as {
        borrarTenants: Limpiador;
      };
      await adminPg.query('BEGIN');
      await modulo.borrarTenants(adminPg, [TENANT_A, TENANT_B]);
      await adminPg.query('COMMIT');
      await adminPg.query('DELETE FROM identidades WHERE id = ANY($1::uuid[])', [
        Object.values(IDENTIDAD).filter((id) => id !== ''),
      ]);
      await adminPg.query('DELETE FROM verificaciones WHERE identificador = ANY($1)', [
        clavesDeTope,
      ]);
    } finally {
      await adminPg.end();
    }
  }
  await admin?.$disconnect();
});

describe('la precondición dura, contra la base real (ADR-0031 §4, B3)', () => {
  it('el catálogo real dice que el índice de apodos es global (fase 1)', async () => {
    const { rows } = await adminPg.query(CONSULTA_DE_INDICES_DE_ACCESOS);
    expect(hayIndiceGlobalDeApodos(rows as never)).toBe(true);
  });

  it('con más de una agencia, el apodo se trata como inexistente: la clave correcta no abre', async () => {
    const { rows } = await adminPg.query<{ n: number }>('SELECT count(*)::int AS n FROM tenants');
    expect(rows[0]?.n).toBeGreaterThan(1);

    const conApodo = await new Navegador().entrar(apodoDe('beto'));
    expect(conApodo.estado).toBe(401);
    expect(conApodo.json.error?.code).toBe('CREDENCIALES_INVALIDAS');
    expect(conApodo.setCookie).toHaveLength(0);
    // El correo sigue funcionando: la función apagada no toca el ingreso de siempre.
    expect((await new Navegador().entrar(correo('beto'))).estado).toBe(200);
  });

  it('el PATCH responde un error GENÉRICO, no el 409, ni siquiera con un apodo ya tomado', async () => {
    const ana = new Navegador();
    expect((await ana.entrar(correo('ana'))).estado).toBe(200);
    const libre = await ana.apodo(USUARIO.beto, `fx${marca}libre`);
    const tomado = await ana.apodo(USUARIO.gina, apodoDe('eva'));
    for (const r of [libre, tomado]) {
      expect(r.estado).toBe(400);
      expect(r.json.error?.code).toBe('CAMBIO_DE_APODO_NO_ADMITIDO');
    }
    expect(await apodoEnElIndice('gina')).toBeNull();
  });

  it('la API se niega a arrancar con el autoservicio activo y el índice global', async () => {
    const anterior = process.env['REGISTRO_AUTOSERVICIO_HABILITADO'];
    process.env['REGISTRO_AUTOSERVICIO_HABILITADO'] = 'true';
    const otra = await NestFactory.create(AppModule, { logger: false });
    try {
      await expect(otra.init()).rejects.toThrow(/apodos/i);
    } finally {
      if (anterior === undefined) delete process.env['REGISTRO_AUTOSERVICIO_HABILITADO'];
      else process.env['REGISTRO_AUTOSERVICIO_HABILITADO'] = anterior;
      await otra.close().catch(() => undefined);
    }
  });
});

describe('con la función encendida (recuento de agencias = 1; lo demás es real)', () => {
  beforeAll(() => {
    vi.spyOn(app.get(PuertoCatalogoDeApodos), 'cuentaDeAgencias').mockResolvedValue(1);
  });

  describe('iniciar sesión', () => {
    it('se entra con el apodo y con el correo: es la misma persona; el apodo se normaliza', async () => {
      const porCorreo = await new Navegador().entrar(correo('beto'));
      const porApodo = await new Navegador().entrar(apodoDe('beto'));
      const porApodoSucio = await new Navegador().entrar(`  ${apodoDe('beto').toUpperCase()} `);
      for (const r of [porCorreo, porApodo, porApodoSucio]) expect(r.estado).toBe(200);
      const ids = [porCorreo, porApodo, porApodoSucio].map(
        (r) => (r.json as unknown as SesionActual).identidad.id,
      );
      expect(new Set(ids)).toEqual(new Set([IDENTIDAD.beto]));
      expect((porApodo.json as unknown as SesionActual).tenantActivoId).toBe(TENANT_A);
      expect(Object.keys(porApodo.json)).not.toContain('token');
    });

    it('apodo inexistente, mal formado, de usuario desactivado y clave errónea dan LA MISMA respuesta', async () => {
      const casos = [
        await new Navegador().entrar(`fx${marca}nadie`),
        await new Navegador().entrar('ab'),
        await new Navegador().entrar('Peña con ñ!'),
        await new Navegador().entrar(apodoDe('baja')),
        await new Navegador().entrar(apodoDe('beto'), 'clave-equivocada-123'),
        await new Navegador().entrar(correo('beto'), 'clave-equivocada-123'),
        await new Navegador().entrar(`nadie-${marca}${DOMINIO}`),
        // La clave correcta del centinela tampoco abre nada.
        await new Navegador().entrar(CORREO_CENTINELA),
      ];
      for (const r of casos) {
        expect(r.estado).toBe(401);
        expect(r.setCookie).toHaveLength(0);
        expect(r.json).toEqual(casos[0]?.json);
      }
      expect(casos[0]?.json.error?.code).toBe('CREDENCIALES_INVALIDAS');
      // El correo que se resolvió no vuelve al cliente.
      expect(JSON.stringify(casos)).not.toContain(correo('beto'));
    });

    it('el apodo de A no da una sesión en B (el paso 4 decide): beto no puede cambiar a B', async () => {
      const nav = new Navegador();
      expect((await nav.entrar(apodoDe('beto'))).estado).toBe(200);
      const r = await nav.llamar('POST', '/api/v1/auth/tenant-activo', { tenantId: TENANT_B });
      expect(r.estado).toBe(403);
      // Y el apodo de B no abre con la clave de otra persona.
      expect((await new Navegador().entrar(apodoDe('eva'), 'clave-equivocada-123')).estado).toBe(
        401,
      );
    });

    it('el código de un solo uso sigue siendo solo por correo: el apodo no envía nada ni inicia sesión', async () => {
      const antes = correoDePrueba.para(correo('beto')).length;
      const enviar = await new Navegador().llamar('POST', '/api/v1/auth/otp/enviar', {
        correo: apodoDe('beto'),
      });
      expect(enviar.estado).toBe(400);
      const iniciar = await new Navegador().llamar('POST', '/api/v1/auth/otp/iniciar-sesion', {
        correo: apodoDe('beto'),
        codigo: '123456',
      });
      expect(iniciar.estado).toBe(400);
      expect(correoDePrueba.para(correo('beto')).length).toBe(antes);
    });

    it('`identificador` y `correo` a la vez se rechazan por forma (400); `correo` solo sigue valiendo', async () => {
      const dos = await new Navegador().llamar('POST', '/api/v1/auth/sign-in/email', {
        identificador: correo('beto'),
        correo: correo('beto'),
        contrasena: CLAVE,
      });
      expect(dos.estado).toBe(400);
      expect(dos.setCookie).toHaveLength(0);
      const legado = await new Navegador().llamar('POST', '/api/v1/auth/sign-in/email', {
        correo: correo('beto'),
        contrasena: CLAVE,
      });
      expect(legado.estado).toBe(200);
    });
  });

  describe('el tope por identificador (10 en 15 minutos)', () => {
    it('correo y apodo comparten contador; agotado, la clave correcta tampoco abre', async () => {
      const clave = claveDe('identidad', IDENTIDAD.tope);
      expect(await fallosDe(clave)).toBe(0);
      for (let i = 0; i < 5; i += 1) {
        expect((await new Navegador().entrar(correo('tope'), 'mala-clave-123456')).estado).toBe(
          401,
        );
        expect((await new Navegador().entrar(apodoDe('tope'), 'mala-clave-123456')).estado).toBe(
          401,
        );
      }
      // Los diez fallos cayeron en UNA sola clave, la de la identidad.
      expect(await fallosDe(clave)).toBe(10);

      for (const id of [correo('tope'), apodoDe('tope')]) {
        const r = await new Navegador().entrar(id);
        expect(r.estado).toBe(401);
        expect(r.json.error?.code).toBe('CREDENCIALES_INVALIDAS');
        expect(r.setCookie).toHaveLength(0);
      }
      // Y la clave no queda en la base en claro.
      const { rows } = await adminPg.query(
        'SELECT identificador FROM verificaciones WHERE identificador = $1',
        [clave],
      );
      expect(JSON.stringify(rows)).not.toContain(apodoDe('tope'));
    });

    it('el intento bloqueado escribe lo mismo que uno fallido normal (una fila más), y responde igual', async () => {
      const bloqueada = claveDe('identidad', IDENTIDAD.tope);
      const normal = claveDe('identidad', IDENTIDAD.eva);
      const antesB = await fallosDe(bloqueada);
      const antesN = await fallosDe(normal);

      const rBloqueada = await new Navegador().entrar(correo('tope'));
      const rNormal = await new Navegador().entrar(correo('eva'), 'mala-clave-123456');

      expect(await fallosDe(bloqueada)).toBe(antesB + 1);
      expect(await fallosDe(normal)).toBe(antesN + 1);
      expect(rBloqueada.estado).toBe(rNormal.estado);
      expect(rBloqueada.json).toEqual(rNormal.json);
    });

    it('con la IP agotada, la identidad bloqueada y una que no lo está dan el mismo 429', async () => {
      const nav = new Navegador(`192.0.2.${rnd()}`);
      // Se agota el cupo de la IP con identificadores ajenos.
      const estados: number[] = [];
      for (let i = 0; i < 6; i += 1) estados.push((await nav.entrar(`fx${marca}ip${i}`)).estado);
      expect(estados[5]).toBe(429);

      const bloqueada = await nav.entrar(correo('tope'));
      const libre = await nav.entrar(correo('bruno'));
      expect(bloqueada.estado).toBe(429);
      expect(libre.estado).toBe(429);
      expect(bloqueada.json).toEqual(libre.json);
      expect(bloqueada.json.error?.code).toBe('DEMASIADOS_INTENTOS');
    });
  });

  describe('ráfagas en paralelo (reservar antes de comprobar)', () => {
    /** Inscribe `n` fallos vigentes para la identidad, como si ya hubieran ocurrido. */
    async function sembrarFallos(q: Quien, n: number): Promise<string> {
      const clave = claveDe('identidad', IDENTIDAD[q]);
      for (let i = 0; i < n; i += 1) {
        await adminPg.query(
          `INSERT INTO verificaciones (id, identificador, valor, expira_en, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, '1', now() + interval '15 minutes', now(), now())`,
          [clave],
        );
      }
      return clave;
    }

    it('20 ingresos en paralelo con la clave CORRECTA sobre una identidad con 9 fallos: como mucho 1 abre sesión', async () => {
      const clave = await sembrarFallos('rafa', 9);
      const rs = await Promise.all(
        Array.from({ length: 20 }, () => new Navegador().entrar(correo('rafa'))),
      );
      const abiertas = rs.filter((r) => r.estado === 200);
      expect(abiertas.length).toBeLessThanOrEqual(1);
      for (const r of rs.filter((x) => x.estado !== 200)) {
        expect(r.estado).toBe(401);
        expect(r.json.error?.code).toBe('CREDENCIALES_INVALIDAS');
        expect(r.setCookie).toHaveLength(0);
      }
      // 9 previos + 20 reservas, menos la que abrió sesión (si hubo) y la liberó.
      expect(await fallosDe(clave)).toBeGreaterThanOrEqual(28);
    });

    it('ráfaga en paralelo con la clave ERRÓNEA: no más de 10 comprobaciones efectivas en la ventana', async () => {
      const auth = app.get<AuthDeViajaPro>(AUTH);
      const original = auth.handler.bind(auth);
      const puente = auth as { handler: (req: Request) => Promise<Response> };
      const correos: string[] = [];
      // Cuenta cada llamada efectiva a Better Auth y con qué correo (la verificación de la clave).
      puente.handler = (req) =>
        req
          .clone()
          .json()
          .then((json: unknown) => {
            const cuerpo = json as { email?: string };
            if (req.url.includes('/sign-in/email') && cuerpo.email) correos.push(cuerpo.email);
            return original(req);
          });
      try {
        const rs = await Promise.all(
          Array.from({ length: 25 }, () =>
            new Navegador().entrar(correo('rafb'), 'mala-clave-123456'),
          ),
        );
        for (const r of rs) {
          expect(r.estado).toBe(401);
          expect(r.json.error?.code).toBe('CREDENCIALES_INVALIDAS');
        }
        // Solo las reservas que contaron <= 10 llegaron a probar la contraseña del correo real.
        const efectivas = correos.filter((c) => c === correo('rafb')).length;
        expect(efectivas).toBeLessThanOrEqual(10);
        expect(efectivas).toBeGreaterThanOrEqual(1);
        // El resto fue por el mismo camino, con el centinela.
        expect(correos).toHaveLength(25);
        expect(correos.filter((c) => c === CORREO_CENTINELA)).toHaveLength(25 - efectivas);
        expect(await fallosDe(claveDe('identidad', IDENTIDAD.rafb))).toBe(25);
      } finally {
        puente.handler = original;
      }
    });

    it('el ingreso exitoso (secuencial) no consume cupo: la fila reservada se borra', async () => {
      const clave = claveDe('identidad', IDENTIDAD.rafc);
      for (let i = 0; i < 15; i += 1) {
        const r = await new Navegador().entrar(i % 2 === 0 ? correo('rafc') : apodoDe('rafc'));
        expect(r.estado, `intento ${i}`).toBe(200);
        expect(await fallosDe(clave)).toBe(0);
      }
    });
  });

  describe('PATCH /api/v1/identidad/miembros/:id/apodo', () => {
    it('la dueña fija el apodo; con él se entra; cambiarlo retira el viejo; null lo quita', async () => {
      const ana = new Navegador();
      expect((await ana.entrar(correo('ana'))).estado).toBe(200);
      const nuevo = `fx${marca}nuevo`;
      const otro = `fx${marca}otro`;

      const fija = await ana.apodo(USUARIO.ana2, nuevo);
      expect(fija.estado).toBe(200);
      expect(fija.json).toEqual({ ok: true });
      expect(await apodoEnElIndice('ana2')).toBe(nuevo);
      expect((await new Navegador().entrar(nuevo)).estado).toBe(200);

      expect((await ana.apodo(USUARIO.ana2, otro)).estado).toBe(200);
      expect((await new Navegador().entrar(nuevo)).estado).toBe(401);
      expect((await new Navegador().entrar(otro)).estado).toBe(200);

      expect((await ana.apodo(USUARIO.ana2, null)).estado).toBe(200);
      expect(await apodoEnElIndice('ana2')).toBeNull();
      expect((await new Navegador().entrar(otro)).estado).toBe(401);
    });

    it('deja un registro de auditoría con quién y a quién, y SIN el apodo', async () => {
      const ana = new Navegador();
      await ana.entrar(correo('ana'));
      const apodo = `fx${marca}audit`;
      expect((await ana.apodo(USUARIO.ana2, apodo)).estado).toBe(200);
      expect((await ana.apodo(USUARIO.ana2, null)).estado).toBe(200);
      const { rows } = await adminPg.query<{
        accion: string;
        usuario_id: string;
        entidad_id: string;
        detalle: unknown;
      }>(
        `SELECT accion, usuario_id, entidad_id, detalle FROM registros_auditoria
          WHERE tenant_id = $1 AND entidad = 'usuario' AND entidad_id = $2 AND accion LIKE 'identity.apodo_%'
          ORDER BY id DESC LIMIT 2`,
        [TENANT_A, USUARIO.ana2],
      );
      expect(rows.map((r) => r.accion)).toEqual([
        'identity.apodo_quitado',
        'identity.apodo_fijado',
      ]);
      for (const r of rows) {
        expect(r.usuario_id).toBe(USUARIO.ana);
        expect(JSON.stringify(r)).not.toContain(apodo);
      }
    });

    it('la dueña de A recibe 404 al fijar el apodo de un miembro de B, y no cambia nada', async () => {
      const ana = new Navegador();
      await ana.entrar(correo('ana'));
      const r = await ana.apodo(USUARIO.bruno, `fx${marca}ajeno`);
      expect(r.estado).toBe(404);
      expect(await apodoEnElIndice('bruno')).toBeNull();
      // Tampoco puede quitarle el suyo a eva.
      expect((await ana.apodo(USUARIO.eva, null)).estado).toBe(404);
      expect(await apodoEnElIndice('eva')).toBe(apodoDe('eva'));
    });

    it('un rol personalizado con usuarios.administrar no edita el apodo de quien tiene más permisos', async () => {
      const gina = new Navegador();
      expect((await gina.entrar(correo('gina'))).estado).toBe(200);
      const alDueno = await gina.apodo(USUARIO.ana, `fx${marca}robado`);
      expect(alDueno.estado).toBe(403);
      expect(await apodoEnElIndice('ana')).toBeNull();
      // Sí puede con quien tiene menos o los mismos permisos que ella.
      const alAsesor = await gina.apodo(USUARIO.tope, `fx${marca}porgina`);
      expect(alAsesor.estado).toBe(200);
    });

    it('un dueño sí puede cambiar el apodo de otro dueño', async () => {
      const ana = new Navegador();
      await ana.entrar(correo('ana'));
      expect((await ana.apodo(USUARIO.ana2, `fx${marca}colega`)).estado).toBe(200);
      expect((await ana.apodo(USUARIO.ana2, null)).estado).toBe(200);
    });

    it('sin sesión 401; sin el permiso 403; un miembro dado de baja es 404', async () => {
      expect((await new Navegador().apodo(USUARIO.beto, `fx${marca}x1`)).estado).toBe(401);
      const beto = new Navegador();
      await beto.entrar(correo('beto'));
      expect((await beto.apodo(USUARIO.tope, `fx${marca}x2`)).estado).toBe(403);
      const ana = new Navegador();
      await ana.entrar(correo('ana'));
      expect((await ana.apodo(USUARIO.baja, `fx${marca}x3`)).estado).toBe(404);
    });

    it('rechaza el formato y los reservados con 400, sin repetir el apodo', async () => {
      const ana = new Navegador();
      await ana.entrar(correo('ana'));
      for (const malo of ['Admin', 'viajapro.ventas', 'ab', 'con ñ', 'a b', 5, undefined]) {
        const r = await ana.llamar('PATCH', `/api/v1/identidad/miembros/${USUARIO.ana2}/apodo`, {
          apodo: malo,
        });
        expect(r.estado, String(malo)).toBe(400);
        expect(r.json.error?.code).toBe('ENTRADA_INVALIDA');
      }
      expect(
        (
          await ana.llamar('PATCH', `/api/v1/identidad/miembros/${USUARIO.ana2}/apodo`, {
            apodo: 'valido.pero',
            tenantId: TENANT_B,
          })
        ).estado,
      ).toBe(400);
    });

    it('un apodo ya tomado da 409 APODO_NO_DISPONIBLE, en la misma agencia y en otra, y no se imprime', async () => {
      const ana = new Navegador();
      await ana.entrar(correo('ana'));
      const aEnLaMisma = await ana.apodo(USUARIO.gina, apodoDe('beto'));
      const aEnOtra = await ana.apodo(USUARIO.gina, apodoDe('eva'));
      for (const r of [aEnLaMisma, aEnOtra]) {
        expect(r.estado).toBe(409);
        expect(r.json.error?.code).toBe('APODO_NO_DISPONIBLE');
        expect(JSON.stringify(r.json)).not.toContain(marca);
      }
      // La colisión revirtió el cambio: Gina sigue sin apodo, en `usuarios` y en el índice.
      expect(await apodoEnElIndice('gina')).toBeNull();
      const gina = await admin.usuario.findUnique({
        where: { id: USUARIO.gina },
        select: { apodo: true },
      });
      expect(gina?.apodo).toBeNull();
    });
  });

  it('ningún apodo aparece en el log capturado, tampoco en la ruta del 409 ni en los fallos de ingreso', () => {
    const apodos = (Object.keys(IDENTIDAD) as Quien[]).map(apodoDe);
    const texto = lineasDeLog.join('\n');
    for (const a of apodos) expect(texto, a).not.toContain(a);
    expect(texto).not.toContain(`fx${marca}`);
    // El correo centinela tampoco se loguea como un intento real.
    expect(texto).not.toContain(CORREO_CENTINELA);
  });
});
