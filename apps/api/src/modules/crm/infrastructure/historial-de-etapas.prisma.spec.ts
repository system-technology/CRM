/**
 * T-131 — el historial de etapas se escribe en la MISMA transacción que el cambio, con lo que
 * había en ese momento, y `cerrada_en` sigue a la etapa.
 *
 * Con una transacción doble: lo que se comprueba es el ORDEN y el CONTENIDO de las escrituras
 * dentro del callback de `conTenant`, y que un fallo del historial aborta el cambio (la excepción
 * sale del callback, que es lo que hace que Prisma deshaga la transacción). Que la base lo deshaga
 * de verdad lo prueba el e2e `historial-de-etapas.e2e-spec.ts`.
 */
import { describe, expect, it } from 'vitest';
import type { ClienteTenant, PrismaService } from '../../../shared/prisma/prisma.service.js';
import { PuertoExistenciaDePaquete } from '../../../shared/puertos/puertos-hacia-quoting.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { CrmPrisma } from './crm.prisma.js';
import { EscrituraCrmPrisma } from './escritura-crm.prisma.js';

const TENANT = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const ASESOR = '33333333-3333-4333-8333-333333333333';
const INSTANTE = new Date('2026-11-04T15:00:00.000Z');

const ETAPAS: Record<string, { esGanada: boolean; esPerdida: boolean }> = {
  'e-lead': { esGanada: false, esPerdida: false },
  'e-cotizada': { esGanada: false, esPerdida: false },
  'e-ganada': { esGanada: true, esPerdida: false },
  'e-perdida': { esGanada: false, esPerdida: true },
};

/** Una fila con la forma de `PARA_LA_TARJETA`, lo justo para que `aOportunidad` la traduzca. */
const fila = (etapaId: string) => ({
  id: 'o-1',
  titulo: 'San Andrés',
  destino: null,
  paqueteId: null,
  fechaViajeDesde: null,
  probabilidad: null,
  asesorId: ASESOR,
  valorEstimadoUnidades: null,
  monedaIso: null,
  motivoPerdida: null,
  notaPerdida: null,
  creadoEn: INSTANTE,
  ultimoContactoEn: null,
  proximaTareaDescripcion: null,
  proximaTareaVenceEn: null,
  proximaTareaCompletada: null,
  contactoId: 'c-1',
  contacto: { nombre: null },
  asesor: null,
  etapa: {
    id: etapaId,
    clave: null,
    nombre: etapaId,
    orden: 1,
    probabilidad: 0,
    ...(ETAPAS[etapaId] ?? { esGanada: false, esPerdida: false }),
  },
});

type Escritura = { op: string; datos: unknown };

function transaccionDoble(opciones: { etapaActual?: string | null; historialFalla?: boolean }) {
  const escrituras: Escritura[] = [];
  const tx = {
    $queryRaw: (partes: TemplateStringsArray, ...valores: unknown[]) => {
      escrituras.push({ op: 'bloqueo', datos: { sql: partes.join('?'), valores } });
      return Promise.resolve(
        opciones.etapaActual === null
          ? []
          : [{ etapa_id: opciones.etapaActual ?? 'e-lead', asesor_id: ASESOR }],
      );
    },
    etapaPipeline: {
      findFirst: (a: { where: { id: string; tenantId: string } }) => {
        escrituras.push({ op: 'etapa', datos: a.where });
        const e = ETAPAS[a.where.id];
        return Promise.resolve(e ? { ...e } : null);
      },
    },
    oportunidadCambioEtapa: {
      create: (a: { data: unknown }) => {
        escrituras.push({ op: 'historial', datos: a.data });
        return opciones.historialFalla
          ? Promise.reject(new Error('historial caído'))
          : Promise.resolve({ ocurridoEn: INSTANTE });
      },
    },
    oportunidad: {
      create: (a: { data: { etapaId: string } }) => {
        escrituras.push({ op: 'alta', datos: a.data });
        return Promise.resolve(fila(a.data.etapaId));
      },
      update: (a: { where: unknown; data: { etapaId?: string } }) => {
        escrituras.push({ op: 'update', datos: a });
        return Promise.resolve(fila(a.data.etapaId ?? 'e-lead'));
      },
    },
  };
  const prisma = {
    conTenant: <T>(fn: (t: ClienteTenant) => Promise<T>) => fn(tx as unknown as ClienteTenant),
  } as unknown as PrismaService;
  return { prisma, escrituras };
}

function enTenant<T>(fn: () => T): T {
  return ContextoTenant.ejecutarCon(
    { tenantId: TENANT, usuarioId: ACTOR, identidadId: null, permisos: new Set(), trazaId: 't' },
    fn,
  );
}

const mover = (prisma: PrismaService, etapaId: string, motivo: 'PRECIO' | null = null) =>
  enTenant(() =>
    new CrmPrisma(prisma).moverOportunidad({
      oportunidadId: 'o-1',
      etapaId,
      motivoPerdida: motivo,
      notaPerdida: null,
      actorId: ACTOR,
    }),
  );

