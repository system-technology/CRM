/**
 * El libro de cobro en PostgreSQL (T-330), siempre bajo el tenant de la petición
 * (`PrismaService.conTenant` fija `app.current_tenant`; RLS lo hace cumplir). Además, el `tenantId`
 * va en cada predicado y en cada fila escrita (R1).
 *
 * **Sumas.** Se agrupan en la base y se leen como `bigint` (`SUM(...)::bigint` → `BigInt` en Prisma):
 * nunca `Number`, que pierde precisión por encima de 2^53 y hace creer que un saldo cuadra.
 *
 * **Candado.** `pg_advisory_xact_lock(7410329, hashtext(tenant || ':' || archivo))`: el MISMO espacio
 * y la MISMA clave que `pagos_validar_alta` (migración `20261121140000`), así la API y la base se
 * serializan sobre el mismo recurso. Los ids se pasan por `::uuid::text` para que el texto sea el
 * canónico en minúsculas, igual que `uuid::text` del disparador.
 *
 * **Errores.** Un error de Postgres aborta la transacción: se traduce en el `catch` que la rodea.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SUMAS_EN_CERO, type SumasDeCobro } from '@viajapro/domain';
import { PrismaService, type ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  type ArchivoParaCobro,
  PuertoArchivoParaCobro,
} from '../../../shared/puertos/puertos-hacia-booking.js';
import {
  type LecturaDeCobro,
  type LecturaDeVista,
  type OperacionesDeCobro,
  type PlazoDeCobro,
  type PlazoNuevo,
  RepositorioDeCobros,
} from '../application/puertos-de-cobro.js';
import { SumaIlegibleError } from '../domain/errors.js';
import type { EventoParaOutbox } from '../domain/eventos.js';
import { diaDeColumnaDate } from '../domain/fechas.js';
import type { Movimiento, MovimientoNuevo } from '../domain/movimiento.js';
import { traducirErrorDelLibro } from './errores-de-escritura-del-libro.js';

/** El espacio de candados del cobro: el mismo literal que `pagos_validar_alta`. */
export const ESPACIO_DE_CANDADO_DEL_COBRO = 7_410_329;

/** Espera máxima por el candado del archivo (mismo valor que booking y quoting). */
export const ESPERA_MAXIMA_DEL_BLOQUEO = '5s';

/**
 * Una suma de la base como `bigint`. Un `number` se rechaza aunque sea entero: si el controlador
 * dejara de devolver `BigInt`, un valor grande ya habría perdido dígitos y no habría cómo saberlo.
 */
export function aBigInt(valor: unknown): bigint {
  if (typeof valor === 'bigint') return valor;
  if (typeof valor === 'string' && /^-?\d+$/.test(valor)) return BigInt(valor);
  throw new SumaIlegibleError();
}

interface FilaDeSuma {
  travel_file_id: string;
  tipo: string;
  suma: unknown;
}

/** Sumas de los movimientos VIGENTES por archivo y tipo (un REVERSO no mueve dinero). */
export async function sumasVigentesPorArchivo(
  tx: ClienteTenant,
  tenantId: string,
  archivoIds: readonly string[],
): Promise<Map<string, SumasDeCobro>> {
  const mapa = new Map<string, SumasDeCobro>();
  if (archivoIds.length === 0) return mapa;
  const ids = Prisma.join(archivoIds.map((id) => Prisma.sql`${id}::uuid`));
  const filas = await tx.$queryRaw<FilaDeSuma[]>`
    SELECT p.travel_file_id, p.tipo::text AS tipo, SUM(p.monto_unidades)::bigint AS suma
      FROM pagos p
     WHERE p.tenant_id = ${tenantId}::uuid
       AND p.travel_file_id IN (${ids})
       AND p.tipo <> 'REVERSO'
       AND NOT EXISTS (
             SELECT 1 FROM pagos r
              WHERE r.tenant_id = p.tenant_id AND r.reverso_de_id = p.id)
     GROUP BY p.travel_file_id, p.tipo`;
  for (const f of filas) {
    const actual = mapa.get(f.travel_file_id) ?? { ...SUMAS_EN_CERO };
    const suma = aBigInt(f.suma);
    if (f.tipo === 'PAGO') actual.pagos = suma;
    else if (f.tipo === 'DEVOLUCION') actual.devoluciones = suma;
    else if (f.tipo === 'AJUSTE') actual.ajustes = suma;
    else if (f.tipo === 'PENALIDAD') actual.penalidades = suma;
    mapa.set(f.travel_file_id, actual);
  }
  return mapa;
}

type FilaDePago = Prisma.PaymentGetPayload<Record<string, never>>;

