/**
 * La frontera de identidad y de tenant, de punta a punta (ADR-0011, rebanada 2).
 *
 * Aplicación ensamblada, HTTP real y PostgreSQL con RLS. **Dos agencias y una persona en las
 * dos**, que es el caso que hace daño si falla:
 *
 *   · `ana`  — dueña en A, asesora en B (un usuario en las dos agencias).
 *   · `beto` — asesor solo en A.
 *   · `dani` — dueña en C, una agencia que se suspende a mitad de la prueba.
 *
 * Lo que afirma, en el orden del flujo:
 *   · la cookie de A no lee datos de B, y una cabecera `x-dev-tenant-id` no la pisa;
 *   · una sesión con `tenant_activo_id` manipulado hacia una agencia ajena da 401 y se revoca;
 *   · cambiar a una agencia sin membresía da 403 y no escribe nada;
 *   · revocar la sesión corta la petición siguiente (sin caché de cookie);
 *   · una agencia suspendida rechaza la petición;
 *   · `incluirMargen=true` sin el permiso da 403;
 *   · el token de sesión no queda en claro en la base, ni sale en ninguna respuesta;
 *   · la cabecera de desarrollo se ignora fuera de `APP_ENV=local`;
 *   · iniciar sesión no distingue «correo inexistente» de «contraseña errónea», y se limita.
 *
 * **Fixtures propios**, con el prefijo `fixture-aislamiento-` que reconoce el limpiador, y las
 * identidades con el mismo prefijo en el correo (el que reconoce `limpiar-fixtures.mjs` para las
 * globales) y el dominio `@fixture-identidad.test`; esta prueba las borra por id al terminar.
 */
import 'reflect-metadata';

import { randomBytes } from 'node:crypto';
import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import type { SesionActual } from '@viajapro/contracts';
import { hashPassword } from 'better-auth/crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../shared/tenant/contexto-tenant.js';
import { hashearTokenDeSesion } from './infrastructure/token-de-sesion.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const TENANT_C = idDeTenant();
const DOMINIO = '@fixture-identidad.test';
const CLAVE = 'una-clave-larga-de-prueba-1';
const ORIGEN_WEB = 'http://localhost:3000';

let app: INestApplication;
let base: string;
let admin: PrismaClient;
let adminPg: Client;
let contactoA: string;
let contactoB: string;

const correo = {
  ana: `fixture-aislamiento-ana-${randomBytes(3).toString('hex')}${DOMINIO}`,
  beto: `fixture-aislamiento-beto-${randomBytes(3).toString('hex')}${DOMINIO}`,
  dani: `fixture-aislamiento-dani-${randomBytes(3).toString('hex')}${DOMINIO}`,
};
const identidadId: Record<keyof typeof correo, string> = { ana: '', beto: '', dani: '' };

interface Respuesta {
  estado: number;
  json: Record<string, unknown> & { error?: { code: string } };
  setCookie: string[];
}

/** Una «sesión de navegador»: guarda `nombre=valor` de cada Set-Cookie y lo reenvía. */
class Navegador {
  cookies = new Map<string, string>();
  constructor(readonly ip: string = `10.${rnd()}.${rnd()}.${rnd()}`) {}

  cabecera(): string {
    return [...this.cookies].map(([n, v]) => `${n}=${v}`).join('; ');
  }

  guardar(setCookie: string[]): void {
    for (const c of setCookie) {
      const [par, ...atributos] = c.split(';');
      const [nombre, ...valor] = (par ?? '').split('=');
      if (!nombre) continue;
      const caducada = atributos.some((a) => /^\s*max-age=0\s*$/i.test(a));
      if (caducada || valor.join('=') === '') this.cookies.delete(nombre);
      else this.cookies.set(nombre, valor.join('='));
    }
  }

  async llamar(
    metodo: 'GET' | 'POST',
    ruta: string,
    opciones: { cuerpo?: unknown; cabeceras?: Record<string, string>; sinCookie?: boolean } = {},
  ): Promise<Respuesta> {
    const cabeceras: Record<string, string> = {
      'x-forwarded-for': this.ip,
      ...(metodo === 'POST' ? { 'content-type': 'application/json', origin: ORIGEN_WEB } : {}),
      ...opciones.cabeceras,
    };
    if (!opciones.sinCookie && this.cookies.size > 0) cabeceras['cookie'] = this.cabecera();

    const r = await fetch(new URL(ruta, base), {
      method: metodo,
      headers: cabeceras,
      ...(opciones.cuerpo === undefined ? {} : { body: JSON.stringify(opciones.cuerpo) }),
    });
    const texto = await r.text();
    const setCookie = r.headers.getSetCookie();
    this.guardar(setCookie);
    return {
      estado: r.status,
      json: texto ? (JSON.parse(texto) as Respuesta['json']) : {},
      setCookie,
    };
  }

