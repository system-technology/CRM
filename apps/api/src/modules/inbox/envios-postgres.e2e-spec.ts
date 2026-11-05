/**
 * Los envíos sobre PostgreSQL REAL y sin Redis (ADR-0019 §1.2, §3.2): dos agencias, DOS instancias
 * del consumidor concurrentes (el solape de dos máquinas durante un despliegue) y una Graph API
 * falsa que cuenta las peticiones. Cada mensaje llega a Meta UNA sola vez.
 *
 * Afirma, con las piezas reales (`PrismaWebhookService` con el rol `viajapro_webhook`, la cola, la
 * reserva, el caso de uso y el adaptador HTTP de Graph):
 *   · dos consumidores que reciben los mismos mensajes de dos agencias producen UNA petición por
 *     mensaje, y el `wamid` queda en la fila correcta;
 *   · una fila reservada y sin `wamid` NO se reenvía, ni al encolarla ni en el barrido: queda
 *     `FALLIDO` «sin confirmar» (C5);
 *   · un arrendamiento vigente no se reclama; vencido, el barrido lo reencola y sale una vez;
 *   · la reserva no alcanza el mensaje de otra agencia, aunque se conozca su id (RLS).
 *
 * Fixtures: como las demás e2e, las siembra el propietario (`DATABASE_URL`) y las borra
 * `borrarTenants`. Los roles de aplicación nunca siembran: el aislamiento se prueba con ellos.
 * Corre en CI, donde están las cadenas de base de datos.
 */
import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Logger } from '@nestjs/common';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaWebhookService } from '../../shared/prisma/prisma-webhook.service.js';
import { EnviarMensajeSaliente } from './application/enviar-mensaje-saliente.js';
import {
  type CredencialDeEnvio,
  PuertoCredencialesWhatsapp,
} from './application/puertos-de-envio.js';
import type { PuertoOutbox } from './application/puertos-de-eventos.js';
import { RecuperarEnviosSinResolver } from './application/recuperar-envios-sin-resolver.js';
import { ColaDeEnviosPostgres } from './infrastructure/cola-de-envios.postgres.js';
import { EnvioWhatsappGraph } from './infrastructure/envio-whatsapp.graph.js';
import { MensajesSalientesPrisma } from './infrastructure/mensajes-salientes.prisma.js';
import { ReservaDeEnvioPostgres } from './infrastructure/reserva-de-envio.postgres.js';

const CORRE = Boolean(process.env['DATABASE_URL']);
const MARCA = randomUUID().slice(0, 8);
const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Una credencial para cualquier canal: aquí no se prueba de dónde sale el token. */
class CredencialesDeLaPrueba extends PuertoCredencialesWhatsapp {
  paraCanal(
    _tenantId: string,
    canal: { canalId: string; phoneNumberId: string },
  ): Promise<CredencialDeEnvio> {
    return Promise.resolve({ phoneNumberId: canal.phoneNumberId, token: 'token-de-la-prueba' });
  }
}

interface Agencia {
  tenant: string;
  canal: string;
  conversacion: string;
}

interface Instancia {
  prisma: PrismaWebhookService;
  cola: ColaDeEnviosPostgres;
  reservas: ReservaDeEnvioPostgres;
  mensajes: MensajesSalientesPrisma;
  recuperar: (agencias: string[]) => RecuperarEnviosSinResolver;
}

