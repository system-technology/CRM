/**
 * El adaptador de etiquetas contra una base EN MEMORIA que evalúa los `where` de igualdad, `AND` y
 * `OR` que usa. Lo que se comprueba es la lógica del adaptador: orden de las comprobaciones (la
 * conversación antes que la etiqueta), topes, idempotencia, qué se escribe en el outbox y que el
 * tenant va en cada consulta. La consulta real con RLS y las dos agencias está en
 * `etiquetas.e2e-spec.ts` (necesita PostgreSQL).
 */
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Permiso } from '@viajapro/contracts';
import { CifradoDeCampos } from '../../../shared/cifrado/cifrado-de-campos.js';
import { columnasDeUltimoMensaje } from '../../../shared/cifrado/columnas-de-prisma.js';
import { COLUMNAS_CIFRADAS } from '../../../shared/cifrado/puerto-de-cifrado.js';
import { uuidV7 } from '../../../shared/cifrado/uuid-v7.js';
import type { Visibilidad } from '../../../shared/autorizacion/visibilidad-de-conversaciones.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  EtiquetaDuplicadaError,
  TopeDeEtiquetasDeLaAgenciaError,
  TopeDeEtiquetasDeLaConversacionError,
} from '../domain/errores-de-etiqueta.js';
import { FalloDeEscrituraDeEtiquetas } from './errores-de-escritura-de-etiquetas.js';
import { EtiquetasPrisma } from './etiquetas.prisma.js';

const cifrado = new CifradoDeCampos({ version: 1, actual: randomBytes(32), anterior: null });
const TENANT = uuidV7();
const OTRA = uuidV7();
const ANA = uuidV7();
const BETO = uuidV7();
/** El nombre que NO puede aparecer en ningún evento del outbox. */
const NOMBRE_SENSIBLE = 'Seguimiento Marta Gómez';

type Fila = Record<string, unknown>;

function cumple(fila: Fila, where: Fila): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'AND')
      return (Array.isArray(v) ? (v as Fila[]) : [v as Fila]).every((w) => cumple(fila, w));
    if (k === 'OR') return (v as Fila[]).some((w) => cumple(fila, w));
    return fila[k] === v;
  });
}