  iniciarSesion(quien: keyof typeof correo, contrasena = CLAVE): Promise<Respuesta> {
    return this.llamar('POST', '/api/v1/auth/sign-in/email', {
      cuerpo: { correo: correo[quien], contrasena },
    });
  }

  /** El valor del token tal como lo guarda el navegador (lo anterior al punto de la firma). */
  tokenEnClaro(): string {
    const valor = [...this.cookies.entries()].find(([n]) => n.endsWith('session_token'))?.[1];
    if (!valor) throw new Error('No hay cookie de sesión.');
    return decodeURIComponent(valor).split('.')[0] ?? '';
  }
}

function rnd(): number {
  return Math.floor(Math.random() * 250) + 1;
}

async function agencia(id: string, sufijo: string, estado: 'ACTIVO' | 'SUSPENDIDO' = 'ACTIVO') {
  await admin.tenant.create({
    data: {
      id,
      slug: `fixture-aislamiento-ident-${id.slice(-12)}`,
      nombre: `Agencia ${sufijo}`,
      estado,
    },
  });
  const dueno = await admin.rol.create({
    data: {
      tenantId: id,
      nombre: 'Dueño',
      clave: 'DUENO',
      permisos: ['cotizacion.ver_neto_y_margen', 'usuarios.administrar'],
    },
  });
  const asesor = await admin.rol.create({
    data: { tenantId: id, nombre: 'Asesor', clave: 'ASESOR', permisos: [] },
  });
  return { dueno: dueno.id, asesor: asesor.id };
}

async function persona(quien: keyof typeof correo, nombre: string): Promise<string> {
  const i = await admin.identidad.create({ data: { correo: correo[quien], nombre } });
  await admin.credencial.create({
    data: {
      identidadId: i.id,
      proveedor: 'credential',
      hashContrasena: await hashPassword(CLAVE),
    },
  });
  identidadId[quien] = i.id;
  return i.id;
}

async function pertenece(
  tenantId: string,
  quien: keyof typeof correo,
  rolId: string,
  nombre: string,
): Promise<void> {
  await admin.usuario.create({
    data: { tenantId, identidadId: identidadId[quien], rolId, correo: correo[quien], nombre },
  });
}

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  const rolesA = await agencia(TENANT_A, 'A');
  const rolesB = await agencia(TENANT_B, 'B');
  const rolesC = await agencia(TENANT_C, 'C');

  await persona('ana', 'Ana Dos Agencias');
  await persona('beto', 'Beto Solo A');
  await persona('dani', 'Dani Agencia C');
  await pertenece(TENANT_A, 'ana', rolesA.dueno, 'Ana');
  await pertenece(TENANT_B, 'ana', rolesB.asesor, 'Ana');
  await pertenece(TENANT_A, 'beto', rolesA.asesor, 'Beto');
  await pertenece(TENANT_C, 'dani', rolesC.dueno, 'Dani');

  contactoA = (
    await admin.contacto.create({
      data: { tenantId: TENANT_A, telefonoE164: '+573001110001', nombre: 'Contacto de A' },
    })
  ).id;
  contactoB = (
    await admin.contacto.create({
      data: { tenantId: TENANT_B, telefonoE164: '+573001110002', nombre: 'Contacto de B' },
    })
  ).id;

  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  await app.listen(0);
  base = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
  if (adminPg) {
    try {
      type Limpiador = (c: Client, ids: string[]) => Promise<unknown>;
      const ruta = '../../../../../packages/database/scripts/borrar-tenants.mjs';
      const modulo = (await import(ruta)) as { borrarTenants: Limpiador };
      await adminPg.query('BEGIN');
      await modulo.borrarTenants(adminPg, [TENANT_A, TENANT_B, TENANT_C]);
      await adminPg.query('COMMIT');
      // Las identidades son globales: no cuelgan de ningún tenant. Las sesiones y credenciales
      // caen por cascada.
      // Por id y no por el dominio del correo: la base es compartida y otra corrida
      // podría tener identidades vivas con el mismo dominio.
      await adminPg.query('DELETE FROM identidades WHERE id = ANY($1::uuid[])', [
        Object.values(identidadId).filter((id) => id !== ''),
      ]);
    } finally {
      await adminPg.end();
    }
  }
  await admin?.$disconnect();
});

