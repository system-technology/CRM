/**
 * Las garantías del ENVÍO en modo `unico` que no cubre `envios-postgres.e2e-spec.ts`, contra
 * PostgreSQL REAL y sin Redis (ADR-0019 §3.2, §7 paso 6; auditoría del PR #220, hallazgos Q3, Q4 y
 * Q8). Piezas reales: `PrismaWebhookService` (`viajapro_webhook`), `ColaDeEnviosPostgres`,
 * `ReservaDeEnvioPostgres`, `MensajesSalientesPrisma`, `EnviarMensajeSaliente` y
 * `RecuperarEnviosSinResolver`. Meta es un puerto de mentira que cuenta las llamadas.
 *
 * Afirma:
 *   · proceso muerto tras la reserva: el mensaje queda «sin confirmar» (`FALLIDO`, sin `wamid`) y
 *     NINGUNA ruta lo reenvía (ni el reintento en memoria, ni otra máquina, ni el barrido);
 *   · un rechazo pasajero de Meta libera la reserva y el reintento lo envía UNA vez más;
 *   · Q8: la RLS de `mensajes` impide reservar el envío de otra agencia SIN ayuda del `WHERE
 *     tenant_id` explícito (consulta bajo `SET LOCAL ROLE`, que sí está sujeta a RLS).
 *
 * Defectos conocidos, documentados con `it.fails` (no se corrige producción aquí; dueño `backend`):
 *   · Q3: `reservar` no exige `estado = 'PENDIENTE'` ni `eliminado_en IS NULL`;
 *   · Q4: una fila reservada con `envio_siguiente_en` NULL no la resuelve nadie.
 * Cuando se corrijan, cada `it.fails` empezará a fallar y habrá que quitarle el `.fails`.
 *
 * Fixtures: las siembra el propietario (`DATABASE_URL`) y las borra `borrarTenants`. Las lecturas
 * cruzadas bajan al rol de aplicación: un helper que lee como propietario no prueba RLS. Corre en
 * CI (job `modo-unico-sin-redis`); con `CI=true` jamás se salta.
 */
import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaWebhookService } from '../../shared/prisma/prisma-webhook.service.js';
import { EnviarMensajeSaliente } from './application/enviar-mensaje-saliente.js';
import {
  type CredencialDeEnvio,
  type PedidoDeTexto,
  PuertoCredencialesWhatsapp,
  PuertoEnvioWhatsapp,
} from './application/puertos-de-envio.js';
import type { PuertoOutbox } from './application/puertos-de-eventos.js';
import { RecuperarEnviosSinResolver } from './application/recuperar-envios-sin-resolver.js';
import { FalloTransitorioDeMetaError } from './domain/errores-de-envio.js';
import { ColaDeEnviosPostgres } from './infrastructure/cola-de-envios.postgres.js';
import { MensajesSalientesPrisma } from './infrastructure/mensajes-salientes.prisma.js';
import { ReservaDeEnvioPostgres } from './infrastructure/reserva-de-envio.postgres.js';

const CORRE =
  process.env['CI'] === 'true' ||
  (Boolean(process.env['DATABASE_URL']) && Boolean(process.env['DATABASE_WEBHOOK_URL']));
const MARCA = randomUUID().slice(0, 8);
const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

class CredencialesDeLaPrueba extends PuertoCredencialesWhatsapp {
  paraCanal(
    _t: string,
    canal: { canalId: string; phoneNumberId: string },
  ): Promise<CredencialDeEnvio> {
    return Promise.resolve({ phoneNumberId: canal.phoneNumberId, token: 'token-de-la-prueba' });
  }
}