function baseEnMemoria() {
  const etiquetas: Fila[] = [];
  const asignaciones: Fila[] = [];
  const conversaciones: Fila[] = [];
  const outbox: Fila[] = [];
  const bloqueos: unknown[] = [];
  const consultas: Array<{ modelo: string; where: Fila }> = [];
  let falloAlCrear: Error | null = null;

  const registra = (modelo: string, where: Fila): void => {
    consultas.push({ modelo, where });
  };

  const tx = {
    $executeRaw: (_s: TemplateStringsArray, ...valores: unknown[]) => {
      bloqueos.push(valores[0]);
      return Promise.resolve(1);
    },
    label: {
      count: ({ where }: { where: Fila }) => {
        registra('label', where);
        return Promise.resolve(etiquetas.filter((e) => cumple(e, where)).length);
      },
      aggregate: ({ where }: { where: Fila }) => {
        const ordenes = etiquetas.filter((e) => cumple(e, where)).map((e) => e['orden'] as number);
        return Promise.resolve({ _max: { orden: ordenes.length ? Math.max(...ordenes) : null } });
      },
      createMany: ({ data }: { data: Fila[] }) => {
        if (falloAlCrear) return Promise.reject(falloAlCrear);
        let count = 0;
        for (const d of data) {
          const choca = etiquetas.some(
            (e) =>
              e['tenantId'] === d['tenantId'] &&
              String(e['nombre']).trim().toLowerCase() === String(d['nombre']).trim().toLowerCase(),
          );
          if (choca) continue;
          etiquetas.push({ ...d });
          count++;
        }
        return Promise.resolve({ count });
      },
      findFirst: ({ where }: { where: Fila }) => {
        registra('label', where);
        return Promise.resolve(etiquetas.find((e) => cumple(e, where)) ?? null);
      },
      findFirstOrThrow: ({ where }: { where: Fila }) => {
        const e = etiquetas.find((x) => cumple(x, where));
        return e ? Promise.resolve(e) : Promise.reject(new Error('sin fila'));
      },
      findMany: ({ where }: { where: Fila }) =>
        Promise.resolve(
          etiquetas
            .filter((e) => cumple(e, where))
            .sort((a, b) => (a['orden'] as number) - (b['orden'] as number)),
        ),
      updateMany: ({ where, data }: { where: Fila; data: Fila }) => {
        const filas = etiquetas.filter((e) => cumple(e, where));
        for (const f of filas) Object.assign(f, data);
        return Promise.resolve({ count: filas.length });
      },
      deleteMany: ({ where }: { where: Fila }) => {
        const quedan = etiquetas.filter((e) => !cumple(e, where));
        const count = etiquetas.length - quedan.length;
        etiquetas.splice(0, etiquetas.length, ...quedan);
        return Promise.resolve({ count });
      },
    },
    conversationLabel: {
      findFirst: ({ where }: { where: Fila }) => {
        registra('conversationLabel', where);
        return Promise.resolve(asignaciones.find((a) => cumple(a, where)) ?? null);
      },
      count: ({ where }: { where: Fila }) => {
        registra('conversationLabel', where);
        return Promise.resolve(asignaciones.filter((a) => cumple(a, where)).length);
      },
      createMany: ({ data }: { data: Fila[] }) => {
        let count = 0;
        for (const d of data) {
          const ya = asignaciones.some(
            (a) =>
              a['conversacionId'] === d['conversacionId'] && a['etiquetaId'] === d['etiquetaId'],
          );
          if (ya) continue;
          asignaciones.push({ ...d });
          count++;
        }
        return Promise.resolve({ count });
      },
      deleteMany: ({ where }: { where: Fila }) => {
        const quedan = asignaciones.filter((a) => !cumple(a, where));
        const count = asignaciones.length - quedan.length;
        asignaciones.splice(0, asignaciones.length, ...quedan);
        return Promise.resolve({ count });
      },
    },
    conversacion: {
      findFirst: ({ where }: { where: Fila }) => {
        registra('conversacion', where);
        return Promise.resolve(conversaciones.find((c) => cumple(c, where)) ?? null);
      },
      findFirstOrThrow: ({ where }: { where: Fila }) => {
        const c = conversaciones.find((x) => cumple(x, where));
        if (!c) return Promise.reject(new Error('sin fila'));
        return Promise.resolve({
          ...c,
          etiquetasAsignadas: asignaciones
            .filter((a) => a['conversacionId'] === c['id'])
            .map((a) => ({ etiqueta: etiquetas.find((e) => e['id'] === a['etiquetaId']) })),
        });
      },
    },
    outbox: {
      create: ({ data }: { data: Fila }) => {
        outbox.push(data);
        return Promise.resolve(data);
      },
    },
    registroAuditoria: { create: () => Promise.resolve({}) },
  };

  const prisma = { conTenant: <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx) };
  return {
    prisma: prisma as unknown as PrismaService,
    etiquetas,
    asignaciones,
    conversaciones,
    outbox,
    bloqueos,
    consultas,
    fallarAlCrearCon: (e: Error) => {
      falloAlCrear = e;
    },
  };
}

function conversacion(tenantId: string, asignadoAId: string | null): Fila {
  const id = uuidV7();
  return {
    id,
    tenantId,
    eliminadoEn: null,
    contactoId: uuidV7(),
    estado: 'ABIERTA',
    asignadoAId,
    ultimoMensajeClienteEn: null,
    ...columnasDeUltimoMensaje(
      cifrado.cifrar(COLUMNAS_CIFRADAS.CONVERSACIONES_ULTIMO_MENSAJE_TEXTO, tenantId, id, 'Hola'),
    ),
    ultimoMensajeEn: new Date(),
    ultimoMensajeDireccion: 'ENTRANTE',
    mensajesSinLeer: 0,
    slaVenceEn: null,
    primeraRespuestaEn: null,
    contacto: { nombre: 'Viajera', telefonoE164: '+573001234567' },
    asignadoA: null,
  };
}