const nombresDeContactos = (r: Respuesta): string[] =>
  (r.json['datos'] as Array<{ nombre: string }>).map((c) => c.nombre);

describe('iniciar sesión', () => {
  it('devuelve la sesión SIN el token, y la cookie es HttpOnly, Secure y SameSite=Lax', async () => {
    const nav = new Navegador();
    const r = await nav.iniciarSesion('beto');
    expect(r.estado).toBe(200);

    const sesion = r.json as unknown as SesionActual;
    expect(sesion.identidad.correo).toBe(correo.beto);
    // Beto está en una sola agencia: ya viene fijada.
    expect(sesion.tenantActivoId).toBe(TENANT_A);
    expect(sesion.acceso?.rol).toBe('Asesor');
    expect(sesion.acceso?.permisos).toEqual([]);

    // Ni el token, ni nada que se le parezca, sale en el cuerpo.
    expect(JSON.stringify(r.json)).not.toContain(nav.tokenEnClaro());
    expect(Object.keys(r.json)).not.toContain('token');

    expect(r.setCookie).toHaveLength(1);
    const cookie = r.setCookie[0] ?? '';
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*Secure/i);
    expect(cookie).toMatch(/;\s*SameSite=Lax/i);
  });

  it('no distingue un correo inexistente de una contraseña errónea', async () => {
    const nav = new Navegador();
    const mala = await nav.iniciarSesion('beto', 'contrasena-equivocada-1');
    const inexistente = await nav.llamar('POST', '/api/v1/auth/sign-in/email', {
      cuerpo: { correo: `nadie-${randomBytes(3).toString('hex')}${DOMINIO}`, contrasena: CLAVE },
    });
    expect(mala.estado).toBe(401);
    expect(inexistente.estado).toBe(401);
    expect(mala.json).toEqual(inexistente.json);
    expect(mala.json.error?.code).toBe('CREDENCIALES_INVALIDAS');
    expect(mala.setCookie).toHaveLength(0);
  });

  it('una identidad dada de baja no inicia sesión, y recibe el mismo error que una errónea', async () => {
    await admin.identidad.update({
      where: { id: identidadId.beto },
      data: { eliminadoEn: new Date() },
    });
    try {
      const nav = new Navegador();
      const r = await nav.iniciarSesion('beto');
      expect(r.estado).toBe(401);
      expect(r.json.error?.code).toBe('CREDENCIALES_INVALIDAS');
      expect(r.setCookie).toHaveLength(0);
    } finally {
      await admin.identidad.update({
        where: { id: identidadId.beto },
        data: { eliminadoEn: null },
      });
    }
  });

  it('limita los intentos por dirección: el sexto en un minuto da 429', async () => {
    const nav = new Navegador(`192.0.2.${rnd()}`);
    const estados: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      estados.push((await nav.iniciarSesion('beto', 'contrasena-equivocada-1')).estado);
    }
    expect(estados.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(estados[5]).toBe(429);
  });

  it('rechaza un Origin ajeno', async () => {
    const nav = new Navegador();
    const r = await nav.llamar('POST', '/api/v1/auth/sign-in/email', {
      cuerpo: { correo: correo.beto, contrasena: CLAVE },
      cabeceras: { origin: 'https://sitio-malicioso.example' },
    });
    expect(r.estado).toBe(403);
    expect(r.json.error?.code).toBe('ORIGEN_NO_CONFIABLE');
    expect(r.setCookie).toHaveLength(0);
  });

  it('el registro público no existe: la superficie de Better Auth no es alcanzable', async () => {
    const nav = new Navegador();
    for (const ruta of [
      '/api/v1/auth/sign-up/email',
      '/api/v1/auth/list-sessions',
      '/api/v1/auth/get-session',
      '/api/v1/auth/reset-password',
    ]) {
      const r = await nav.llamar('POST', ruta, { cuerpo: {} });
      // Sin tenant ni sesión, lo que no es una de las cuatro rutas falla cerrado: 401.
      expect(r.estado, ruta).toBe(401);
    }
  });
});