/** Meta de mentira: cuenta las llamadas por mensaje y se comporta según el guion. */
class MetaGuionada extends PuertoEnvioWhatsapp {
  readonly llamadas = new Map<string, number>();
  constructor(
    private readonly guion: (referencia: string, nLlamada: number) => Promise<{ wamid: string }>,
  ) {
    super();
  }
  enviarTexto(pedido: PedidoDeTexto): Promise<{ wamid: string }> {
    const n = (this.llamadas.get(pedido.referencia) ?? 0) + 1;
    this.llamadas.set(pedido.referencia, n);
    return this.guion(pedido.referencia, n);
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
  recuperar: (agencias: string[]) => RecuperarEnviosSinResolver;
}

describe.skipIf(!CORRE)('envíos en modo unico: garantías sobre Postgres, sin Redis', () => {
  let admin: Client;
  const A: Agencia = { tenant: '', canal: '', conversacion: '' };
  const B: Agencia = { tenant: '', canal: '', conversacion: '' };
  const instancias: Instancia[] = [];
  /** Sembrados en `beforeAll`: un error de fixture falla en voz alta, y no lo tapa un `it.fails`. */
  const sembrados = { fallido: '', eliminado: '', sinArrendamiento: '' };

  async function sembrarAgencia(a: Agencia, etiqueta: string): Promise<void> {
    a.tenant = `01932000-0000-7000-8000-${randomUUID().slice(-12)}`;
    a.canal = randomUUID();
    a.conversacion = randomUUID();
    const cuenta = randomUUID();
    const contacto = randomUUID();
    await admin.query(
      `INSERT INTO tenants (id, slug, nombre, creado_en, actualizado_en) VALUES ($1, $2, $3, now(), now())`,
      [
        a.tenant,
        `fixture-aislamiento-garantias-${MARCA}-${etiqueta}`,
        `Agencia ${etiqueta} ${MARCA}`,
      ],
    );
    await admin.query('BEGIN');
    try {
      await admin.query("SELECT set_config('app.current_tenant', $1, true)", [a.tenant]);
      await admin.query(
        `INSERT INTO cuentas_whatsapp (id, tenant_id, waba_id, nombre, actualizado_en)
         VALUES ($1, $2, $3, 'WABA garantias', now())`,
        [cuenta, a.tenant, `waba-garantias-${MARCA}-${etiqueta}`],
      );
      await admin.query(
        `INSERT INTO canales (id, tenant_id, cuenta_id, phone_number_id, numero_e164, actualizado_en)
         VALUES ($1, $2, $3, $4, '+573001119998', now())`,
        [a.canal, a.tenant, cuenta, `pn-g-${MARCA}-${etiqueta}`],
      );
      await admin.query(
        `INSERT INTO contactos (id, tenant_id, telefono_e164, creado_en, actualizado_en)
         VALUES ($1, $2, '+573001118887', now(), now())`,
        [contacto, a.tenant],
      );
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

  /** Un saliente con el estado de envío que pida la prueba (SQL del propietario, bajo el tenant). */
  async function sembrarSaliente(
    a: Agencia,
    e: {
      reservadoHaceS?: number;
      siguienteEnS?: number;
      intentos?: number;
      estado?: 'PENDIENTE' | 'FALLIDO';
      eliminado?: boolean;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    await admin.query('BEGIN');
    try {
      await admin.query("SELECT set_config('app.current_tenant', $1, true)", [a.tenant]);
      await admin.query(
        `INSERT INTO mensajes (id, tenant_id, conversacion_id, direccion, tipo, estado, texto, ocurrido_en,
                               envio_reservado_en, envio_siguiente_en, envio_intentos, eliminado_en,
                               actualizado_en)
         VALUES ($1, $2, $3, 'SALIENTE', 'TEXTO', $4::estado_mensaje, $5, now(),
                 CASE WHEN $6::int IS NULL THEN NULL ELSE now() - ($6::int * interval '1 second') END,
                 CASE WHEN $7::int IS NULL THEN NULL ELSE now() + ($7::int * interval '1 second') END,
                 $8::int,
                 CASE WHEN $9::boolean THEN now() ELSE NULL END,
                 now())`,
        [
          id,
          a.tenant,
          a.conversacion,
          e.estado ?? 'PENDIENTE',
          `Garantias ${MARCA}`,
          e.reservadoHaceS ?? null,
          e.siguienteEnS ?? null,
          e.intentos ?? 0,
          e.eliminado ?? false,
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
        motivo: string | null;
      }>(
        `SELECT estado::text AS estado, wamid, envio_reservado_en IS NOT NULL AS reservado,
                motivo_fallo AS motivo
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
      if (Date.now() > limite) throw new Error('Se agotó la espera del wamid.');
      await dormir(100);
    }
  }

  async function nuevaInstancia(
    meta: PuertoEnvioWhatsapp,
    opciones: { esperaBaseMs?: number; arrendamientoS?: number } = {},
  ): Promise<Instancia> {
    const prisma = new PrismaWebhookService();
    await prisma.onModuleInit();
    const mensajes = new MensajesSalientesPrisma(prisma);
    const reservas = new ReservaDeEnvioPostgres(prisma);
    const cola = new ColaDeEnviosPostgres(prisma, undefined, {
      esperaBaseMs: opciones.esperaBaseMs ?? 50,
      arrendamientoS: opciones.arrendamientoS ?? 120,
    });
    const caso = new EnviarMensajeSaliente(mensajes, new CredencialesDeLaPrueba(), meta, reservas);
    cola.conectar(async (t, m, c) => {
      await caso.ejecutar(t, m, c.ultimoIntento);
    });
    const instancia: Instancia = {
      prisma,
      cola,
      reservas,
      recuperar: (agencias) => {
        const outbox = {
          tenantsParaBarrer: () => Promise.resolve(agencias),
        } as unknown as PuertoOutbox;
        return new RecuperarEnviosSinResolver(outbox, cola, mensajes, cola);
      },
    };
    instancias.push(instancia);
    return instancia;
  }

  /**
   * Lo que haría el rol de aplicación, SUJETO a RLS: baja de rol en la transacción, fija el
   * tenant y ejecuta la sentencia. Nada aquí corre como propietario.
   */
  async function comoRol<T>(
    rol: 'viajapro_app' | 'viajapro_webhook',
    tenantFijado: string,
    sql: string,
    params: unknown[],
  ): Promise<{ filas: T[]; tocadas: number }> {
    await admin.query('BEGIN');
    try {
      await admin.query(`SET LOCAL ROLE "${rol}"`);
      await admin.query("SELECT set_config('app.current_tenant', $1, true)", [tenantFijado]);
      const r = await admin.query(sql, params);
      return { filas: r.rows as T[], tocadas: r.rowCount ?? 0 };
    } finally {
      await admin.query('ROLLBACK');
    }
  }

  beforeAll(async () => {
    Logger.overrideLogger(false);
    admin = new Client({ connectionString: process.env['DATABASE_URL'] });
    await admin.connect();
    const bd = await admin.query('SELECT current_database() AS db');
    if (bd.rows[0].db !== 'neondb') throw new Error(`Base inesperada: ${bd.rows[0].db}.`);
    await sembrarAgencia(A, 'a');
    await sembrarAgencia(B, 'b');
    sembrados.fallido = await sembrarSaliente(A, { estado: 'FALLIDO' });
    sembrados.eliminado = await sembrarSaliente(A, { eliminado: true });
    sembrados.sinArrendamiento = await sembrarSaliente(A, { reservadoHaceS: 600 });
  });

  afterAll(async () => {
    for (const i of instancias) {
      await i.cola.cerrar(2_000);
      await i.prisma.onModuleDestroy();
    }
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

  it('proceso muerto tras la reserva: queda «sin confirmar» y JAMÁS se reenvía por ninguna ruta', async () => {
    // Meta «recibe» la petición y el proceso muere antes de registrar la respuesta.
    const meta = new MetaGuionada(() => Promise.reject(new Error('el proceso murió')));
    const { cola, recuperar } = await nuevaInstancia(meta, { arrendamientoS: 1 });
    const id = await sembrarSaliente(A);

    await cola.encolar(A.tenant, id);
    await dormir(800); // el reintento en memoria (50 ms) ya tuvo tiempo de intentarlo
    expect(meta.llamadas.get(id)).toBe(1);
    expect(await fila(A, id)).toMatchObject({ estado: 'PENDIENTE', wamid: null, reservado: true });

    // «Reinicio»: otra máquina (otro pool, otra cola en memoria) recibe el mismo envío.
    const nueva = await nuevaInstancia(meta, { arrendamientoS: 1 });
    await nueva.cola.encolar(A.tenant, id);
    await dormir(500);
    expect(meta.llamadas.get(id)).toBe(1);

    // El arrendamiento vence y el barrido lo resuelve: sin confirmar, no reenviado.
    await dormir(1_200);
    const barrido = await nueva.recuperar([A.tenant, B.tenant]).barrer();
    expect(barrido.sinConfirmar).toBe(1);
    const f = await fila(A, id);
    expect(f).toMatchObject({ estado: 'FALLIDO', wamid: null });
    expect(f?.motivo).toMatch(/No pudimos confirmar/);

    await recuperar([A.tenant, B.tenant]).barrer();
    await nueva.cola.encolar(A.tenant, id);
    await dormir(400);
    expect(meta.llamadas.get(id)).toBe(1);
  });

  it('un rechazo pasajero de Meta libera la reserva y el reintento lo envía UNA vez más', async () => {
    const meta = new MetaGuionada((_ref, n) =>
      n === 1
        ? Promise.reject(new FalloTransitorioDeMetaError(null))
        : Promise.resolve({ wamid: `wamid.REINTENTO.${MARCA}` }),
    );
    const { cola } = await nuevaInstancia(meta, { esperaBaseMs: 200 });
    const id = await sembrarSaliente(A);

    await cola.encolar(A.tenant, id);
    const wamid = await esperarWamid(A, id);
    await dormir(500);

    expect(wamid).toBe(`wamid.REINTENTO.${MARCA}`);
    expect(meta.llamadas.get(id)).toBe(2);
    expect(await fila(A, id)).toMatchObject({ estado: 'PENDIENTE', reservado: true });
  });

  describe('Q8: la RLS de mensajes impide reservar el envío de otra agencia (sin WHERE tenant_id)', () => {
    const RESERVA_SIN_FILTRO = `UPDATE mensajes SET envio_reservado_en = now() WHERE id = $1 RETURNING id`;

    for (const rol of ['viajapro_app', 'viajapro_webhook'] as const) {
      it(`${rol}: bajo el tenant A, el mensaje de B ni se ve ni se actualiza`, async () => {
        const deB = await sembrarSaliente(B);
        const lectura = await comoRol<{ n: number }>(
          rol,
          A.tenant,
          'SELECT count(*)::int AS n FROM mensajes WHERE id = $1',
          [deB],
        );
        expect(lectura.filas[0]?.n).toBe(0);

        const escritura = await comoRol(rol, A.tenant, RESERVA_SIN_FILTRO, [deB]);
        expect(escritura.tocadas).toBe(0);
        expect((await fila(B, deB))?.reservado).toBe(false);
      });

      it(`${rol}: sin tenant fijado no se actualiza nada`, async () => {
        const deB = await sembrarSaliente(B);
        const escritura = await comoRol(rol, '', RESERVA_SIN_FILTRO, [deB]);
        expect(escritura.tocadas).toBe(0);
        expect((await fila(B, deB))?.reservado).toBe(false);
      });

      it(`${rol}: control positivo, bajo el tenant B la misma sentencia SÍ actualiza`, async () => {
        // Sin este control, un rol sin permiso de UPDATE haría pasar las pruebas anteriores.
        const deB = await sembrarSaliente(B);
        const escritura = await comoRol(rol, B.tenant, RESERVA_SIN_FILTRO, [deB]);
        expect(escritura.tocadas).toBe(1);
      });
    }
  });

  // Q3 (BAJO, backend). La lectura y la reserva son transacciones distintas: si entre las dos el
  // mensaje deja de estar PENDIENTE o se borra, la reserva igual prospera y el envío sale.
  it.fails('Q3: reservar NO reserva un mensaje que ya no está PENDIENTE', async () => {
    const { reservas } = await nuevaInstancia(
      new MetaGuionada(() => Promise.reject(new Error('x'))),
    );
    expect(await reservas.reservar(A.tenant, sembrados.fallido)).toBe(false);
  });

  it.fails('Q3: reservar NO reserva un mensaje borrado (eliminado_en)', async () => {
    const { reservas } = await nuevaInstancia(
      new MetaGuionada(() => Promise.reject(new Error('x'))),
    );
    expect(await reservas.reservar(A.tenant, sembrados.eliminado)).toBe(false);
  });

  // Q4 (BAJO, backend). `listarSinConfirmar` exige `envio_siguiente_en IS NOT NULL`: una reserva
  // hecha fuera del reclamo (arrendamiento NULL) no la resuelve nadie y queda PENDIENTE para siempre.
  it.fails(
    'Q4: una reserva sin arrendamiento (envio_siguiente_en NULL) la resuelve el barrido',
    async () => {
      const { recuperar } = await nuevaInstancia(
        new MetaGuionada(() => Promise.reject(new Error('x'))),
      );
      const id = await sembrarSaliente(A, { reservadoHaceS: 600 });
      await recuperar([A.tenant]).barrer();
      expect((await fila(A, id))?.estado).toBe('FALLIDO');
    },
  );
});
