/**
 * Las garantías del procesamiento de changes en modo `unico` contra PostgreSQL REAL y SIN Redis
 * (ADR-0019 §1.2, §1.3, §7 paso 6; auditoría del PR #211, hallazgo C6).
 *
 * Piezas reales: `PrismaWebhookService` (rol `viajapro_webhook`), `StagingPrisma`, `BandejaPrisma`,
 * `ProcesarChange`, `PendientesPrisma`, `BarrerPendientes`, `BarridoEnProceso` y
 * `ColaDeChangesEnProceso`. Las «dos máquinas» de un despliegue son dos pools y dos colas en
 * memoria sobre la misma base.
 *
 * Afirma:
 *   1. dos `ProcesarChange` CONCURRENTES sobre el mismo change dejan UN mensaje, UN evento de
 *      outbox, UN no leído y el change `PROCESADO`: la unicidad `(tenant_id, wamid)` y el
 *      `FOR UPDATE` de la base, y no la cola, son la garantía (ADR-0019 §1.2);
 *   2. el barrido de ARRANQUE (antigüedad 0) recoge lo recibido justo antes de un reinicio, que el
 *      barrido periódico (30 s de antigüedad) dejaría esperando;
 *   3. durante el solape de un despliegue, el barrido de arranque de la máquina nueva NO produce
 *      efectos dobles (un mensaje, un evento);
 *   4. C6: el barrido de arranque de la máquina nueva NO despacha un change que la vieja tiene en
 *      vuelo. **Hoy lo despacha** (la cola en memoria de la nueva está vacía y `tomar_recepcion` no
 *      bloquea la fila). Es `it.fails`: documenta el hallazgo para `backend`, no lo corrige.
 *
 * Fixtures: las siembra el propietario (`DATABASE_URL`); los roles de aplicación nunca siembran.
 * Corre en CI (job `modo-unico-sin-redis`, sin `REDIS_URL`). En local sin base se salta; con
 * `CI=true` NO se salta jamás: un job verde sin haber corrido sería peor que uno rojo.
 */
import 'reflect-metadata';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaWebhookService } from '../../shared/prisma/prisma-webhook.service.js';
import { ContactosDeCrm } from '../crm/infrastructure/puertos-de-crm.prisma.js';
import { BarrerPendientes } from './application/barrer-pendientes.js';
import { ProcesarChange, type ResultadoDeProceso } from './application/procesar-change.js';
import { type ChangePendiente, PuertoPendientes } from './application/puertos-de-barrido.js';
import { claveDeEnrutamiento } from './domain/clave-de-enrutamiento.js';
import { resolverClavePayload, sellarPayload } from './domain/payload-sellado.js';
import { BandejaPrisma } from './infrastructure/bandeja.prisma.js';
import { BarridoEnProceso } from './infrastructure/barrido.en-proceso.js';
import { ColaDeChangesEnProceso } from './infrastructure/cola-de-changes.en-proceso.js';
import { PendientesPrisma } from './infrastructure/pendientes.prisma.js';
import { StagingPrisma } from './infrastructure/staging.prisma.js';

const CORRE =
  process.env['CI'] === 'true' ||
  (Boolean(process.env['DATABASE_URL']) && Boolean(process.env['DATABASE_WEBHOOK_URL']));