describe('el token no queda en claro', () => {
  it('la fila de `sesiones` guarda el hash, y ninguna columna trae el token', async () => {
    const nav = new Navegador();
    expect((await nav.iniciarSesion('beto')).estado).toBe(200);
    const enClaro = nav.tokenEnClaro();
    expect(enClaro.length).toBeGreaterThanOrEqual(16);

    const { rows } = await adminPg.query<Record<string, unknown>>(
      'SELECT * FROM sesiones WHERE identidad_id = $1',
      [identidadId.beto],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const fila of rows) {
      expect(String(fila['token'])).toMatch(/^sha256:[0-9a-f]{64}$/);
      // Ninguna columna, de ninguna fila, contiene el token tal cual.
      expect(JSON.stringify(fila)).not.toContain(enClaro);
    }
    // Y la sesión sigue funcionando: se busca por el hash, no por el valor guardado.
    expect((await nav.llamar('GET', '/api/v1/auth/session')).estado).toBe(200);

    const { rows: verificaciones } = await adminPg.query(
      'SELECT 1 FROM verificaciones WHERE valor LIKE $1',
      [`%${enClaro}%`],
    );
    expect(verificaciones).toHaveLength(0);
  });

  it('presentar el hash guardado en lugar del token NO abre la sesión', async () => {
    const nav = new Navegador();
    await nav.iniciarSesion('beto');
    const { rows } = await adminPg.query<{ token: string }>(
      'SELECT token FROM sesiones WHERE identidad_id = $1 ORDER BY creado_en DESC LIMIT 1',
      [identidadId.beto],
    );
    const hash = rows[0]?.token ?? '';
    const nombre = [...nav.cookies.keys()][0] ?? '';
    // Con la firma de la cookie verdadera pegada al hash: la firma no corresponde.
    const firma = decodeURIComponent(nav.cookies.get(nombre) ?? '')
      .split('.')
      .slice(1)
      .join('.');
    const falsa = `${nombre}=${encodeURIComponent(`${hash}.${firma}`)}`;
    const r = await fetch(new URL('/api/v1/crm/contactos', base), {
      headers: { cookie: falsa, 'x-forwarded-for': nav.ip },
    });
    expect(r.status).toBe(401);
  });
});