describe.skipIf(!CORRE)('envíos sobre Postgres: dos agencias, dos consumidores, sin Redis', () => {
  let admin: Client;
  let graph: Server;
  let urlDeGraph: string;
  /** Peticiones que llegaron a la «Graph API», por referencia (id de nuestro mensaje). */
  const peticiones = new Map<string, number>();
  let contador = 0;
  const A: Agencia = { tenant: '', canal: '', conversacion: '' };
  const B: Agencia = { tenant: '', canal: '', conversacion: '' };
  const instancias: Instancia[] = [];
  /** Clase y código de lo que falló en las colas (nunca el mensaje: R10). */
  const fallosDeCola: string[] = [];

  async function sembrarAgencia(a: Agencia, etiqueta: string): Promise<void> {
    a.tenant = `01932000-0000-7000-8000-${randomUUID().slice(-12)}`;
    a.canal = randomUUID();
    a.conversacion = randomUUID();
    const cuenta = randomUUID();
    const contacto = randomUUID();
    await admin.query(
      `INSERT INTO tenants (id, slug, nombre, creado_en, actualizado_en) VALUES ($1, $2, $3, now(), now())`,
      [a.tenant, `fixture-aislamiento-envios-${MARCA}-${etiqueta}`, `Agencia ${etiqueta} ${MARCA}`],
    );
    await admin.query('BEGIN');
    try {
      await admin.query("SELECT set_config('app.current_tenant', $1, true)", [a.tenant]);
      await admin.query(
        `INSERT INTO cuentas_whatsapp (id, tenant_id, waba_id, nombre, actualizado_en)
         VALUES ($1, $2, $3, 'WABA envios', now())`,
        [cuenta, a.tenant, `waba-envios-${MARCA}-${etiqueta}`],
      );
      await admin.query(
        `INSERT INTO canales (id, tenant_id, cuenta_id, phone_number_id, numero_e164, actualizado_en)
         VALUES ($1, $2, $3, $4, '+573001119999', now())`,
        [a.canal, a.tenant, cuenta, `pn-${MARCA}-${etiqueta}`],
      );
      await admin.query(
        `INSERT INTO contactos (id, tenant_id, telefono_e164, creado_en, actualizado_en)
         VALUES ($1, $2, '+573001118888', now(), now())`,
        [contacto, a.tenant],
      );
      // La ventana de 24 h abierta: el viajero escribió hace un momento.
      await admin.query(
        `INSERT INTO conversaciones (id, tenant_id, contacto_id, canal_id, ultimo_mensaje_cliente_en,
                                     creado_en, actualizado_en)
         VALUES ($1, $2, $3, $4, now(), now(), now())`,
        [a.conversacion, a.tenant, contacto, a.canal],
      );
      await admin.query('COMMIT');
    } catch (error) {
      await admin.query('ROLLBACK');
      throw error;
    }
  }

  /** Un saliente PENDIENTE, con el estado de envío que pida la prueba (SQL del propietario). */
  async function sembrarSaliente(
    a: Agencia,
    estadoDeEnvio: { reservadoHaceS?: number; siguienteEnS?: number; intentos?: number } = {},
  ): Promise<string> {
    const id = randomUUID();
    await admin.query('BEGIN');
    try {
      await admin.query("SELECT set_config('app.current_tenant', $1, true)", [a.tenant]);
      await admin.query(
        `INSERT INTO mensajes (id, tenant_id, conversacion_id, direccion, tipo, texto, ocurrido_en,
                               envio_reservado_en, envio_siguiente_en, envio_intentos, actualizado_en)
         VALUES ($1, $2, $3, 'SALIENTE', 'TEXTO', $4, now(),
                 CASE WHEN $5::int IS NULL THEN NULL ELSE now() - ($5::int * interval '1 second') END,
                 CASE WHEN $6::int IS NULL THEN NULL ELSE now() + ($6::int * interval '1 second') END,
                 $7::int, now())`,
        [
          id,
          a.tenant,
          a.conversacion,
          `Cotizacion ${MARCA}`,
          estadoDeEnvio.reservadoHaceS ?? null,
          estadoDeEnvio.siguienteEnS ?? null,
          estadoDeEnvio.intentos ?? 0,
        ],
      );
      await admin.query('COMMIT');
    } catch (error) {
      await admin.query('ROLLBACK');
      throw error;
    }
    return id;
  }

  async function fila(a: Agencia, id: string) {
    await admin.query('BEGIN');
    try {
      await admin.query("SELECT set_config('app.current_tenant', $1, true)", [a.tenant]);
      const r = await admin.query<{
        estado: string;
        wamid: string | null;
        reservado: boolean;
        intentos: number;
        motivo: string | null;
      }>(
        `SELECT estado, wamid, envio_reservado_en IS NOT NULL AS reservado,
                envio_intentos AS intentos, motivo_fallo AS motivo
           FROM mensajes WHERE tenant_id = $1 AND id = $2`,
        [a.tenant, id],
      );
      return r.rows[0];
    } finally {
      await admin.query('ROLLBACK');
    }
  }

  async function esperarWamid(a: Agencia, id: string): Promise<string> {
    const limite = Date.now() + 20_000;
    for (;;) {
      const f = await fila(a, id);
      if (f?.wamid) return f.wamid;
      if (Date.now() > limite) {
        // Diagnóstico sin contenido: estado de la fila y códigos de los fallos de las colas.
        throw new Error(
          `Se agotó la espera del wamid. Fila: ${JSON.stringify(f)}. Fallos de cola: ${JSON.stringify(fallosDeCola)}.`,
        );
      }
      await dormir(100);
    }
  }

  async function nuevaInstancia(): Promise<Instancia> {
    const prisma = new PrismaWebhookService();
    await prisma.onModuleInit();
    const mensajes = new MensajesSalientesPrisma(prisma);
    const reservas = new ReservaDeEnvioPostgres(prisma);
    const cola = new ColaDeEnviosPostgres(
      prisma,
      (_clave, contexto, error) => {
        const e = error as { constructor?: { name?: string }; code?: unknown; codigo?: unknown };
        fallosDeCola.push(
          `#${contexto.intento} ${e.constructor?.name ?? '?'}:${String(typeof e.code === 'string' ? e.code : typeof e.codigo === 'string' ? e.codigo : '')}`,
        );
      },
      { esperaBaseMs: 50, concurrencia: 2 },
    );
    const caso = new EnviarMensajeSaliente(
      mensajes,
      new CredencialesDeLaPrueba(),
      new EnvioWhatsappGraph({ baseUrl: urlDeGraph, reintentos: 0 }),
      reservas,
    );
    cola.conectar(async (t, m, c) => {
      await caso.ejecutar(t, m, c.ultimoIntento);
    });
    const instancia: Instancia = {
      prisma,
      cola,
      reservas,
      mensajes,
      recuperar: (agencias) => {
        // Solo las agencias de ESTA prueba: la base de CI es compartida con otras.
        const outbox = {
          tenantsParaBarrer: () => Promise.resolve(agencias),
        } as unknown as PuertoOutbox;
        return new RecuperarEnviosSinResolver(outbox, cola, mensajes, cola);
      },
    };
    instancias.push(instancia);
    return instancia;
  }

  beforeAll(async () => {
    Logger.overrideLogger(false);
    admin = new Client({ connectionString: process.env['DATABASE_URL'] });
    await admin.connect();
    const bd = await admin.query('SELECT current_database() AS db');
    if (bd.rows[0].db !== 'neondb') throw new Error(`Base inesperada: ${bd.rows[0].db}.`);

    graph = createServer((req, res) => {
      const trozos: Buffer[] = [];
      req.on('data', (t: Buffer) => trozos.push(t));
      req.on('end', () => {
        const cuerpo = JSON.parse(Buffer.concat(trozos).toString('utf8')) as {
          biz_opaque_callback_data?: string;
        };
        const ref = cuerpo.biz_opaque_callback_data ?? '?';
        peticiones.set(ref, (peticiones.get(ref) ?? 0) + 1);
        contador += 1;
        // Un poco de latencia: ensancha la carrera entre los dos consumidores.
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ messages: [{ id: `wamid.FALSO.${MARCA}.${contador}` }] }));
        }, 40);
      });
    });
    await new Promise<void>((r) => graph.listen(0, '127.0.0.1', r));
    urlDeGraph = `http://127.0.0.1:${(graph.address() as AddressInfo).port}`;

    await sembrarAgencia(A, 'a');
    await sembrarAgencia(B, 'b');
  });

  afterAll(async () => {
    for (const i of instancias) {
      await i.cola.cerrar(2_000);
      await i.prisma.onModuleDestroy();
    }
    await new Promise<void>((r) => (graph ? graph.close(() => r()) : r()));
    if (admin) {
      try {
        type Limpiador = (c: Client, ids: string[]) => Promise<unknown>;
        const ruta = '../../../../../packages/database/scripts/borrar-tenants.mjs';
        const modulo = (await import(ruta)) as { borrarTenants: Limpiador };
        await admin.query('BEGIN');
        await modulo.borrarTenants(admin, [A.tenant, B.tenant].filter(Boolean));
        await admin.query('COMMIT');
      } finally {
        await admin.end();
      }
    }
  });

  it('dos consumidores, dos agencias: cada mensaje llega a Meta UNA sola vez', async () => {
    const uno = await nuevaInstancia();
    const dos = await nuevaInstancia();
    const mensajes: Array<{ a: Agencia; id: string }> = [];
    for (const a of [A, B]) {
      for (let i = 0; i < 3; i += 1) mensajes.push({ a, id: await sembrarSaliente(a) });
    }

    // Las dos «máquinas» reciben TODOS los mensajes a la vez, como en un solape de despliegue.
    await Promise.all(
      mensajes.flatMap(({ a, id }) => [
        uno.cola.encolar(a.tenant, id),
        dos.cola.encolar(a.tenant, id),
      ]),
    );

    for (const { a, id } of mensajes) {
      const wamid = await esperarWamid(a, id);
      expect(wamid).toMatch(/^wamid\.FALSO\./);
    }
    await dormir(500); // por si alguna segunda petición llegara tarde
    for (const { a, id } of mensajes) {
      expect(peticiones.get(id)).toBe(1);
      const f = await fila(a, id);
      expect(f).toMatchObject({ estado: 'PENDIENTE', reservado: true, intentos: 1 });
    }
  });

  it('la reserva no alcanza el mensaje de otra agencia, aunque se conozca su id (RLS)', async () => {
    const { reservas } = await nuevaInstancia();
    const deB = await sembrarSaliente(B);
    expect(await reservas.reservar(A.tenant, deB)).toBe(false);
    expect((await fila(B, deB))?.reservado).toBe(false);
    // Y la propia agencia sí: una vez.
    expect(await reservas.reservar(B.tenant, deB)).toBe(true);
    expect(await reservas.reservar(B.tenant, deB)).toBe(false);
  });

  it('proceso muerto tras la reserva: NO se reenvía, ni al encolar ni en el barrido; queda sin confirmar', async () => {
    const { cola, recuperar } = await nuevaInstancia();
    // Reservado hace 10 min y con el arrendamiento ya vencido: el proceso anterior murió.
    const id = await sembrarSaliente(A, { reservadoHaceS: 600, siguienteEnS: -300, intentos: 1 });

    await cola.encolar(A.tenant, id);
    await dormir(600);
    expect(peticiones.get(id)).toBeUndefined();

    const r = await recuperar([A.tenant, B.tenant]).barrer();
    expect(r.sinConfirmar).toBe(1);
    const f = await fila(A, id);
    expect(f).toMatchObject({ estado: 'FALLIDO', wamid: null });
    expect(f?.motivo).toMatch(/No pudimos confirmar/);

    // Un segundo barrido ya no la toca, y Meta sigue sin ver nada.
    await recuperar([A.tenant, B.tenant]).barrer();
    await dormir(300);
    expect(peticiones.get(id)).toBeUndefined();
  });

  it('un arrendamiento vigente no se reclama; vencido, el barrido lo reencola y sale UNA vez', async () => {
    const { cola, recuperar } = await nuevaInstancia();
    const vigente = await sembrarSaliente(B, { siguienteEnS: 300, intentos: 1 });
    const vencido = await sembrarSaliente(B, { siguienteEnS: -1, intentos: 1 });

    await cola.encolar(B.tenant, vigente);
    await recuperar([B.tenant]).barrer();
    await esperarWamid(B, vencido);
    await dormir(500);

    expect(peticiones.get(vigente)).toBeUndefined();
    expect(peticiones.get(vencido)).toBe(1);
    expect((await fila(B, vencido))?.intentos).toBe(2);
    expect((await fila(B, vigente))?.intentos).toBe(1);
  });
});