const MARCA = randomUUID().slice(0, 8);
const PIMIENTA = process.env['WHATSAPP_DIRECTORY_PEPPER'] ?? '';
const TENANT = `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const CUENTA = randomUUID();
const CANAL = randomUUID();
const PN = String(Math.floor(Math.random() * 9e14) + 1e14);
const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const idDe = (c: Buffer): Buffer => createHash('sha256').update(c).digest();

/** Una «máquina»: su pool, su caso de uso, su cola en memoria y el barrido que la acompaña. */
interface Maquina {
  prisma: PrismaWebhookService;
  procesar: ProcesarChange;
  cola: ColaDeChangesEnProceso;
  barrido: BarridoEnProceso;
  /** Cuántas veces la cola de ESTA máquina despachó cada change (clave = hex del id). */
  despachos: Map<string, number>;
  /** Si no es null, el despacho espera a esta promesa ANTES de llamar a `ProcesarChange`. */
  compuerta: Promise<void> | null;
}

describe.skipIf(!CORRE)('changes en modo unico: concurrencia y recuperación, sin Redis', () => {
  let admin: Client;
  const maquinas: Maquina[] = [];
  const RECEPCIONES: Buffer[] = [];
  const entorno = { ...process.env };
  let telefonos = 0;
  /** Lo mide la prueba del solape (que debe pasar); el hallazgo C6 lo afirma después. */
  let despachosEnElSolape: number | undefined;

  /** Solo las recepciones de esta prueba: la base lista TODO lo pendiente de todos. */
  class SoloLasMias extends PuertoPendientes {
    constructor(private readonly real: PuertoPendientes) {
      super();
    }
    contarReencolado(recepcionId: Buffer, indice: number): Promise<number> {
      return this.real.contarReencolado(recepcionId, indice);
    }
    async listar(antiguedad: number, limite: number, max: number): Promise<ChangePendiente[]> {
      const todas = await this.real.listar(antiguedad, limite, max);
      const mias = new Set(RECEPCIONES.map((r) => r.toString('hex')));
      return todas.filter((f) => mias.has(f.recepcionId.toString('hex')));
    }
  }

  async function nuevaMaquina(): Promise<Maquina> {
    const prisma = new PrismaWebhookService();
    await prisma.onModuleInit();
    const procesar = new ProcesarChange(
      new StagingPrisma(prisma),
      new BandejaPrisma(prisma, new ContactosDeCrm()),
    );
    const cola = new ColaDeChangesEnProceso({}, { esperaBaseMs: 50, intentos: 1 });
    const m: Maquina = {
      prisma,
      procesar,
      cola,
      barrido: new BarridoEnProceso(cola, prisma),
      despachos: new Map(),
      compuerta: null,
    };
    cola.conectar(async (recepcionId, indice) => {
      const k = recepcionId.toString('hex');
      m.despachos.set(k, (m.despachos.get(k) ?? 0) + 1);
      if (m.compuerta) await m.compuerta;
      await procesar.ejecutar(recepcionId, indice);
    });
    maquinas.push(m);
    return m;
  }

  function barrerDe(m: Maquina): BarrerPendientes {
    return new BarrerPendientes(new SoloLasMias(new PendientesPrisma(m.prisma)), m.barrido);
  }

  function sobre(wamid: string, telefono: string): Buffer {
    return Buffer.from(
      JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '102290129340398',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '15550783881', phone_number_id: PN },
                  contacts: [{ profile: { name: 'Viajero Concurrente' }, wa_id: telefono }],
                  messages: [
                    {
                      from: telefono,
                      id: wamid,
                      timestamp: '1760900000',
                      text: { body: `Hola desde la prueba de changes ${MARCA}` },
                      type: 'text',
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
      'utf8',
    );
  }

  /** Deja la recepción PENDIENTE en el staging, como lo hace el POST del webhook (sin encolar). */
  async function recibir(): Promise<{ id: Buffer; wamid: string; telefono: string }> {
    telefonos += 1;
    const telefono = `57300${String(telefonos).padStart(7, '0')}`;
    const wamid = `wamid.${randomUUID()}`;
    const cuerpo = sobre(wamid, telefono);
    const id = idDe(cuerpo);
    RECEPCIONES.push(id);
    const s = sellarPayload(cuerpo, resolverClavePayload(process.env, 'WEBHOOK_PAYLOAD_KEY'), id);
    // Con el rol que la tiene concedida (`viajapro_app`), como el POST real: no con el propietario.
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE "viajapro_app"');
      const r = await admin.query<{ ok: boolean }>(
        `SELECT public.registrar_recepcion($1::bytea, $2::bytea, $3::bytea, $4::bytea, 1::smallint, 1::smallint) AS ok`,
        [id, s.cifrado, s.nonce, s.tag],
      );
      await admin.query('COMMIT');
      expect(r.rows[0]?.ok).toBe(true);
    } catch (error) {
      await admin.query('ROLLBACK');
      throw error;
    }
    return { id, wamid, telefono };
  }

  /** Lecturas del propietario bajo el tenant fijado, en una transacción que se deshace. */
  async function consultar<T extends Record<string, unknown>>(
    sql: string,
    params: unknown[],
  ): Promise<T[]> {
    await admin.query('BEGIN');
    try {
      await admin.query("SELECT set_config('app.current_tenant', $1, true)", [TENANT]);
      return (await admin.query(sql, params)).rows as T[];
    } finally {
      await admin.query('ROLLBACK');
    }
  }

  async function efectos(wamid: string, telefono: string) {
    const mensajes = await consultar<{ id: string }>(
      'SELECT id FROM mensajes WHERE tenant_id = $1 AND wamid = $2',
      [TENANT, wamid],
    );
    const eventos = mensajes[0]
      ? await consultar<{ n: number }>(
          `SELECT count(*)::int AS n FROM outbox
            WHERE tenant_id = $1 AND agregado_id = $2 AND tipo_evento = 'inbox.mensaje_recibido'`,
          [TENANT, mensajes[0].id],
        )
      : [{ n: 0 }];
    const sinLeer = await consultar<{ n: number }>(
      `SELECT COALESCE(sum(c.mensajes_sin_leer), 0)::int AS n
         FROM conversaciones c JOIN contactos k ON k.id = c.contacto_id AND k.tenant_id = c.tenant_id
        WHERE c.tenant_id = $1 AND k.telefono_e164 LIKE '%' || $2`,
      [TENANT, telefono],
    );
    return { mensajes: mensajes.length, eventos: eventos[0]?.n ?? 0, sinLeer: sinLeer[0]?.n ?? 0 };
  }

  async function estadoDelChange(id: Buffer): Promise<string | undefined> {
    // Por la función del trabajador (`tomar_recepcion`): ninguna tabla del staging se lee directa.
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE "viajapro_webhook"');
      const r = await admin.query<{ estado: string }>(
        'SELECT estado::text AS estado FROM public.tomar_recepcion($1::bytea, 0::smallint)',
        [id],
      );
      return r.rows[0]?.estado;
    } finally {
      await admin.query('ROLLBACK');
    }
  }

  async function esperar<T>(
    que: () => T | undefined | Promise<T | undefined>,
    ms = 20_000,
  ): Promise<T> {
    const limite = Date.now() + ms;
    for (;;) {
      const v = await que();
      if (v !== undefined) return v;
      if (Date.now() > limite) throw new Error('Se agotó la espera de la condición.');
      await dormir(100);
    }
  }

  beforeAll(async () => {
    if (!PIMIENTA) throw new Error('Falta WHATSAPP_DIRECTORY_PEPPER: sin ella no hay directorio.');
    Logger.overrideLogger(false);
    process.env['WEBHOOK_PAYLOAD_KEY'] = randomBytes(32).toString('base64');
    process.env['WEBHOOK_PAYLOAD_KEY_VERSION'] = '1';
    delete process.env['REDIS_URL'];

    admin = new Client({ connectionString: process.env['DATABASE_URL'] });
    await admin.connect();
    const bd = await admin.query('SELECT current_database() AS db');
    if (bd.rows[0].db !== 'neondb') throw new Error(`Base inesperada: ${bd.rows[0].db}.`);

    await admin.query(
      `INSERT INTO tenants (id, slug, nombre, creado_en, actualizado_en) VALUES ($1, $2, $3, now(), now())`,
      [TENANT, `fixture-aislamiento-changes-${MARCA}`, `Agencia de changes ${MARCA}`],
    );
    await admin.query(
      `INSERT INTO cuentas_whatsapp (id, tenant_id, waba_id, nombre, actualizado_en) VALUES ($1, $2, $3, 'WABA changes', now())`,
      [CUENTA, TENANT, `waba-changes-${MARCA}`],
    );
    await admin.query(
      `INSERT INTO canales (id, tenant_id, cuenta_id, phone_number_id, numero_e164, actualizado_en) VALUES ($1, $2, $3, $4, '+573001110011', now())`,
      [CANAL, TENANT, CUENTA, PN],
    );
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE "viajapro_altas"');
      await admin.query("SELECT set_config('app.current_tenant', $1, true)", [TENANT]);
      await admin.query(
        `SELECT registrar_enrutamiento($1, $2::smallint, $3, $4, $5,
                                       'ACTIVO'::estado_enrutamiento, NULL, $6)`,
        [claveDeEnrutamiento(PIMIENTA, 'pn', PN), 1, TENANT, CANAL, CUENTA, 'alta e2e changes'],
      );
      await admin.query('COMMIT');
    } catch (error) {
      await admin.query('ROLLBACK');
      throw error;
    }
  });

  afterAll(async () => {
    for (const m of maquinas) {
      await m.cola.cerrar(2_000);
      await m.prisma.onModuleDestroy();
    }
    for (const k of ['WEBHOOK_PAYLOAD_KEY', 'WEBHOOK_PAYLOAD_KEY_VERSION', 'REDIS_URL']) {
      if (entorno[k] === undefined) delete process.env[k];
      else process.env[k] = entorno[k];
    }
    if (admin) {
      try {
        await admin.query('SET ROLE "viajapro_staging"');
        await admin.query('DELETE FROM recepciones_webhook_changes WHERE recepcion_id = ANY($1)', [
          RECEPCIONES,
        ]);
        await admin.query('DELETE FROM recepciones_webhook WHERE recepcion_id = ANY($1)', [
          RECEPCIONES,
        ]);
        await admin.query('RESET ROLE');
        await admin.query('SET ROLE "viajapro_enrutador"');
        await admin.query('DELETE FROM enrutamiento_canales WHERE tenant_resuelto_id = $1', [
          TENANT,
        ]);
        await admin.query('RESET ROLE');
        type Limpiador = (c: Client, ids: string[]) => Promise<unknown>;
        const ruta = '../../../../../packages/database/scripts/borrar-tenants.mjs';
        const modulo = (await import(ruta)) as { borrarTenants: Limpiador };
        await admin.query('BEGIN');
        await modulo.borrarTenants(admin, [TENANT]);
        await admin.query('COMMIT');
      } finally {
        await admin.end();
      }
    }
  });

  it('dos ProcesarChange concurrentes sobre el mismo change procesan UNA sola vez', async () => {
    const uno = await nuevaMaquina();
    const dos = await nuevaMaquina();

    for (let ronda = 0; ronda < 6; ronda += 1) {
      const { id, wamid, telefono } = await recibir();
      const [x, y] = await Promise.allSettled([
        uno.procesar.ejecutar(id, 0),
        dos.procesar.ejecutar(id, 0),
      ]);
      const resultados: ResultadoDeProceso[] = [];
      for (const r of [x, y]) {
        if (r.status === 'fulfilled') resultados.push(r.value);
        // Una carrera por crear el mismo contacto o hilo puede hacer fallar a una de las dos; la
        // cola real reintenta, y eso se simula abajo.
      }
      // El reintento de la cola: con todo resuelto no debe hacer nada (YA_RESUELTO).
      resultados.push(await uno.procesar.ejecutar(id, 0));

      const nuevos = resultados.reduce(
        (n, r) => n + (r.estado === 'PROCESADO' ? r.mensajesNuevos : 0),
        0,
      );
      expect(nuevos, 'mensajes creados entre todas las ejecuciones').toBe(1);
      expect(await efectos(wamid, telefono)).toEqual({ mensajes: 1, eventos: 1, sinLeer: 1 });
      expect(await estadoDelChange(id)).toBe('PROCESADO');
    }
  });

  it('el barrido de ARRANQUE recoge lo recibido justo antes de un reinicio; el periódico no', async () => {
    const nueva = await nuevaMaquina();
    const { id, wamid, telefono } = await recibir();

    // Con la antigüedad del barrido periódico, lo recién recibido espera: es lo que el arranque
    // no puede permitirse tras un reinicio (ADR-0019 §1.3).
    const periodico = await barrerDe(nueva).ejecutar({
      antiguedadMinimaS: 30,
      limite: 1000,
      maxReencolados: 10,
    });
    expect(periodico.candidatos).toBe(0);
    expect(await efectos(wamid, telefono)).toMatchObject({ mensajes: 0 });

    const arranque = await barrerDe(nueva).ejecutar({
      antiguedadMinimaS: 0,
      limite: 1000,
      maxReencolados: 10,
    });
    expect(arranque.reencolados).toBe(1);

    await esperar(async () => ((await estadoDelChange(id)) === 'PROCESADO' ? true : undefined));
    expect(await efectos(wamid, telefono)).toEqual({ mensajes: 1, eventos: 1, sinLeer: 1 });
    expect(nueva.despachos.get(id.toString('hex'))).toBe(1);
  });

  it('solape de despliegue: la máquina vieja en vuelo y el arranque de la nueva dejan UN mensaje y UN evento', async () => {
    const vieja = await nuevaMaquina();
    const nueva = await nuevaMaquina();
    const { id, wamid, telefono } = await recibir();

    // La vieja ya despachó el change y está a medias (aún PENDIENTE en la base).
    let soltarVieja: () => void = () => undefined;
    vieja.compuerta = new Promise<void>((r) => {
      soltarVieja = r;
    });
    await vieja.cola.encolar(id, 0);
    await esperar(() => (vieja.despachos.get(id.toString('hex')) === 1 ? true : undefined));
    expect(await estadoDelChange(id)).toBe('PENDIENTE');

    // Arranca la nueva: su barrido de arranque ve el change pendiente y lo despacha.
    await barrerDe(nueva).ejecutar({ antiguedadMinimaS: 0, limite: 1000, maxReencolados: 10 });
    await esperar(async () => ((await estadoDelChange(id)) === 'PROCESADO' ? true : undefined));

    // Y ahora la vieja termina lo suyo: no puede duplicar nada.
    soltarVieja();
    await vieja.cola.cerrar(10_000);
    await dormir(300);
    despachosEnElSolape =
      (vieja.despachos.get(id.toString('hex')) ?? 0) +
      (nueva.despachos.get(id.toString('hex')) ?? 0);

    expect(await efectos(wamid, telefono)).toEqual({ mensajes: 1, eventos: 1, sinLeer: 1 });
    expect(await estadoDelChange(id)).toBe('PROCESADO');
  });

  // C6 (BAJO, dueño `backend`; auditoría del PR #211). El barrido de arranque usa antigüedad 0 y la
  // cola en memoria de la máquina nueva está vacía, así que `enCola` dice «no» y se despacha un
  // change que la vieja tiene en vuelo; `tomar_recepcion` no bloquea la fila. Los efectos no se
  // duplican (la prueba anterior), pero el change se PROCESA dos veces. La auditoría propone, si
  // se quiere evitar, una antigüedad mínima de unos segundos también al arrancar. Cuando se
  // corrija, esta prueba pasará a fallar y habrá que quitarle el `.fails`.
  it.fails(
    'C6: el barrido de arranque NO despacha un change que la máquina vieja tiene en vuelo',
    () => {
      // Medido en la prueba del solape: si esa falló, `despachosEnElSolape` es undefined y esta
      // «falla» por una razón distinta; el rojo de la otra es el que manda.
      expect(
        despachosEnElSolape,
        'veces que se despachó el mismo change entre las dos máquinas',
      ).toBe(1);
    },
  );
});