describe('aislamiento entre agencias con una sesión', () => {
  it('beto (solo A) lee los datos de A y nada de B', async () => {
    const nav = new Navegador();
    await nav.iniciarSesion('beto');

    const lista = await nav.llamar('GET', '/api/v1/crm/contactos');
    expect(lista.estado).toBe(200);
    expect(nombresDeContactos(lista)).toContain('Contacto de A');
    expect(nombresDeContactos(lista)).not.toContain('Contacto de B');

    const ajeno = await nav.llamar('GET', `/api/v1/crm/contactos/${contactoB}/ficha`);
    expect(ajeno.estado).toBe(404);
    const propio = await nav.llamar('GET', `/api/v1/crm/contactos/${contactoA}/ficha`);
    expect(propio.estado).toBe(200);
  });

  it('una cabecera x-dev-tenant-id no pisa a una sesión válida', async () => {
    const nav = new Navegador();
    await nav.iniciarSesion('beto');
    const lista = await nav.llamar('GET', '/api/v1/crm/contactos', {
      cabeceras: { 'x-dev-tenant-id': TENANT_B },
    });
    expect(lista.estado).toBe(200);
    expect(nombresDeContactos(lista)).toContain('Contacto de A');
    expect(nombresDeContactos(lista)).not.toContain('Contacto de B');
  });

  it('ana, en las dos agencias: sin elegir da 401; cada agencia ve solo lo suyo', async () => {
    const nav = new Navegador();
    const entrada = await nav.iniciarSesion('ana');
    const sesion = entrada.json as unknown as SesionActual;
    expect(sesion.tenantActivoId).toBeNull();
    expect(sesion.agencias.map((a) => a.id).sort()).toEqual([TENANT_A, TENANT_B].sort());

    const sinElegir = await nav.llamar('GET', '/api/v1/crm/contactos');
    expect(sinElegir.estado).toBe(401);
    expect(sinElegir.json.error?.code).toBe('SIN_AGENCIA_ACTIVA');

    const aA = await nav.llamar('POST', '/api/v1/auth/tenant-activo', {
      cuerpo: { tenantId: TENANT_A },
    });
    expect(aA.estado).toBe(200);
    expect((aA.json as unknown as SesionActual).acceso?.rol).toBe('Dueño');
    const enA = await nav.llamar('GET', '/api/v1/crm/contactos');
    expect(nombresDeContactos(enA)).toEqual(['Contacto de A']);

    const aB = await nav.llamar('POST', '/api/v1/auth/tenant-activo', {
      cuerpo: { tenantId: TENANT_B },
    });
    expect(aB.estado).toBe(200);
    // El mismo usuario, otro rol: en B es asesora y no tiene permisos.
    expect((aB.json as unknown as SesionActual).acceso?.permisos).toEqual([]);
    const enB = await nav.llamar('GET', '/api/v1/crm/contactos');
    expect(nombresDeContactos(enB)).toEqual(['Contacto de B']);
  });

  it('cambiar a una agencia sin membresía da 403 y no escribe nada', async () => {
    const nav = new Navegador();
    await nav.iniciarSesion('beto');
    const r = await nav.llamar('POST', '/api/v1/auth/tenant-activo', {
      cuerpo: { tenantId: TENANT_B },
    });
    expect(r.estado).toBe(403);
    expect(r.json.error?.code).toBe('SIN_MEMBRESIA');

    const { rows } = await adminPg.query<{ tenant_activo_id: string }>(
      'SELECT tenant_activo_id FROM sesiones WHERE identidad_id = $1 ORDER BY creado_en DESC LIMIT 1',
      [identidadId.beto],
    );
    expect(rows[0]?.tenant_activo_id).toBe(TENANT_A);
    // La sesión sigue viva en la agencia donde sí está.
    expect((await nav.llamar('GET', '/api/v1/crm/contactos')).estado).toBe(200);
  });

  it('cambiar de agencia exige un Origin de confianza', async () => {
    const nav = new Navegador();
    await nav.iniciarSesion('ana');
    const r = await nav.llamar('POST', '/api/v1/auth/tenant-activo', {
      cuerpo: { tenantId: TENANT_A },
      cabeceras: { origin: 'https://sitio-malicioso.example' },
    });
    expect(r.estado).toBe(403);
    expect(r.json.error?.code).toBe('ORIGEN_NO_CONFIABLE');
  });

  it('un tenant_activo_id manipulado hacia una agencia ajena da 401 y revoca la sesión', async () => {
    const nav = new Navegador();
    await nav.iniciarSesion('beto');
    expect((await nav.llamar('GET', '/api/v1/crm/contactos')).estado).toBe(200);
    const hash = hashearTokenDeSesion(nav.tokenEnClaro());

    // Alguien con acceso a la base apunta la sesión de Beto a la agencia B, donde no está.
    await adminPg.query('UPDATE sesiones SET tenant_activo_id = $1 WHERE token = $2', [
      TENANT_B,
      hash,
    ]);
    const r = await nav.llamar('GET', '/api/v1/crm/contactos');
    expect(r.estado).toBe(401);
    expect(r.json.error?.code).toBe('ACCESO_REVOCADO');
    // No se filtró ningún dato de B...
    expect(JSON.stringify(r.json)).not.toContain('Contacto de B');
    // ...y la sesión ya no existe.
    const { rows } = await adminPg.query('SELECT 1 FROM sesiones WHERE token = $1', [hash]);
    expect(rows).toHaveLength(0);
  });
});

describe('RLS decide la membresía, no solo el predicado', () => {
  it('con el tenant A fijado, `usuarios` de Ana solo devuelve la fila de A aunque no se filtre', async () => {
    const prisma = app.get(PrismaService);
    const filas = await ContextoTenant.ejecutarCon(
      { tenantId: TENANT_A, usuarioId: null, identidadId: null, permisos: new Set(), trazaId: 't' },
      // Sin `tenantId` en el where, a propósito: lo que acota es la política de RLS.
      () =>
        prisma.conTenant((tx) => tx.usuario.findMany({ where: { identidadId: identidadId.ana } })),
    );
    expect(filas.map((f) => f.tenantId)).toEqual([TENANT_A]);
  });

  it('y con el tenant B fijado, la de B', async () => {
    const prisma = app.get(PrismaService);
    const filas = await ContextoTenant.ejecutarCon(
      { tenantId: TENANT_B, usuarioId: null, identidadId: null, permisos: new Set(), trazaId: 't' },
      () =>
        prisma.conTenant((tx) => tx.usuario.findMany({ where: { identidadId: identidadId.ana } })),
    );
    expect(filas.map((f) => f.tenantId)).toEqual([TENANT_B]);
  });

  it('el pool de la API no ve las tablas de identidad (42501)', async () => {
    const prisma = app.get(PrismaService);
    await expect(
      ContextoTenant.ejecutarCon(
        {
          tenantId: TENANT_A,
          usuarioId: null,
          identidadId: null,
          permisos: new Set(),
          trazaId: 't',
        },
        () => prisma.conTenant((tx) => tx.$queryRaw`SELECT token FROM sesiones LIMIT 1`),
      ),
    ).rejects.toThrow(/permission denied|42501/i);
  });
});