describe('CrmPrisma.moverOportunidad — historial y cerrada_en (T-131)', () => {
  it('bloquea la fila con el tenant explícito, y luego historial y cambio, en ese orden', async () => {
    const { prisma, escrituras } = transaccionDoble({ etapaActual: 'e-lead' });
    await mover(prisma, 'e-cotizada');

    expect(escrituras.map((e) => e.op)).toEqual(['bloqueo', 'etapa', 'historial', 'update']);
    const bloqueo = escrituras[0]?.datos as { sql: string; valores: unknown[] };
    expect(bloqueo.sql).toMatch(/tenant_id = \?::uuid/);
    expect(bloqueo.sql).toMatch(/FOR UPDATE/);
    expect(bloqueo.valores).toEqual([TENANT, 'o-1']);
    expect(escrituras[1]?.datos).toEqual({ id: 'e-cotizada', tenantId: TENANT });
  });

  it('la fila lleva la etapa de origen, las banderas del destino, el asesor del momento y quién movió', async () => {
    const { prisma, escrituras } = transaccionDoble({ etapaActual: 'e-cotizada' });
    await mover(prisma, 'e-perdida', 'PRECIO');

    expect(escrituras.find((e) => e.op === 'historial')?.datos).toEqual({
      tenantId: TENANT,
      oportunidadId: 'o-1',
      origen: 'CAMBIO',
      etapaDesdeId: 'e-cotizada',
      etapaHastaId: 'e-perdida',
      esGanada: false,
      esPerdida: true,
      motivoPerdida: 'PRECIO',
      asesorId: ASESOR,
      usuarioId: ACTOR,
    });
  });

  it.each([
    ['ganada', 'e-ganada', INSTANTE],
    ['perdida', 'e-perdida', INSTANTE],
    ['viva (reabrir)', 'e-lead', null],
  ] as const)('a una etapa %s, cerrada_en = %s', async (_caso, etapa, esperado) => {
    const { prisma, escrituras } = transaccionDoble({ etapaActual: 'e-cotizada' });
    await mover(prisma, etapa, etapa === 'e-perdida' ? 'PRECIO' : null);

    const update = escrituras.find((e) => e.op === 'update')?.datos as {
      where: unknown;
      data: { cerradaEn: Date | null; actualizadoPorId: string | null };
    };
    expect(update.where).toEqual({ id_tenantId: { id: 'o-1', tenantId: TENANT } });
    // El MISMO instante que el historial: cierre y fila no discrepan.
    expect(update.data.cerradaEn).toEqual(esperado);
    expect(update.data.actualizadoPorId).toBe(ACTOR);
  });

  it('si el historial no se puede escribir, el cambio NO se hace y el error sale de la transacción', async () => {
    const { prisma, escrituras } = transaccionDoble({ historialFalla: true });
    await expect(mover(prisma, 'e-cotizada')).rejects.toThrow('historial caído');
    expect(escrituras.map((e) => e.op)).not.toContain('update');
  });

  it('una oportunidad que no existe (o borrada, o de otra agencia) no escribe nada', async () => {
    const { prisma, escrituras } = transaccionDoble({ etapaActual: null });
    await expect(mover(prisma, 'e-cotizada')).rejects.toThrow(/No existe la oportunidad/);
    expect(escrituras.map((e) => e.op)).toEqual(['bloqueo']);
  });

  it('una etapa que no es de esta agencia no escribe nada', async () => {
    const { prisma, escrituras } = transaccionDoble({});
    await expect(mover(prisma, 'e-de-otra')).rejects.toThrow(/No existe la etapa/);
    expect(escrituras.map((e) => e.op)).toEqual(['bloqueo', 'etapa']);
  });
});

describe('EscrituraCrmPrisma.crearOportunidad — fila de ALTA (T-131)', () => {
  class SinPaquetes extends PuertoExistenciaDePaquete {
    existePaquete(): Promise<boolean> {
      return Promise.resolve(false);
    }
  }

  const crear = (prisma: PrismaService) =>
    enTenant(() =>
      new EscrituraCrmPrisma(prisma, new SinPaquetes()).crearOportunidad({
        contactoId: 'c-1',
        etapaId: 'e-lead',
        titulo: 'San Andrés',
        destino: null,
        paqueteId: null,
        fechaSalida: null,
        valorEstimado: null,
        asesorId: ASESOR,
        creadoPorId: ACTOR,
      }),
    );

  it('el alta escribe su fila ALTA sin etapa de origen, en la misma transacción', async () => {
    const { prisma, escrituras } = transaccionDoble({});
    await crear(prisma);

    expect(escrituras.map((e) => e.op)).toEqual(['etapa', 'alta', 'historial']);
    expect(escrituras.find((e) => e.op === 'historial')?.datos).toEqual({
      tenantId: TENANT,
      oportunidadId: 'o-1',
      origen: 'ALTA',
      etapaDesdeId: null,
      etapaHastaId: 'e-lead',
      esGanada: false,
      esPerdida: false,
      motivoPerdida: null,
      asesorId: ASESOR,
      usuarioId: ACTOR,
    });
  });

  it('si el historial falla, el alta sale con error (y Prisma la deshace)', async () => {
    const { prisma } = transaccionDoble({ historialFalla: true });
    await expect(crear(prisma)).rejects.toThrow('historial caído');
  });
});