const TODAS: Visibilidad = { alcance: 'TODAS' };
const SOLO_BETO: Visibilidad = { alcance: 'ASIGNADAS_Y_COLA', usuarioId: BETO };

function comoEnLaAgencia<T>(fn: () => T): T {
  return ContextoTenant.ejecutarCon(
    {
      tenantId: TENANT,
      usuarioId: ANA,
      identidadId: null,
      permisos: new Set<Permiso>(),
      trazaId: 't',
    },
    fn,
  );
}

function montar() {
  const base = baseEnMemoria();
  const adaptador = new EtiquetasPrisma(base.prisma, cifrado);
  return { ...base, adaptador };
}

const AHORA = new Date('2026-11-21T12:00:00Z');

describe('EtiquetasPrisma: catálogo', () => {
  it('crea con el tenant, el autor y el orden siguiente, y lo serializa por agencia', async () => {
    const m = montar();
    const a = await comoEnLaAgencia(() =>
      m.adaptador.crear(ANA, { nombre: 'Pagado', color: 'verde' }),
    );
    const b = await comoEnLaAgencia(() =>
      m.adaptador.crear(ANA, { nombre: 'Seguimiento', color: 'azul' }),
    );
    expect(a).toMatchObject({ nombre: 'Pagado', color: 'verde', orden: 0 });
    expect(b.orden).toBe(1);
    expect(m.etiquetas[0]).toMatchObject({ tenantId: TENANT, creadoPorId: ANA });
    expect(m.bloqueos).toEqual([`etiquetas:${TENANT}`, `etiquetas:${TENANT}`]);
  });

  it('el nombre normalizado repetido es ETIQUETA_DUPLICADA y no se guarda', async () => {
    const m = montar();
    await comoEnLaAgencia(() => m.adaptador.crear(ANA, { nombre: 'Pagado', color: 'verde' }));
    const error = await comoEnLaAgencia(() =>
      m.adaptador.crear(ANA, { nombre: 'pagado', color: 'azul' }),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EtiquetaDuplicadaError);
    expect(m.etiquetas).toHaveLength(1);
  });

  it('el mensaje de ETIQUETA_DUPLICADA no lleva el nombre (R10)', async () => {
    const m = montar();
    await comoEnLaAgencia(() =>
      m.adaptador.crear(ANA, { nombre: NOMBRE_SENSIBLE, color: 'verde' }),
    );
    const error = await comoEnLaAgencia(() =>
      m.adaptador.crear(ANA, { nombre: NOMBRE_SENSIBLE.toUpperCase(), color: 'azul' }),
    ).catch((e: unknown) => e as Error);
    expect((error as Error).message).not.toMatch(/Marta|Gómez/i);
    expect((error as EtiquetaDuplicadaError).code).toBe('ETIQUETA_DUPLICADA');
  });

  it('con 50 etiquetas, la 51 es TOPE_DE_ETIQUETAS_DE_LA_AGENCIA', async () => {
    const m = montar();
    for (let i = 0; i < 50; i++) {
      m.etiquetas.push({
        id: uuidV7(),
        tenantId: TENANT,
        nombre: `E${i}`,
        color: 'gris',
        orden: i,
      });
    }
    const error = await comoEnLaAgencia(() =>
      m.adaptador.crear(ANA, { nombre: 'Una más', color: 'gris' }),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TopeDeEtiquetasDeLaAgenciaError);
    expect(m.etiquetas).toHaveLength(50);
  });

  it('el tope cuenta solo las de ESTA agencia', async () => {
    const m = montar();
    for (let i = 0; i < 50; i++) {
      m.etiquetas.push({ id: uuidV7(), tenantId: OTRA, nombre: `E${i}`, color: 'gris', orden: i });
    }
    await expect(
      comoEnLaAgencia(() => m.adaptador.crear(ANA, { nombre: 'Mía', color: 'gris' })),
    ).resolves.toMatchObject({ nombre: 'Mía' });
  });

  it('un error de Postgres al crear sale traducido y SIN el nombre (23514)', async () => {
    const m = montar();
    m.fallarAlCrearCon(
      Object.assign(
        new Error(`new row for relation "etiquetas" violates check (${NOMBRE_SENSIBLE})`),
        {
          code: '23514',
        },
      ),
    );
    const error = (await comoEnLaAgencia(() =>
      m.adaptador.crear(ANA, { nombre: NOMBRE_SENSIBLE, color: 'gris' }),
    ).catch((e: unknown) => e)) as Error;
    expect((error as { code?: string }).code).toBe('ETIQUETA_INVALIDA');
    expect(JSON.stringify(error) + error.message + (error.stack ?? '')).not.toMatch(/Marta|Gómez/);
  });

  it('un error inesperado al crear no arrastra el original ni su texto', async () => {
    const m = montar();
    m.fallarAlCrearCon(new Error(`algo raro con ${NOMBRE_SENSIBLE}`));
    const error = (await comoEnLaAgencia(() =>
      m.adaptador.crear(ANA, { nombre: NOMBRE_SENSIBLE, color: 'gris' }),
    ).catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(FalloDeEscrituraDeEtiquetas);
    expect(error.cause).toBeUndefined();
    expect(error.message + (error.stack ?? '')).not.toMatch(/Marta|Gómez/);
  });

  it('renombra y recolorea conservando el id; una ajena o inexistente da null', async () => {
    const m = montar();
    const e = await comoEnLaAgencia(() =>
      m.adaptador.crear(ANA, { nombre: 'Pagado', color: 'verde' }),
    );
    const r = await comoEnLaAgencia(() =>
      m.adaptador.actualizar(ANA, e.id, { nombre: 'Cobrado', color: 'rosa' }),
    );
    expect(r).toMatchObject({ id: e.id, nombre: 'Cobrado', color: 'rosa' });
    expect(m.etiquetas[0]).toMatchObject({ actualizadoPorId: ANA });
    m.etiquetas.push({ id: uuidV7(), tenantId: OTRA, nombre: 'X', color: 'gris', orden: 0 });
    const ajena = m.etiquetas[1]?.['id'] as string;
    expect(
      await comoEnLaAgencia(() => m.adaptador.actualizar(ANA, ajena, { color: 'azul' })),
    ).toBeNull();
    expect(
      await comoEnLaAgencia(() => m.adaptador.actualizar(ANA, uuidV7(), { color: 'azul' })),
    ).toBeNull();
    expect(m.etiquetas[1]).toMatchObject({ color: 'gris' });
  });

  it('borra solo las de esta agencia', async () => {
    const m = montar();
    const e = await comoEnLaAgencia(() =>
      m.adaptador.crear(ANA, { nombre: 'Pagado', color: 'verde' }),
    );
    const ajena = uuidV7();
    m.etiquetas.push({ id: ajena, tenantId: OTRA, nombre: 'X', color: 'gris', orden: 0 });
    expect(await comoEnLaAgencia(() => m.adaptador.borrar(ajena))).toBe(false);
    expect(m.etiquetas).toHaveLength(2);
    expect(await comoEnLaAgencia(() => m.adaptador.borrar(e.id))).toBe(true);
    expect(await comoEnLaAgencia(() => m.adaptador.borrar(e.id))).toBe(false);
  });
});

describe('EtiquetasPrisma: poner y quitar', () => {
  function conEtiquetaYConversacion(asignadoAId: string | null = null) {
    const m = montar();
    const etiquetaId = uuidV7();
    m.etiquetas.push({
      id: etiquetaId,
      tenantId: TENANT,
      nombre: NOMBRE_SENSIBLE,
      color: 'azul',
      orden: 0,
    });
    const conv = conversacion(TENANT, asignadoAId);
    m.conversaciones.push(conv);
    return { ...m, etiquetaId, conversacionId: conv['id'] as string };
  }

  it('pone la etiqueta, devuelve la fila con ella y escribe UN evento con solo ids', async () => {
    const m = conEtiquetaYConversacion();
    const r = await comoEnLaAgencia(() =>
      m.adaptador.poner(TODAS, ANA, m.conversacionId, m.etiquetaId, AHORA),
    );
    expect(r).toMatchObject({ resultado: 'OK', cambio: true });
    if (r.resultado !== 'OK') throw new Error('esperaba OK');
    expect(r.resumen.etiquetas).toEqual([
      { id: m.etiquetaId, nombre: NOMBRE_SENSIBLE, color: 'azul' },
    ]);
    expect(m.asignaciones).toEqual([
      expect.objectContaining({ tenantId: TENANT, asignadaPorId: ANA, asignadaEn: AHORA }),
    ]);
    expect(m.outbox).toHaveLength(1);
    expect(m.outbox[0]).toMatchObject({
      tenantId: TENANT,
      agregado: 'conversacion',
      agregadoId: m.conversacionId,
      tipoEvento: 'inbox.conversacion_actualizada',
      payload: {},
    });
    expect(JSON.stringify(m.outbox)).not.toMatch(/Marta|Gómez/);
    expect(m.bloqueos).toEqual([`conversacion_etiquetas:${m.conversacionId}`]);
  });

  it('es idempotente: la segunda vez no duplica, no escribe evento y dice cambio:false', async () => {
    const m = conEtiquetaYConversacion();
    await comoEnLaAgencia(() =>
      m.adaptador.poner(TODAS, ANA, m.conversacionId, m.etiquetaId, AHORA),
    );
    const otra = await comoEnLaAgencia(() =>
      m.adaptador.poner(TODAS, ANA, m.conversacionId, m.etiquetaId, AHORA),
    );
    expect(otra).toMatchObject({ resultado: 'OK', cambio: false });
    expect(m.asignaciones).toHaveLength(1);
    expect(m.outbox).toHaveLength(1);
  });

  it('con 10 puestas, la 11 distinta es TOPE_DE_ETIQUETAS_DE_LA_CONVERSACION; repetir una puesta no falla', async () => {
    const m = conEtiquetaYConversacion();
    const ids: string[] = [m.etiquetaId];
    for (let i = 1; i < 11; i++) {
      const id = uuidV7();
      ids.push(id);
      m.etiquetas.push({ id, tenantId: TENANT, nombre: `E${i}`, color: 'gris', orden: i });
    }
    for (const id of ids.slice(0, 10)) {
      await comoEnLaAgencia(() => m.adaptador.poner(TODAS, ANA, m.conversacionId, id, AHORA));
    }
    const decimaPrimera = ids[10] as string;
    const error = await comoEnLaAgencia(() =>
      m.adaptador.poner(TODAS, ANA, m.conversacionId, decimaPrimera, AHORA),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TopeDeEtiquetasDeLaConversacionError);
    expect(m.asignaciones).toHaveLength(10);
    // Repetir una que ya está, estando en el tope, es idempotente y no un error.
    await expect(
      comoEnLaAgencia(() => m.adaptador.poner(TODAS, ANA, m.conversacionId, m.etiquetaId, AHORA)),
    ).resolves.toMatchObject({ resultado: 'OK', cambio: false });
  });

  it('una etiqueta de otra agencia es ETIQUETA_NO_ENCONTRADA y no escribe nada', async () => {
    const m = conEtiquetaYConversacion();
    const ajena = uuidV7();
    m.etiquetas.push({ id: ajena, tenantId: OTRA, nombre: 'X', color: 'gris', orden: 0 });
    const r = await comoEnLaAgencia(() =>
      m.adaptador.poner(TODAS, ANA, m.conversacionId, ajena, AHORA),
    );
    expect(r).toEqual({ resultado: 'ETIQUETA_NO_ENCONTRADA' });
    // Igual que una que nunca existió.
    expect(
      await comoEnLaAgencia(() => m.adaptador.poner(TODAS, ANA, m.conversacionId, uuidV7(), AHORA)),
    ).toEqual(r);
    expect(m.asignaciones).toHaveLength(0);
    expect(m.outbox).toHaveLength(0);
  });

  it('una conversación de otra agencia o inexistente es CONVERSACION_NO_ENCONTRADA, tenga o no la etiqueta', async () => {
    const m = conEtiquetaYConversacion();
    const ajena = conversacion(OTRA, null);
    m.conversaciones.push(ajena);
    const r = await comoEnLaAgencia(() =>
      m.adaptador.poner(TODAS, ANA, ajena['id'] as string, m.etiquetaId, AHORA),
    );
    expect(r).toEqual({ resultado: 'CONVERSACION_NO_ENCONTRADA' });
    expect(
      await comoEnLaAgencia(() => m.adaptador.poner(TODAS, ANA, uuidV7(), m.etiquetaId, AHORA)),
    ).toEqual(r);
    // Con la conversación ajena la respuesta no depende de la etiqueta: no se puede sondear.
    expect(
      await comoEnLaAgencia(() =>
        m.adaptador.poner(TODAS, ANA, ajena['id'] as string, uuidV7(), AHORA),
      ),
    ).toEqual(r);
    expect(m.asignaciones).toHaveLength(0);
  });

  it('sin ver_todas, la conversación de otro asesor es un 404 (la cola común y la propia, no)', async () => {
    const deAna = conEtiquetaYConversacion(ANA);
    expect(
      await comoEnLaAgencia(() =>
        deAna.adaptador.poner(SOLO_BETO, BETO, deAna.conversacionId, deAna.etiquetaId, AHORA),
      ),
    ).toEqual({ resultado: 'CONVERSACION_NO_ENCONTRADA' });
    expect(
      await comoEnLaAgencia(() =>
        deAna.adaptador.quitar(SOLO_BETO, deAna.conversacionId, deAna.etiquetaId, AHORA),
      ),
    ).toEqual({ resultado: 'CONVERSACION_NO_ENCONTRADA' });
    expect(deAna.asignaciones).toHaveLength(0);

    const cola = conEtiquetaYConversacion(null);
    await expect(
      comoEnLaAgencia(() =>
        cola.adaptador.poner(SOLO_BETO, BETO, cola.conversacionId, cola.etiquetaId, AHORA),
      ),
    ).resolves.toMatchObject({ resultado: 'OK', cambio: true });
    const deBeto = conEtiquetaYConversacion(BETO);
    await expect(
      comoEnLaAgencia(() =>
        deBeto.adaptador.poner(SOLO_BETO, BETO, deBeto.conversacionId, deBeto.etiquetaId, AHORA),
      ),
    ).resolves.toMatchObject({ resultado: 'OK', cambio: true });
  });

  it('quitar es idempotente: la segunda vez responde igual, sin evento', async () => {
    const m = conEtiquetaYConversacion();
    await comoEnLaAgencia(() =>
      m.adaptador.poner(TODAS, ANA, m.conversacionId, m.etiquetaId, AHORA),
    );
    const primera = await comoEnLaAgencia(() =>
      m.adaptador.quitar(TODAS, m.conversacionId, m.etiquetaId, AHORA),
    );
    expect(primera).toMatchObject({ resultado: 'OK', cambio: true });
    if (primera.resultado !== 'OK') throw new Error('esperaba OK');
    expect(primera.resumen.etiquetas).toEqual([]);
    expect(m.outbox).toHaveLength(2);
    const segunda = await comoEnLaAgencia(() =>
      m.adaptador.quitar(TODAS, m.conversacionId, m.etiquetaId, AHORA),
    );
    expect(segunda).toMatchObject({ resultado: 'OK', cambio: false });
    expect(m.outbox).toHaveLength(2);
  });

  it('todas las consultas llevan el tenant de la sesión', async () => {
    const m = conEtiquetaYConversacion();
    await comoEnLaAgencia(() =>
      m.adaptador.poner(TODAS, ANA, m.conversacionId, m.etiquetaId, AHORA),
    );
    expect(m.consultas.length).toBeGreaterThan(0);
    for (const { modelo, where } of m.consultas) {
      expect(JSON.stringify(where), modelo).toContain(TENANT);
    }
  });
});