describe('revocación', () => {
  it('borrar la sesión corta la petición siguiente (no hay caché de cookie)', async () => {
    const nav = new Navegador();
    await nav.iniciarSesion('beto');
    expect((await nav.llamar('GET', '/api/v1/crm/contactos')).estado).toBe(200);

    await adminPg.query('DELETE FROM sesiones WHERE identidad_id = $1', [identidadId.beto]);

    const r = await nav.llamar('GET', '/api/v1/crm/contactos');
    expect(r.estado).toBe(401);
    expect(r.json.error?.code).toBe('SIN_SESION');
    expect((await nav.llamar('GET', '/api/v1/auth/session')).estado).toBe(401);
  });

  it('dar de baja al usuario corta la petición siguiente', async () => {
    const nav = new Navegador();
    await nav.iniciarSesion('beto');
    expect((await nav.llamar('GET', '/api/v1/crm/contactos')).estado).toBe(200);

    await admin.usuario.updateMany({
      where: { tenantId: TENANT_A, identidadId: identidadId.beto },
      data: { activo: false },
    });
    try {
      const r = await nav.llamar('GET', '/api/v1/crm/contactos');
      expect(r.estado).toBe(401);
      expect(r.json.error?.code).toBe('ACCESO_REVOCADO');
    } finally {
      await admin.usuario.updateMany({
        where: { tenantId: TENANT_A, identidadId: identidadId.beto },
        data: { activo: true },
      });
    }
  });

  it('cerrar sesión borra la fila y la cookie deja de valer', async () => {
    const nav = new Navegador();
    await nav.iniciarSesion('beto');
    const antes = nav.cabecera();
    const r = await nav.llamar('POST', '/api/v1/auth/sign-out');
    expect(r.estado).toBe(204);

    const reutilizada = await fetch(new URL('/api/v1/crm/contactos', base), {
      headers: { cookie: antes, 'x-forwarded-for': nav.ip },
    });
    expect(reutilizada.status).toBe(401);
  });

  it('con la agencia suspendida, la petición se rechaza y la sesión se revoca', async () => {
    const nav = new Navegador();
    const entrada = await nav.iniciarSesion('dani');
    expect((entrada.json as unknown as SesionActual).tenantActivoId).toBe(TENANT_C);
    expect((await nav.llamar('GET', '/api/v1/crm/contactos')).estado).toBe(200);

    await admin.tenant.update({ where: { id: TENANT_C }, data: { estado: 'SUSPENDIDO' } });
    try {
      const r = await nav.llamar('GET', '/api/v1/crm/contactos');
      expect(r.estado).toBe(401);
      expect(r.json.error?.code).toBe('AGENCIA_SUSPENDIDA');

      // Y con una cabecera de desarrollo tampoco entra: la sesión existía.
      const conCabecera = await nav.llamar('GET', '/api/v1/crm/contactos', {
        cabeceras: { 'x-dev-tenant-id': TENANT_C },
      });
      expect(conCabecera.estado).toBe(401);

      // Iniciar sesión de nuevo tampoco deja entrar a una agencia suspendida.
      const otra = new Navegador();
      const intento = await otra.iniciarSesion('dani');
      expect(intento.estado).toBe(401);
      expect(intento.json.error?.code).toBe('AGENCIA_SUSPENDIDA');
    } finally {
      await admin.tenant.update({ where: { id: TENANT_C }, data: { estado: 'ACTIVO' } });
    }
  });
});

