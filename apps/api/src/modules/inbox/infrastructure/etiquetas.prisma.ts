/**
 * Las etiquetas de conversación contra PostgreSQL, con el pool de la API y SIEMPRE bajo RLS (T-325).
 *
 * - **Tenant:** sale del contexto; cada consulta lo lleva en su `where` además de RLS, y las dos
 *   tablas tienen foráneas compuestas con él. Una etiqueta o una conversación ajena no existe aquí.
 * - **Visibilidad:** poner y quitar parten del mismo `unaConversacion(tenantId, v, id)` que el resto
 *   de la bandeja: una conversación que no se ve es indistinguible de una que no existe.
 * - **Topes (50 por agencia, 10 por conversación):** los impone este adaptador, no la base, y los
 *   serializa con un `pg_advisory_xact_lock` por agencia / por conversación para que dos peticiones
 *   simultáneas no los rebasen.
 * - **Idempotencia (R5):** `createMany({ skipDuplicates })` es `ON CONFLICT DO NOTHING`; solo un
 *   cambio real escribe el evento del outbox, y en la misma transacción.
 * - **R10:** el nombre de una etiqueta no va a logs, eventos ni outbox. Los eventos llevan `{}` y el
 *   id de la conversación; los errores de escritura pasan por `traducirErrorDeEscrituraDeEtiquetas`,
 *   que descarta `message`, `meta` y `detail` (traen el nombre).
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type ActualizarEtiquetaCuerpo,
  type ColorDeEtiqueta,
  type ConversacionResumen,
  type CrearEtiquetaCuerpo,
  type Etiqueta,
  MAX_ETIQUETAS_POR_AGENCIA,
  MAX_ETIQUETAS_POR_CONVERSACION,
  ORDEN_MAXIMO_DE_ETIQUETA,
} from '@viajapro/contracts';
import type { Visibilidad } from '../../../shared/autorizacion/visibilidad-de-conversaciones.js';
import { RegistroDeLectura } from '../../../shared/cifrado/lectura-auditada.js';
import { PuertoCifradoDeCampos } from '../../../shared/cifrado/puerto-de-cifrado.js';
import { uuidV7 } from '../../../shared/cifrado/uuid-v7.js';
import { type ClienteTenant, PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  PuertoDeEtiquetas,
  type ResultadoDeEtiquetar,
} from '../application/puerto-de-etiquetas.js';
import {
  EtiquetaDuplicadaError,
  TopeDeEtiquetasDeLaAgenciaError,
  TopeDeEtiquetasDeLaConversacionError,
} from '../domain/errores-de-etiqueta.js';
import { TIPO_CONVERSACION_ACTUALIZADA } from '../domain/evento-de-dominio.js';
import { escribirEvento, unaConversacion } from './conversaciones.prisma.js';
import { traducirErrorDeEscrituraDeEtiquetas } from './errores-de-escritura-de-etiquetas.js';
import { aResumen, PARA_EL_RESUMEN } from './mapeo.js';

const PARA_LA_ETIQUETA = {
  id: true,
  nombre: true,
  color: true,
  orden: true,
} satisfies Prisma.LabelSelect;

function aEtiqueta(f: Prisma.LabelGetPayload<{ select: typeof PARA_LA_ETIQUETA }>): Etiqueta {
  // El CHECK de la base garantiza que el color es de la paleta.
  return { id: f.id, nombre: f.nombre, color: f.color as ColorDeEtiqueta, orden: f.orden };
}

/** Serializa a quienes tocan lo mismo hasta que la transacción termina. */
async function serializar(tx: ClienteTenant, clave: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${clave}, 0))`;
}

@Injectable()
export class EtiquetasPrisma extends PuertoDeEtiquetas {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PuertoCifradoDeCampos) private readonly cifrado: PuertoCifradoDeCampos,
  ) {
    super();
  }

  // -------------------------------------------------------------------------------- catálogo

  async listar(): Promise<Etiqueta[]> {
    const { tenantId } = ContextoTenant.obtener();
    const filas = await this.prisma.conTenant((tx) =>
      tx.label.findMany({
        where: { tenantId },
        orderBy: [{ orden: 'asc' }, { nombre: 'asc' }, { id: 'asc' }],
        select: PARA_LA_ETIQUETA,
      }),
    );
    return filas.map(aEtiqueta);
  }

  async crear(actorId: string | null, datos: CrearEtiquetaCuerpo): Promise<Etiqueta> {
    const { tenantId } = ContextoTenant.obtener();
    try {
      return await this.prisma.conTenant(async (tx) => {
        await serializar(tx, `etiquetas:${tenantId}`);
        const total = await tx.label.count({ where: { tenantId } });
        if (total >= MAX_ETIQUETAS_POR_AGENCIA) {
          throw new TopeDeEtiquetasDeLaAgenciaError(MAX_ETIQUETAS_POR_AGENCIA);
        }
        const maxima = await tx.label.aggregate({ where: { tenantId }, _max: { orden: true } });
        const id = uuidV7();
        const r = await tx.label.createMany({
          data: [
            {
              id,
              tenantId,
              nombre: datos.nombre,
              color: datos.color,
              orden: Math.min((maxima._max.orden ?? -1) + 1, ORDEN_MAXIMO_DE_ETIQUETA),
              creadoPorId: actorId,
              actualizadoPorId: actorId,
            },
          ],
          // `ON CONFLICT DO NOTHING`: «Pagado» y « pagado » chocan en la unicidad de expresión.
          skipDuplicates: true,
        });
        if (r.count !== 1) throw new EtiquetaDuplicadaError();
        return aEtiqueta(
          await tx.label.findFirstOrThrow({ where: { id, tenantId }, select: PARA_LA_ETIQUETA }),
        );
      });
    } catch (error) {
      return traducirErrorDeEscrituraDeEtiquetas(error);
    }
  }

  async actualizar(
    actorId: string | null,
    id: string,
    cambios: ActualizarEtiquetaCuerpo,
  ): Promise<Etiqueta | null> {
    const { tenantId } = ContextoTenant.obtener();
    try {
      return await this.prisma.conTenant(async (tx) => {
        const r = await tx.label.updateMany({
          where: { id, tenantId },
          data: {
            ...(cambios.nombre === undefined ? {} : { nombre: cambios.nombre }),
            ...(cambios.color === undefined ? {} : { color: cambios.color }),
            ...(cambios.orden === undefined ? {} : { orden: cambios.orden }),
            actualizadoPorId: actorId,
          },
        });
        if (r.count === 0) return null;
        return aEtiqueta(
          await tx.label.findFirstOrThrow({ where: { id, tenantId }, select: PARA_LA_ETIQUETA }),
        );
      });
    } catch (error) {
      // Renombrar a un nombre que ya existe es una violación de la unicidad (23505).
      return traducirErrorDeEscrituraDeEtiquetas(error);
    }
  }

  async borrar(id: string): Promise<boolean> {
    const { tenantId } = ContextoTenant.obtener();
    const r = await this.prisma.conTenant((tx) => tx.label.deleteMany({ where: { id, tenantId } }));
    return r.count > 0;
  }

  // ------------------------------------------------------------------------- en la conversación

  poner(
    v: Visibilidad,
    actorId: string | null,
    conversacionId: string,
    etiquetaId: string,
    ahora: Date,
  ): Promise<ResultadoDeEtiquetar> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const existe = await this.existen(tx, tenantId, v, conversacionId, etiquetaId);
      if (existe) return existe;

      // Un solo escritor por conversación a la vez: el tope se cuenta sobre lo que ya está.
      await serializar(tx, `conversacion_etiquetas:${conversacionId}`);
      const puesta = await tx.conversationLabel.findFirst({
        where: { tenantId, conversacionId, etiquetaId },
        select: { etiquetaId: true },
      });
      let cambio = false;
      if (!puesta) {
        const cuantas = await tx.conversationLabel.count({ where: { tenantId, conversacionId } });
        if (cuantas >= MAX_ETIQUETAS_POR_CONVERSACION) {
          throw new TopeDeEtiquetasDeLaConversacionError(MAX_ETIQUETAS_POR_CONVERSACION);
        }
        const r = await tx.conversationLabel.createMany({
          data: [
            { tenantId, conversacionId, etiquetaId, asignadaPorId: actorId, asignadaEn: ahora },
          ],
          skipDuplicates: true,
        });
        cambio = r.count === 1;
      }
      if (cambio) await this.avisarDelCambio(tx, tenantId, conversacionId);
      return {
        resultado: 'OK',
        resumen: await this.resumen(tx, tenantId, conversacionId, ahora),
        cambio,
      };
    });
  }

  quitar(
    v: Visibilidad,
    conversacionId: string,
    etiquetaId: string,
    ahora: Date,
  ): Promise<ResultadoDeEtiquetar> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const existe = await this.existen(tx, tenantId, v, conversacionId, etiquetaId);
      if (existe) return existe;

      const r = await tx.conversationLabel.deleteMany({
        where: { tenantId, conversacionId, etiquetaId },
      });
      const cambio = r.count > 0;
      if (cambio) await this.avisarDelCambio(tx, tenantId, conversacionId);
      return {
        resultado: 'OK',
        resumen: await this.resumen(tx, tenantId, conversacionId, ahora),
        cambio,
      };
    });
  }

  /**
   * La conversación primero (visible para quien actúa) y luego la etiqueta (de esta agencia): con
   * una conversación ajena la respuesta no depende de la etiqueta. `null` si ambas existen.
   */
  private async existen(
    tx: ClienteTenant,
    tenantId: string,
    v: Visibilidad,
    conversacionId: string,
    etiquetaId: string,
  ): Promise<ResultadoDeEtiquetar | null> {
    const conv = await tx.conversacion.findFirst({
      where: unaConversacion(tenantId, v, conversacionId),
      select: { id: true },
    });
    if (!conv) return { resultado: 'CONVERSACION_NO_ENCONTRADA' };
    const etiqueta = await tx.label.findFirst({
      where: { id: etiquetaId, tenantId },
      select: { id: true },
    });
    if (!etiqueta) return { resultado: 'ETIQUETA_NO_ENCONTRADA' };
    return null;
  }

  /** El evento de la conversación actualizada, en la misma transacción: solo ids, ningún nombre. */
  private avisarDelCambio(tx: ClienteTenant, tenantId: string, conversacionId: string) {
    return escribirEvento(tx, {
      tenantId,
      agregado: 'conversacion',
      agregadoId: conversacionId,
      tipo: TIPO_CONVERSACION_ACTUALIZADA,
      payload: {},
    });
  }

  /** La fila de la bandeja tras la acción (la conversación ya se comprobó visible en esta transacción). */
  private async resumen(
    tx: ClienteTenant,
    tenantId: string,
    id: string,
    ahora: Date,
  ): Promise<ConversacionResumen> {
    const fila = await tx.conversacion.findFirstOrThrow({
      where: { id, tenantId },
      select: PARA_EL_RESUMEN,
    });
    const registro = new RegistroDeLectura();
    const resumen = aResumen(fila, ahora, this.cifrado, tenantId, registro);
    await registro.registrar(tx, 'Conversacion', id);
    return resumen;
  }
}