const aMovimiento = (f: FilaDePago): Movimiento => ({
  id: f.id,
  travelFileId: f.travelFileId,
  tipo: f.tipo,
  montoUnidades: f.montoUnidades,
  monedaIso: f.monedaIso,
  pagadoEl: f.pagadoEl === null ? null : diaDeColumnaDate(f.pagadoEl),
  medio: f.medio,
  pagadorId: f.pagadorId,
  referencia: f.referencia,
  nota: f.nota,
  notaTachadaEn: f.notaTachadaEn,
  motivo: f.motivo,
  reversoDeId: f.reversoDeId,
  claveIdempotencia: f.claveIdempotencia,
  registradoPor: f.registradoPorId,
  registradoEn: f.registradoEn,
});

const aPlazo = (f: {
  id: string;
  travelFileId: string;
  venceEl: Date;
  motivo: string | null;
  registradoPorId: string;
  registradoEn: Date;
}): PlazoDeCobro => ({
  id: f.id,
  travelFileId: f.travelFileId,
  venceEl: diaDeColumnaDate(f.venceEl),
  motivo: f.motivo,
  registradoPor: f.registradoPorId,
  registradoEn: f.registradoEn,
});

class OperacionesPrisma implements OperacionesDeCobro {
  constructor(
    private readonly tx: ClienteTenant,
    private readonly tenantId: string,
    private readonly archivos: PuertoArchivoParaCobro,
  ) {}

  async bloquearCobroDelArchivo(archivoId: string): Promise<void> {
    // `lock_timeout` local a la transacción y ANTES del candado (patrón de booking): si otra
    // operación lo retiene demasiado, falla con 55P03 (→ 409 reintentable) en vez de agotar la
    // transacción interactiva de Prisma. Vale también para el `FOR SHARE` del puerto.
    await this.tx
      .$executeRaw`SELECT set_config('lock_timeout', ${ESPERA_MAXIMA_DEL_BLOQUEO}, true)`;
    // Su propia sentencia (ADR-0034 §4 paso 1). `$executeRaw` y no `$queryRaw`: la función devuelve
    // `void`, que Prisma no sabe deserializar.
    await this.tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        ${ESPACIO_DE_CANDADO_DEL_COBRO}::int,
        hashtext(${this.tenantId}::uuid::text || ':' || ${archivoId}::uuid::text))`;
  }

  leerArchivoBloqueado(archivoId: string): Promise<ArchivoParaCobro | null> {
    return this.archivos.leer(this.tx, this.tenantId, archivoId, { bloquear: true });
  }

  async zonaHoraria(): Promise<string> {
    const t = await this.tx.tenant.findUnique({
      where: { id: this.tenantId },
      select: { zonaHoraria: true },
    });
    return t?.zonaHoraria ?? 'America/Bogota';
  }

  async buscarPorClave(clave: string): Promise<Movimiento | null> {
    const f = await this.tx.payment.findFirst({
      where: { tenantId: this.tenantId, claveIdempotencia: clave },
    });
    return f ? aMovimiento(f) : null;
  }

  async buscarMovimiento(archivoId: string, pagoId: string): Promise<Movimiento | null> {
    const f = await this.tx.payment.findFirst({
      where: { id: pagoId, travelFileId: archivoId, tenantId: this.tenantId },
    });
    return f ? aMovimiento(f) : null;
  }

  async yaReversado(pagoId: string): Promise<boolean> {
    const n = await this.tx.payment.count({
      where: { tenantId: this.tenantId, reversoDeId: pagoId },
    });
    return n > 0;
  }

  async sumasVigentes(archivoId: string): Promise<SumasDeCobro> {
    const mapa = await sumasVigentesPorArchivo(this.tx, this.tenantId, [archivoId]);
    return mapa.get(archivoId) ?? { ...SUMAS_EN_CERO };
  }

  async insertar(n: MovimientoNuevo): Promise<Movimiento | null> {
    // `ON CONFLICT (tenant_id, clave_idempotencia) DO NOTHING` (ADR-0034 §4 paso 3): Prisma no lo
    // expresa. `registrado_en` no se manda: lo fija `pagos_validar_alta` con la hora de la sentencia.
    const filas = await this.tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO pagos (
        id, tenant_id, travel_file_id, tipo, monto_unidades, moneda_iso, pagado_el, medio,
        pagador_id, referencia, nota, motivo, reverso_de_id, clave_idempotencia, registrado_por)
      VALUES (
        ${n.id}::uuid, ${this.tenantId}::uuid, ${n.travelFileId}::uuid,
        ${n.tipo}::tipo_movimiento_de_cobro, ${n.montoUnidades}::bigint, ${n.monedaIso},
        ${n.pagadoEl}::date, ${n.medio}, ${n.pagadorId}::uuid, ${n.referencia}, ${n.nota},
        ${n.motivo}, ${n.reversoDeId}::uuid, ${n.claveIdempotencia}::uuid,
        ${n.registradoPor}::uuid)
      ON CONFLICT (tenant_id, clave_idempotencia) DO NOTHING
      RETURNING id`;
    if (filas.length === 0) return null;
    const guardada = await this.tx.payment.findFirst({
      where: { id: n.id, tenantId: this.tenantId },
    });
    return guardada ? aMovimiento(guardada) : null;
  }

  async escribirEvento(evento: EventoParaOutbox): Promise<void> {
    await this.tx.outbox.create({
      data: {
        tenantId: this.tenantId,
        agregado: evento.agregado,
        agregadoId: evento.agregadoId,
        tipoEvento: evento.tipoEvento,
        versionEvento: evento.versionEvento,
        payload: evento.payload,
      },
      select: { id: true },
    });
  }

  async ultimoPlazo(archivoId: string): Promise<PlazoDeCobro | null> {
    const f = await this.tx.collectionDueDate.findFirst({
      where: { tenantId: this.tenantId, travelFileId: archivoId },
      orderBy: [{ registradoEn: 'desc' }, { id: 'desc' }],
    });
    return f ? aPlazo(f) : null;
  }

  async insertarPlazo(p: PlazoNuevo): Promise<PlazoDeCobro> {
    const f = await this.tx.collectionDueDate.create({
      data: {
        id: p.id,
        tenantId: this.tenantId,
        travelFileId: p.travelFileId,
        venceEl: new Date(`${p.venceEl}T00:00:00.000Z`),
        motivo: p.motivo,
        registradoPorId: p.registradoPor,
      },
    });
    return aPlazo(f);
  }
}