describe('el permiso «ver neto y margen»', () => {
  const inexistente = '00000000-0000-4000-8000-00000000dead';

  it('un asesor con incluirMargen=true recibe 403; sin pedirlo, no hay objeción', async () => {
    const nav = new Navegador();
    await nav.iniciarSesion('beto');

    const pide = await nav.llamar('GET', `/api/v1/cotizaciones/${inexistente}?incluirMargen=true`);
    expect(pide.estado).toBe(403);
    expect(pide.json.error?.code).toBe('PERMISO_DENEGADO');

    const noPide = await nav.llamar('GET', `/api/v1/cotizaciones/${inexistente}`);
    expect(noPide.estado).toBe(404);
  });

  it('también en el cotizador: incluirMargen en el cuerpo sin permiso da 403', async () => {
    const nav = new Navegador();
    await nav.iniciarSesion('beto');
    const r = await nav.llamar('POST', '/api/v1/catalogo/cotizar', {
      cuerpo: {
        paqueteId: inexistente,
        fecha: '2027-03-15',
        adultos: 2,
        incluirMargen: true,
      },
    });
    expect(r.estado).toBe(403);
    expect(r.json.error?.code).toBe('PERMISO_DENEGADO');
  });

  it('la dueña (con el permiso) pasa el control: la respuesta deja de ser 403', async () => {
    const nav = new Navegador();
    await nav.iniciarSesion('ana');
    await nav.llamar('POST', '/api/v1/auth/tenant-activo', { cuerpo: { tenantId: TENANT_A } });
    const r = await nav.llamar('GET', `/api/v1/cotizaciones/${inexistente}?incluirMargen=true`);
    expect(r.estado).toBe(404);

    // Los permisos son de LA AGENCIA activa: en B, Ana es asesora y vuelve a recibir 403.
    await nav.llamar('POST', '/api/v1/auth/tenant-activo', { cuerpo: { tenantId: TENANT_B } });
    const enB = await nav.llamar('GET', `/api/v1/cotizaciones/${inexistente}?incluirMargen=true`);
    expect(enB.estado).toBe(403);
  });
});

describe('la cabecera de desarrollo', () => {
  it('con APP_ENV=local y sin sesión, funciona', async () => {
    expect(process.env['APP_ENV']).toBe('local');
    const nav = new Navegador();
    const r = await nav.llamar('GET', '/api/v1/crm/contactos', {
      cabeceras: { 'x-dev-tenant-id': TENANT_A },
    });
    expect(r.estado).toBe(200);
    expect(nombresDeContactos(r)).toContain('Contacto de A');
  });

  it('en cualquier otro entorno se ignora', async () => {
    const original = process.env['APP_ENV'];
    try {
      for (const entorno of ['dev', 'staging', 'production', '', undefined]) {
        if (entorno === undefined) delete process.env['APP_ENV'];
        else process.env['APP_ENV'] = entorno;
        const nav = new Navegador();
        const r = await nav.llamar('GET', '/api/v1/crm/contactos', {
          cabeceras: { 'x-dev-tenant-id': TENANT_A },
        });
        expect(r.estado, `APP_ENV=${String(entorno)}`).toBe(401);
        expect(r.json.error?.code).toBe('SIN_SESION');
      }
      // Con sesión real, sigue funcionando en cualquier entorno.
      process.env['APP_ENV'] = 'production';
      const nav = new Navegador();
      await nav.iniciarSesion('beto');
      expect((await nav.llamar('GET', '/api/v1/crm/contactos')).estado).toBe(200);
    } finally {
      if (original === undefined) delete process.env['APP_ENV'];
      else process.env['APP_ENV'] = original;
    }
  });
});

describe('el socket de la bandeja (ADR-0011, «La bandeja en vivo»)', () => {
  // Socket.IO todavía no existe en la API: la bandeja en vivo es una tarea posterior. El
  // contrato queda escrito en `application/revalidar-conexion.use-case.ts` (los pasos 3 y 4 con la cookie del
  // handshake, cada 60 s, y el cierre por baja) y estas pruebas se activan cuando haya gateway.
  it.todo('rechaza el handshake sin cookie de sesión válida');
  it.todo('revalida cada 60 s con los pasos 3 y 4, y desconecta si la sesión fue revocada');
  it.todo('un socket abierto de un usuario dado de baja se cierra');
  it.todo('se une a las salas tenant:<id> y usuario:<id> con los permisos de ese momento');
});
