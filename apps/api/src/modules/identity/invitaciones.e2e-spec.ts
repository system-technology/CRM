/**
 * Invitaciones y código por correo, de punta a punta (ADR-0011, rebanada 4).
 *
 * Aplicación ensamblada, HTTP real y PostgreSQL con RLS. El correo pasa por el puerto con el doble
 * `CorreoEnMemoria` (`COLA_CORREO=memoria`), que captura el mensaje para leer el token o el código.
 *
 * Lo que afirma:
 *   · una invitación aceptada crea la identidad (verificada) y la membresía con el rol invitado;
 *   · el token no está en la base (solo su hash) y un token reutilizado o caducado se rechaza;
 *   · invitar sin el permiso da 403; con un rol de OTRA agencia, 404; sin sesión, 401;
 *   · invitar a un correo nuevo y a uno que ya tiene identidad en otra agencia da EXACTAMENTE la
 *     misma respuesta, y aceptar tampoco la distingue ni toca la contraseña de la existente;
 *   · el código por correo se guarda hasheado, caduca, se agota a los 3 intentos y no se puede
 *     reutilizar; pedirlo para un correo inexistente responde igual y no envía nada.
 */
import 'reflect-metadata';

import { randomBytes } from 'node:crypto';
import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import type { SesionActual } from '@viajapro/contracts';
import { hashPassword } from 'better-auth/crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';
import { CorreoEnMemoria } from '../notifications/infrastructure/correo.en-memoria.js';
import { hashearTokenDeInvitacion } from './domain/invitacion.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const ORIGEN_WEB = 'http://localhost:3000';
const CLAVE = 'una-clave-larga-de-prueba-1';
const CLAVE_NUEVA = 'otra-clave-larga-de-prueba-2';
const marca = (): string => `fixture-aislamiento-inv-${randomBytes(3).toString('hex')}`;
const correo = (quien: string): string => `${marca()}-${quien}@fixture-identidad.test`;

const ANA = correo('ana'); // dueña en A (puede invitar)
const BETO = correo('beto'); // asesor en A (no puede)
const EVA = correo('eva'); // ya tiene identidad, en B, con su contraseña
const SOLO_CODIGO = correo('codigo'); // identidad verificada para entrar por código
const creados: string[] = [ANA, BETO, EVA, SOLO_CODIGO];

let app: INestApplication;
let base: string;
let admin: PrismaClient;
let adminPg: Client;
let correoDePrueba: CorreoEnMemoria;
let rolesA: { dueno: string; asesor: string; superior: string };
let rolesB: { dueno: string; asesor: string; superior: string };
const hashesDeTokens: string[] = [];

interface Respuesta {
  estado: number;
  json: Record<string, unknown> & { error?: { code: string } };
  setCookie: string[];
}

class Navegador {
  cookies = new Map<string, string>();
  constructor(readonly ip: string = `10.${rnd()}.${rnd()}.${rnd()}`) {}