@Injectable()
export class RepositorioDeCobrosPrisma extends RepositorioDeCobros {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PuertoArchivoParaCobro) private readonly archivos: PuertoArchivoParaCobro,
  ) {
    super();
  }

  async enTransaccion<T>(fn: (ops: OperacionesDeCobro) => Promise<T>): Promise<T> {
    const { tenantId } = ContextoTenant.obtener();
    try {
      return await this.prisma.conTenant((tx) =>
        fn(new OperacionesPrisma(tx, tenantId, this.archivos)),
      );
    } catch (error) {
      return traducirErrorDelLibro(error);
    }
  }

  leerCobro(archivoId: string): Promise<LecturaDeCobro | null> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const archivo = await this.archivos.leer(tx, tenantId, archivoId);
      if (!archivo) return null;
      const movimientos = await tx.payment.findMany({
        where: { tenantId, travelFileId: archivoId },
        orderBy: [{ registradoEn: 'asc' }, { id: 'asc' }],
      });
      const parametros = await tx.parametrosDeCobro.findUnique({ where: { tenantId } });
      const plazo = await tx.collectionDueDate.findFirst({
        where: { tenantId, travelFileId: archivoId },
        orderBy: [{ registradoEn: 'desc' }, { id: 'desc' }],
      });
      const agencia = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { zonaHoraria: true },
      });
      return {
        archivo,
        movimientos: movimientos.map(aMovimiento),
        zonaHoraria: agencia?.zonaHoraria ?? 'America/Bogota',
        diasDePlazo: parametros?.diasPlazoDeCobro ?? null,
        plazoManual: plazo ? diaDeColumnaDate(plazo.venceEl) : null,
      };
    });
  }

  leerVista(tope: number): Promise<LecturaDeVista> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      // Una fila de más que el tope: así se sabe si hubo recorte.
      const leidos = await this.archivos.listarAbiertos(tx, tenantId, { limite: tope + 1 });
      const archivos = leidos.slice(0, tope);
      const ids = archivos.map((a) => a.id);
      const sumas = await sumasVigentesPorArchivo(tx, tenantId, ids);

      // La última fila de `plazos_de_cobro` por archivo, por `(registrado_en, id)`.
      const plazosManuales = new Map<string, string>();
      if (ids.length > 0) {
        const lista = Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
        const filas = await tx.$queryRaw<Array<{ travel_file_id: string; vence_el: string }>>`
          SELECT DISTINCT ON (travel_file_id) travel_file_id, vence_el::text AS vence_el
            FROM plazos_de_cobro
           WHERE tenant_id = ${tenantId}::uuid AND travel_file_id IN (${lista})
           ORDER BY travel_file_id, registrado_en DESC, id DESC`;
        for (const f of filas) plazosManuales.set(f.travel_file_id, f.vence_el);
      }

      const parametros = await tx.parametrosDeCobro.findUnique({ where: { tenantId } });
      const agencia = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { zonaHoraria: true },
      });
      return {
        archivos,
        sumas,
        plazosManuales,
        zonaHoraria: agencia?.zonaHoraria ?? 'America/Bogota',
        diasDePlazo: parametros?.diasPlazoDeCobro ?? null,
        truncado: leidos.length > tope,
      };
    });
  }

  async fijarDiasDePlazo(dias: number, usuarioId: string): Promise<void> {
    const { tenantId } = ContextoTenant.obtener();
    try {
      await this.prisma.conTenant((tx) =>
        tx.parametrosDeCobro.upsert({
          where: { tenantId },
          create: { tenantId, diasPlazoDeCobro: dias, actualizadoPorId: usuarioId },
          update: { diasPlazoDeCobro: dias, actualizadoPorId: usuarioId },
          select: { tenantId: true },
        }),
      );
    } catch (error) {
      traducirErrorDelLibro(error);
    }
  }
}