  async llamar(
    metodo: 'GET' | 'POST',
    ruta: string,
    opciones: { cuerpo?: unknown } = {},
  ): Promise<Respuesta> {
    const cabeceras: Record<string, string> = {
      'x-forwarded-for': this.ip,
      ...(metodo === 'POST' ? { 'content-type': 'application/json', origin: ORIGEN_WEB } : {}),
    };
    if (this.cookies.size > 0) {
      cabeceras['cookie'] = [...this.cookies].map(([n, v]) => `${n}=${v}`).join('; ');
    }
    const r = await fetch(new URL(ruta, base), {
      method: metodo,
      headers: cabeceras,
      ...(opciones.cuerpo === undefined ? {} : { body: JSON.stringify(opciones.cuerpo) }),
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

  entrar(quien: string, contrasena = CLAVE): Promise<Respuesta> {
    return this.llamar('POST', '/api/v1/auth/sign-in/email', {
      cuerpo: { correo: quien, contrasena },
    });
  }
}

function rnd(): number {
  return Math.floor(Math.random() * 250) + 1;
}

async function agencia(id: string, nombre: string) {
  await admin.tenant.create({
    data: {
      id,
      slug: `fixture-aislamiento-inv-${id.slice(-12)}`,
      nombre,
      estado: 'ACTIVO',
    },
  });
  const dueno = await admin.rol.create({
    data: {
      tenantId: id,
      nombre: 'Dueño',
      clave: 'DUENO',
      permisos: ['usuarios.administrar'],
    },
  });
  const asesor = await admin.rol.create({
    data: { tenantId: id, nombre: 'Asesor', clave: 'ASESOR', permisos: [] },
  });
  // Un rol con MÁS permisos que el del dueño: nadie del equipo puede repartirlo.
  const superior = await admin.rol.create({
    data: {
      tenantId: id,
      nombre: 'Superdueño',
      permisos: ['usuarios.administrar', 'roles.administrar'],
    },
  });
  return { dueno: dueno.id, asesor: asesor.id, superior: superior.id };
}

async function persona(correoDe: string, nombre: string, tenantId: string, rolId: string) {
  const i = await admin.identidad.create({
    data: { correo: correoDe, nombre, correoVerificado: true },
  });
  await admin.credencial.create({
    data: {
      identidadId: i.id,
      proveedor: 'credential',
      hashContrasena: await hashPassword(CLAVE),
    },
  });
  await admin.usuario.create({
    data: { tenantId, identidadId: i.id, rolId, correo: correoDe, nombre },
  });
  return i.id;
}

/** El token que viaja en el enlace del último correo para esa dirección. */
function tokenDelUltimoCorreo(para: string): string {
  const mensajes = correoDePrueba.para(para);
  const texto = mensajes[mensajes.length - 1]?.texto ?? '';
  const token = /aceptar-invitacion\?token=([A-Za-z0-9_%-]+)/.exec(texto)?.[1];
  if (!token) throw new Error(`No hay enlace de invitación para ${para}.`);
  const decodificado = decodeURIComponent(token);
  hashesDeTokens.push(hashearTokenDeInvitacion(decodificado));
  return decodificado;
}

function codigoDelUltimoCorreo(para: string): string {
  const mensajes = correoDePrueba.para(para);
  const codigo = /\b(\d{6})\b/.exec(mensajes[mensajes.length - 1]?.texto ?? '')?.[1];
  if (!codigo) throw new Error(`No hay código para ${para}.`);
  return codigo;
}

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  rolesA = await agencia(TENANT_A, 'Agencia A');
  rolesB = await agencia(TENANT_B, 'Agencia B');
  await persona(ANA, 'Ana Dueña', TENANT_A, rolesA.dueno);
  await persona(BETO, 'Beto Asesor', TENANT_A, rolesA.asesor);
  await persona(EVA, 'Eva en B', TENANT_B, rolesB.asesor);
  const idCodigo = await admin.identidad.create({
    data: { correo: SOLO_CODIGO, nombre: 'Código', correoVerificado: true },
  });
  await admin.usuario.create({
    data: {
      tenantId: TENANT_A,
      identidadId: idCodigo.id,
      rolId: rolesA.asesor,
      correo: SOLO_CODIGO,
      nombre: 'Código',
    },
  });

  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  // Hace de balanceador propio: cada «navegador» de la prueba tiene su dirección.
  (app as NestExpressApplication).set('trust proxy', 1);
  await app.listen(0);
  base = await app.getUrl();
  correoDePrueba = app.get(CorreoEnMemoria);
});

afterAll(async () => {
  await app?.close();
  if (adminPg) {
    try {
      type Limpiador = (c: Client, ids: string[]) => Promise<unknown>;
      const ruta = '../../../../../packages/database/scripts/borrar-tenants.mjs';
      const modulo = (await import(ruta)) as { borrarTenants: Limpiador };
      await adminPg.query('BEGIN');
      await modulo.borrarTenants(adminPg, [TENANT_A, TENANT_B]);
      await adminPg.query('COMMIT');
      // Por correo exacto: la base es compartida y otra corrida tiene sus propias identidades.
      await adminPg.query('DELETE FROM identidades WHERE correo = ANY($1::citext[])', [creados]);
      await adminPg.query(
        'DELETE FROM verificaciones WHERE identificador = ANY($1) OR identificador = ANY($2)',
        [hashesDeTokens.map((h) => `invitacion:${h}`), creados.map((c) => `sign-in-otp-${c}`)],
      );
    } finally {
      await adminPg.end();
    }
  }
  await admin?.$disconnect();
});

async function comoDueno(): Promise<Navegador> {
  const nav = new Navegador();
  const r = await nav.entrar(ANA);
  expect(r.estado).toBe(200);
  expect((r.json as unknown as SesionActual).tenantActivoId).toBe(TENANT_A);
  return nav;
}

describe('invitar', () => {
  it('el dueño invita: 202 {ok:true}, un correo encolado y el token NO está en la base', async () => {
    const nuevo = correo('nuevo');
    creados.push(nuevo);
    const dueno = await comoDueno();
    const r = await dueno.llamar('POST', '/api/v1/identidad/invitaciones', {
      cuerpo: { correo: nuevo, rolId: rolesA.asesor },
    });
    expect(r.estado).toBe(202);
    expect(r.json).toEqual({ ok: true });

    const mensajes = correoDePrueba.para(nuevo);
    expect(mensajes).toHaveLength(1);
    expect(mensajes[0]?.texto).toContain('Agencia A');
    const token = tokenDelUltimoCorreo(nuevo);
    expect(token.length).toBeGreaterThanOrEqual(40);

    // En la base solo está el hash: ninguna fila de `verificaciones` contiene el token.
    const { rows } = await adminPg.query<{ identificador: string; valor: string }>(
      'SELECT identificador, valor FROM verificaciones WHERE identificador = $1',
      [`invitacion:${hashearTokenDeInvitacion(token)}`],
    );
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(token);
    const { rows: todas } = await adminPg.query('SELECT * FROM verificaciones');
    expect(JSON.stringify(todas)).not.toContain(token);
  });

  it('sin el permiso (asesor) da 403; sin sesión, 401', async () => {
    const beto = new Navegador();
    await beto.entrar(BETO);
    const r = await beto.llamar('POST', '/api/v1/identidad/invitaciones', {
      cuerpo: { correo: correo('x'), rolId: rolesA.asesor },
    });
    expect(r.estado).toBe(403);
    expect(r.json.error?.code).toBe('PERMISO_DENEGADO');

    const anonimo = await new Navegador().llamar('POST', '/api/v1/identidad/invitaciones', {
      cuerpo: { correo: correo('y'), rolId: rolesA.asesor },
    });
    expect(anonimo.estado).toBe(401);
  });

  it('con un rol de OTRA agencia da 404: RLS no lo deja ver', async () => {
    const dueno = await comoDueno();
    const r = await dueno.llamar('POST', '/api/v1/identidad/invitaciones', {
      cuerpo: { correo: correo('z'), rolId: rolesB.dueno },
    });
    expect(r.estado).toBe(404);
    expect(r.json.error?.code).toBe('ROL_NO_ENCONTRADO');
  });

  it('un correo nuevo y uno que ya existe en otra agencia reciben EXACTAMENTE la misma respuesta', async () => {
    const dueno = await comoDueno();
    const nuevo = correo('nuevo2');
    creados.push(nuevo);
    const aNuevo = await dueno.llamar('POST', '/api/v1/identidad/invitaciones', {
      cuerpo: { correo: nuevo, rolId: rolesA.asesor },
    });
    const aExistente = await dueno.llamar('POST', '/api/v1/identidad/invitaciones', {
      cuerpo: { correo: EVA, rolId: rolesA.asesor },
    });
    expect(aExistente.estado).toBe(aNuevo.estado);
    expect(aExistente.json).toEqual(aNuevo.json);
    expect(aExistente.setCookie).toEqual(aNuevo.setCookie);
    // Y los dos reciben su correo: nada en el comportamiento delata a la que ya existía.
    expect(correoDePrueba.para(nuevo)).toHaveLength(1);
    expect(correoDePrueba.para(EVA).length).toBeGreaterThanOrEqual(1);
    tokenDelUltimoCorreo(EVA);
    tokenDelUltimoCorreo(nuevo);
  });
});

describe('nadie reparte más de lo que tiene', () => {
  it('invitarse a sí mismo con un rol superior da 403 y no envía ni guarda nada', async () => {
    const dueno = await comoDueno();
    const correosAntes = correoDePrueba.para(ANA).length;
    const { rows: antes } = await adminPg.query<{ n: string }>(
      "SELECT count(*) AS n FROM verificaciones WHERE identificador LIKE 'invitacion:%'",
    );
    const r = await dueno.llamar('POST', '/api/v1/identidad/invitaciones', {
      cuerpo: { correo: ANA, rolId: rolesA.superior },
    });
    expect(r.estado).toBe(403);
    expect(r.json.error?.code).toBe('PERMISO_DENEGADO');
    expect(correoDePrueba.para(ANA)).toHaveLength(correosAntes);
    const { rows: despues } = await adminPg.query<{ n: string }>(
      "SELECT count(*) AS n FROM verificaciones WHERE identificador LIKE 'invitacion:%'",
    );
    expect(despues[0]?.n).toBe(antes[0]?.n);
  });

  it('un rol con permisos de más tampoco se le da a otra persona', async () => {
    const dueno = await comoDueno();
    const r = await dueno.llamar('POST', '/api/v1/identidad/invitaciones', {
      cuerpo: { correo: correo('otro'), rolId: rolesA.superior },
    });
    expect(r.estado).toBe(403);
  });

  it('aceptar siendo YA miembro vigente no cambia el rol, aunque la invitación lo pida', async () => {
    const miembro = async () =>
      admin.usuario.findFirst({
        where: { tenantId: TENANT_A, correo: ANA },
        include: { rol: true },
      });
    expect((await miembro())?.rol.nombre).toBe('Dueño');

    // (a) Una invitación legítima a un rol menor: tampoco lo cambia (no lo baja de Dueño).
    const dueno = await comoDueno();
    await dueno.llamar('POST', '/api/v1/identidad/invitaciones', {
      cuerpo: { correo: ANA, rolId: rolesA.asesor },
    });
    const token = tokenDelUltimoCorreo(ANA);
    const r = await new Navegador().llamar('POST', '/api/v1/auth/invitaciones/aceptar', {
      cuerpo: { token, nombre: 'Ana', contrasena: CLAVE_NUEVA },
    });
    expect(r.estado).toBe(200);
    expect(r.json).toEqual({ ok: true });
    expect((await miembro())?.rol.nombre).toBe('Dueño');

    // (b) Una invitación FORJADA directamente en la base (por ejemplo, de antes de esta regla)
    // hacia un rol superior: aceptarla tampoco cambia nada. Defensa en profundidad.
    const forjado = randomBytes(32).toString('base64url');
    const hash = hashearTokenDeInvitacion(forjado);
    hashesDeTokens.push(hash);
    await adminPg.query(
      "INSERT INTO verificaciones (id, identificador, valor, expira_en, actualizado_en) VALUES (gen_random_uuid(), $1, $2, now() + interval '1 day', now())",
      [
        `invitacion:${hash}`,
        JSON.stringify({
          tenantId: TENANT_A,
          correo: BETO,
          rolId: rolesA.superior,
          invitadoPorUsuarioId: null,
        }),
      ],
    );
    const beto = await admin.usuario.findFirst({ where: { tenantId: TENANT_A, correo: BETO } });
    const r2 = await new Navegador().llamar('POST', '/api/v1/auth/invitaciones/aceptar', {
      cuerpo: { token: forjado, nombre: 'Beto', contrasena: CLAVE_NUEVA },
    });
    expect(r2.estado).toBe(200);
    const despues = await admin.usuario.findUnique({
      where: { id: beto?.id ?? '' },
      include: { rol: true },
    });
    expect(despues?.rol.nombre).toBe('Asesor');
  });
});

describe('aceptar', () => {
  it('crea la identidad verificada y la membresía con el rol invitado; el token no se reutiliza', async () => {
    const nuevo = correo('acepta');
    creados.push(nuevo);
    const dueno = await comoDueno();
    await dueno.llamar('POST', '/api/v1/identidad/invitaciones', {
      cuerpo: { correo: nuevo, rolId: rolesA.asesor },
    });
    const token = tokenDelUltimoCorreo(nuevo);

    const anonimo = new Navegador();
    const r = await anonimo.llamar('POST', '/api/v1/auth/invitaciones/aceptar', {
      cuerpo: { token, nombre: 'Persona Nueva', contrasena: CLAVE_NUEVA },
    });
    expect(r.estado).toBe(200);
    expect(r.json).toEqual({ ok: true });
    expect(r.setCookie).toHaveLength(0);

    const identidad = await admin.identidad.findUnique({ where: { correo: nuevo } });
    expect(identidad?.correoVerificado).toBe(true);
    const usuario = await admin.usuario.findFirst({
      where: { identidadId: identidad?.id ?? '', tenantId: TENANT_A },
      include: { rol: true },
    });
    expect(usuario?.rol.nombre).toBe('Asesor');
    expect(usuario?.activo).toBe(true);

    // Ya puede entrar, y la agencia activa es la de la invitación.
    const ingreso = await new Navegador().entrar(nuevo, CLAVE_NUEVA);
    expect(ingreso.estado).toBe(200);
    expect((ingreso.json as unknown as SesionActual).tenantActivoId).toBe(TENANT_A);

    // El mismo token, otra vez: rechazado, y no cambia nada.
    const otra = await anonimo.llamar('POST', '/api/v1/auth/invitaciones/aceptar', {
      cuerpo: { token, nombre: 'Otra Vez', contrasena: CLAVE_NUEVA },
    });
    expect(otra.estado).toBe(400);
    expect(otra.json.error?.code).toBe('INVITACION_INVALIDA');
  });

  it('un token caducado se rechaza', async () => {
    const nuevo = correo('caducada');
    creados.push(nuevo);
    const dueno = await comoDueno();
    await dueno.llamar('POST', '/api/v1/identidad/invitaciones', {
      cuerpo: { correo: nuevo, rolId: rolesA.asesor },
    });
    const token = tokenDelUltimoCorreo(nuevo);
    await adminPg.query(
      "UPDATE verificaciones SET expira_en = now() - interval '1 minute' WHERE identificador = $1",
      [`invitacion:${hashearTokenDeInvitacion(token)}`],
    );
    const r = await new Navegador().llamar('POST', '/api/v1/auth/invitaciones/aceptar', {
      cuerpo: { token, nombre: 'Tarde', contrasena: CLAVE_NUEVA },
    });
    expect(r.estado).toBe(400);
    expect(r.json.error?.code).toBe('INVITACION_INVALIDA');
    expect(await admin.identidad.findUnique({ where: { correo: nuevo } })).toBeNull();
  });

  it('un token inventado se rechaza con el mismo error', async () => {
    const r = await new Navegador().llamar('POST', '/api/v1/auth/invitaciones/aceptar', {
      cuerpo: {
        token: randomBytes(32).toString('base64url'),
        nombre: 'X',
        contrasena: CLAVE_NUEVA,
      },
    });
    expect(r.estado).toBe(400);
    expect(r.json.error?.code).toBe('INVITACION_INVALIDA');
  });

  it('una identidad que ya existe entra a la agencia SIN cambiar su contraseña, y responde igual', async () => {
    const dueno = await comoDueno();
    await dueno.llamar('POST', '/api/v1/identidad/invitaciones', {
      cuerpo: { correo: EVA, rolId: rolesA.dueno },
    });
    const token = tokenDelUltimoCorreo(EVA);
    const r = await new Navegador().llamar('POST', '/api/v1/auth/invitaciones/aceptar', {
      cuerpo: { token, nombre: 'Eva', contrasena: CLAVE_NUEVA },
    });
    expect(r.estado).toBe(200);
    expect(r.json).toEqual({ ok: true });

    // Ahora está en las dos agencias, con su contraseña de siempre.
    const eva = new Navegador();
    const ingreso = await eva.entrar(EVA, CLAVE);
    expect(ingreso.estado).toBe(200);
    expect((ingreso.json as unknown as SesionActual).agencias).toHaveLength(2);
    // La contraseña que mandó al aceptar NO se aplicó.
    expect((await new Navegador().entrar(EVA, CLAVE_NUEVA)).estado).toBe(401);
  });
});

describe('código por correo', () => {
  it('el código se guarda hasheado, entra una vez y no se reutiliza', async () => {
    const nav = new Navegador();
    const envio = await nav.llamar('POST', '/api/v1/auth/otp/enviar', {
      cuerpo: { correo: SOLO_CODIGO },
    });
    expect(envio.estado).toBe(200);
    expect(envio.json).toEqual({ ok: true });

    const codigo = codigoDelUltimoCorreo(SOLO_CODIGO);
    expect(codigo).toMatch(/^\d{6}$/);

    const { rows } = await adminPg.query<{ valor: string }>(
      'SELECT valor FROM verificaciones WHERE identificador = $1',
      [`sign-in-otp-${SOLO_CODIGO}`],
    );
    expect(rows).toHaveLength(1);
    const guardado = rows[0]?.valor ?? '';
    // El OTP en claro no está: ni solo, ni con el contador de intentos, ni dentro de otro texto.
    expect(guardado).not.toBe(codigo);
    expect(guardado).not.toContain(codigo);
    expect(guardado.startsWith(`${codigo}:`)).toBe(false);

    const entrada = await nav.llamar('POST', '/api/v1/auth/otp/iniciar-sesion', {
      cuerpo: { correo: SOLO_CODIGO, codigo },
    });
    expect(entrada.estado).toBe(200);
    expect(JSON.stringify(entrada.json)).not.toContain('token');
    expect((entrada.json as unknown as SesionActual).tenantActivoId).toBe(TENANT_A);
    expect(entrada.setCookie[0]).toMatch(/HttpOnly/i);
    // Y con la sesión abierta, entra a la API.
    expect((await nav.llamar('GET', '/api/v1/crm/contactos')).estado).toBe(200);

    const reutilizado = await new Navegador().llamar('POST', '/api/v1/auth/otp/iniciar-sesion', {
      cuerpo: { correo: SOLO_CODIGO, codigo },
    });
    expect(reutilizado.estado).toBe(401);
    expect(reutilizado.json.error?.code).toBe('CODIGO_INVALIDO');
  });

  it('pedirlo para un correo inexistente responde igual y no envía nada', async () => {
    const fantasma = correo('fantasma');
    const antes = correoDePrueba.enviados.length;
    const nav = new Navegador();
    const r = await nav.llamar('POST', '/api/v1/auth/otp/enviar', { cuerpo: { correo: fantasma } });
    expect(r.estado).toBe(200);
    expect(r.json).toEqual({ ok: true });
    expect(correoDePrueba.enviados.length).toBe(antes);
    expect(correoDePrueba.para(fantasma)).toHaveLength(0);

    const entrar = await nav.llamar('POST', '/api/v1/auth/otp/iniciar-sesion', {
      cuerpo: { correo: fantasma, codigo: '123456' },
    });
    expect(entrar.estado).toBe(401);
    expect(entrar.json.error?.code).toBe('CODIGO_INVALIDO');
    // Un código nunca crea una identidad.
    expect(await admin.identidad.findUnique({ where: { correo: fantasma } })).toBeNull();
  });

  it('a los 3 intentos fallidos el código se invalida, aunque el cuarto sea el bueno', async () => {
    const nav = new Navegador();
    await nav.llamar('POST', '/api/v1/auth/otp/enviar', { cuerpo: { correo: SOLO_CODIGO } });
    const bueno = codigoDelUltimoCorreo(SOLO_CODIGO);
    const malo = bueno === '000000' ? '111111' : '000000';
    for (let i = 0; i < 3; i += 1) {
      const r = await nav.llamar('POST', '/api/v1/auth/otp/iniciar-sesion', {
        cuerpo: { correo: SOLO_CODIGO, codigo: malo },
      });
      expect(r.estado, `intento ${i + 1}`).toBe(401);
    }
    const cuarto = await nav.llamar('POST', '/api/v1/auth/otp/iniciar-sesion', {
      cuerpo: { correo: SOLO_CODIGO, codigo: bueno },
    });
    expect(cuarto.estado).toBe(401);
    expect(cuarto.json.error?.code).toBe('CODIGO_INVALIDO');
  });

  it('un código caducado se rechaza', async () => {
    const nav = new Navegador();
    await nav.llamar('POST', '/api/v1/auth/otp/enviar', { cuerpo: { correo: SOLO_CODIGO } });
    const codigo = codigoDelUltimoCorreo(SOLO_CODIGO);
    await adminPg.query(
      "UPDATE verificaciones SET expira_en = now() - interval '1 minute' WHERE identificador = $1",
      [`sign-in-otp-${SOLO_CODIGO}`],
    );
    const r = await nav.llamar('POST', '/api/v1/auth/otp/iniciar-sesion', {
      cuerpo: { correo: SOLO_CODIGO, codigo },
    });
    expect(r.estado).toBe(401);
    expect(r.json.error?.code).toBe('CODIGO_INVALIDO');
  });

  it('el código vive 5 minutos como máximo', async () => {
    const nav = new Navegador();
    await nav.llamar('POST', '/api/v1/auth/otp/enviar', { cuerpo: { correo: SOLO_CODIGO } });
    const { rows } = await adminPg.query<{ segundos: number }>(
      'SELECT extract(epoch FROM (expira_en - now()))::float AS segundos FROM verificaciones WHERE identificador = $1',
      [`sign-in-otp-${SOLO_CODIGO}`],
    );
    expect(rows[0]?.segundos).toBeGreaterThan(0);
    expect(rows[0]?.segundos).toBeLessThanOrEqual(300);
  });

  it('el límite por correo no se nota: el cuarto pedido responde igual que un correo inexistente y no envía', async () => {
    const anterior = process.env['OTP_ENVIOS_POR_CORREO'];
    process.env['OTP_ENVIOS_POR_CORREO'] = '3';
    try {
      const existente = SOLO_CODIGO;
      const fantasma = correo('fantasma-limite');
      const antes = correoDePrueba.para(existente).length;
      const respuestas = [];
      for (let i = 0; i < 4; i += 1) {
        // IP distinta cada vez: aquí se prueba el límite por correo, no el de IP.
        respuestas.push(
          await new Navegador().llamar('POST', '/api/v1/auth/otp/enviar', {
            cuerpo: { correo: existente },
          }),
        );
      }
      expect(respuestas.map((r) => r.estado)).toEqual([200, 200, 200, 200]);
      expect(respuestas.map((r) => r.json)).toEqual(Array(4).fill({ ok: true }));
      // Solo salieron 3: el cuarto se descartó sin avisar.
      expect(correoDePrueba.para(existente).length - antes).toBe(3);

      // Lo que ve quien pide un correo que no existe es lo mismo, byte a byte.
      const f = await new Navegador().llamar('POST', '/api/v1/auth/otp/enviar', {
        cuerpo: { correo: fantasma },
      });
      expect(f.estado).toBe(respuestas[3]?.estado);
      expect(f.json).toEqual(respuestas[3]?.json);
    } finally {
      if (anterior === undefined) delete process.env['OTP_ENVIOS_POR_CORREO'];
      else process.env['OTP_ENVIOS_POR_CORREO'] = anterior;
    }
  });

  it('el límite por IP responde 429, sin importar el correo', async () => {
    const anterior = process.env['OTP_ENVIOS_POR_IP'];
    process.env['OTP_ENVIOS_POR_IP'] = '2';
    try {
      const nav = new Navegador();
      const estados: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        estados.push(
          (
            await nav.llamar('POST', '/api/v1/auth/otp/enviar', {
              cuerpo: { correo: correo(`ip-${i}`) },
            })
          ).estado,
        );
      }
      expect(estados).toEqual([200, 200, 429]);
    } finally {
      if (anterior === undefined) delete process.env['OTP_ENVIOS_POR_IP'];
      else process.env['OTP_ENVIOS_POR_IP'] = anterior;
    }
  });
  it('pedir códigos está limitado por dirección', async () => {
    const nav = new Navegador();
    const estados: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      estados.push(
        (await nav.llamar('POST', '/api/v1/auth/otp/enviar', { cuerpo: { correo: SOLO_CODIGO } }))
          .estado,
      );
    }
    expect(estados.slice(0, 3)).toEqual([200, 200, 200]);
    expect(estados).toContain(429);
  });
});
