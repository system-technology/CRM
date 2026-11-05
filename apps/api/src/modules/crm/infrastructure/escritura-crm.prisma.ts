/**
 * Adaptador de escritura de contactos y oportunidades (T-075). Todo pasa por `conTenant()` y
 * lleva `tenantId` explícito además de RLS (defensa en profundidad, R1).
 *
 * R10: `preferencias` se escribe como columna, pero NO viaja a `registros_auditoria.detalle`; ver
 * el comentario del esquema.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Consentimiento, Contacto, Oportunidad } from '@viajapro/contracts';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { PuertoExistenciaDePaquete } from '../../../shared/puertos/puertos-hacia-quoting.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { EtapaNoEncontradaError, TelefonoYaRegistradoError } from '../domain/errors.js';
import {
  type CambiosDeContacto,
  type NuevaOportunidad,
  type NuevoConsentimiento,
  type NuevoContacto,
  PuertoEscrituraCrm,
} from '../application/puerto-escritura-crm.js';
import { PARA_LA_TARJETA, aContacto, aOportunidad } from './crm.prisma.js';
import { registrarCambioDeEtapa } from './historial-de-etapas.prisma.js';

function esViolacionDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class EscrituraCrmPrisma extends PuertoEscrituraCrm {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PuertoExistenciaDePaquete) private readonly paquetes: PuertoExistenciaDePaquete,
  ) {
    super();
  }

  async crearContacto(d: NuevoContacto): Promise<Contacto> {
    const { tenantId } = ContextoTenant.obtener();
    try {
      return await this.prisma.conTenant(async (tx) => {
        const c = await tx.contacto.create({
          data: {
            tenantId,
            telefonoE164: d.telefonoE164,
            nombre: d.nombre,
            correo: d.correo,
            etiquetas: d.etiquetas,
            preferencias: d.preferencias,
            creadoPorId: d.creadoPorId,
            actualizadoPorId: d.creadoPorId,
          },
          include: { consentimientos: true },
        });
        return aContacto(c);
      });
    } catch (error) {
      if (esViolacionDeUnicidad(error)) throw new TelefonoYaRegistradoError(d.telefonoE164);
      throw error;
    }
  }

  async editarContacto(
    contactoId: string,
    cambios: CambiosDeContacto,
    actorId: string | null,
  ): Promise<Contacto | null> {
    const { tenantId } = ContextoTenant.obtener();
    try {
      return await this.prisma.conTenant(async (tx) => {
        const existente = await tx.contacto.findFirst({
          where: { id: contactoId, tenantId, eliminadoEn: null },
          select: { id: true },
        });
        if (!existente) return null;
        const c = await tx.contacto.update({
          where: { id_tenantId: { id: contactoId, tenantId } },
          data: {
            ...(cambios.telefonoE164 !== undefined ? { telefonoE164: cambios.telefonoE164 } : {}),
            ...(cambios.nombre !== undefined ? { nombre: cambios.nombre } : {}),
            ...(cambios.correo !== undefined ? { correo: cambios.correo } : {}),
            ...(cambios.etiquetas !== undefined ? { etiquetas: cambios.etiquetas } : {}),
            ...(cambios.preferencias !== undefined ? { preferencias: cambios.preferencias } : {}),
            actualizadoPorId: actorId,
          },
          include: { consentimientos: true },
        });
        return aContacto(c);
      });
    } catch (error) {
      if (esViolacionDeUnicidad(error) && cambios.telefonoE164 !== undefined) {
        throw new TelefonoYaRegistradoError(cambios.telefonoE164);
      }
      throw error;
    }
  }

  async otorgarConsentimiento(
    contactoId: string,
    d: NuevoConsentimiento,
  ): Promise<Contacto | null> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const existente = await tx.contacto.findFirst({
        where: { id: contactoId, tenantId, eliminadoEn: null },
        select: { id: true },
      });
      if (!existente) return null;
      // Índice único parcial (tenant, contacto, finalidad) WHERE revocado_en IS NULL: la
      // comprobación previa evita el error en el caso normal; la carrera la resuelve el índice.
      const vigente = await tx.consentimientoContacto.findFirst({
        where: { tenantId, contactoId, finalidad: d.finalidad, revocadoEn: null },
        select: { id: true },
      });
      if (!vigente) {
        await tx.consentimientoContacto.create({
          data: {
            tenantId,
            contactoId,
            finalidad: d.finalidad,
            canal: d.canal,
            prueba: d.prueba,
            textoMostrado: d.textoMostrado,
            versionAviso: d.versionAviso,
            registradoPorId: d.registradoPorId,
          },
        });
      }
      return this.contactoConConsentimientos(tx, tenantId, contactoId);
    });
  }

  async revocarConsentimiento(
    contactoId: string,
    finalidad: Consentimiento,
  ): Promise<Contacto | null> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const existente = await tx.contacto.findFirst({
        where: { id: contactoId, tenantId, eliminadoEn: null },
        select: { id: true },
      });
      if (!existente) return null;
      await tx.consentimientoContacto.updateMany({
        where: { tenantId, contactoId, finalidad, revocadoEn: null },
        data: { revocadoEn: new Date() },
      });
      return this.contactoConConsentimientos(tx, tenantId, contactoId);
    });
  }

  private async contactoConConsentimientos(
    tx: Prisma.TransactionClient,
    tenantId: string,
    contactoId: string,
  ): Promise<Contacto> {
    const c = await tx.contacto.findFirstOrThrow({
      where: { id: contactoId, tenantId },
      include: { consentimientos: true },
    });
    return aContacto(c);
  }

  async existeContacto(contactoId: string): Promise<boolean> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const c = await tx.contacto.findFirst({
        where: { id: contactoId, tenantId, eliminadoEn: null },
        select: { id: true },
      });
      return c !== null;
    });
  }

  async existeAsesor(usuarioId: string): Promise<boolean> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const u = await tx.usuario.findFirst({
        where: { id: usuarioId, tenantId, activo: true, eliminadoEn: null },
        select: { id: true },
      });
      return u !== null;
    });
  }

  async existePaquete(paqueteId: string): Promise<boolean> {
    const { tenantId } = ContextoTenant.obtener();
    // R4: el catálogo es de `quoting`; se pregunta por su puerto, en la misma transacción.
    return this.prisma.conTenant((tx) => this.paquetes.existePaquete(tx, tenantId, paqueteId));
  }

  async etapaInicial(): Promise<{ id: string } | null> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const lead = await tx.etapaPipeline.findFirst({
        where: { tenantId, clave: 'NUEVO_LEAD' },
        select: { id: true },
      });
      if (lead) return lead;
      return tx.etapaPipeline.findFirst({
        where: { tenantId, esGanada: false, esPerdida: false },
        orderBy: { orden: 'asc' },
        select: { id: true },
      });
    });
  }

  /**
   * El alta y su primera fila del historial de etapas (`ALTA`, T-131), en la misma transacción:
   * sin ella, el embudo temporal no sabría cuándo entró la oportunidad en su primera etapa. Las
   * banderas se leen de la etapa dentro de la transacción. Si la etapa fuera terminal (hoy no lo
   * es: `etapaInicial` elige una viva), `cerrada_en` nace con el instante del historial.
   */
  async crearOportunidad(d: NuevaOportunidad): Promise<Oportunidad> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const etapa = await tx.etapaPipeline.findFirst({
        where: { id: d.etapaId, tenantId },
        select: { esGanada: true, esPerdida: true },
      });
      if (!etapa) throw new EtapaNoEncontradaError(d.etapaId);

      const o = await tx.oportunidad.create({
        data: {
          tenantId,
          contactoId: d.contactoId,
          etapaId: d.etapaId,
          titulo: d.titulo,
          destino: d.destino,
          paqueteId: d.paqueteId,
          fechaViajeDesde: d.fechaSalida ? new Date(`${d.fechaSalida}T00:00:00.000Z`) : null,
          valorEstimadoUnidades: d.valorEstimado ? BigInt(d.valorEstimado.unidades) : null,
          monedaIso: d.valorEstimado ? d.valorEstimado.moneda : null,
          asesorId: d.asesorId,
          creadoPorId: d.creadoPorId,
          actualizadoPorId: d.creadoPorId,
        },
        select: PARA_LA_TARJETA,
      });

      const ocurridoEn = await registrarCambioDeEtapa(tx, {
        tenantId,
        oportunidadId: o.id,
        origen: 'ALTA',
        etapaDesdeId: null,
        etapaHastaId: d.etapaId,
        esGanada: etapa.esGanada,
        esPerdida: etapa.esPerdida,
        motivoPerdida: null,
        asesorId: d.asesorId,
        usuarioId: d.creadoPorId,
      });

      if (etapa.esGanada || etapa.esPerdida) {
        await tx.oportunidad.update({
          where: { id_tenantId: { id: o.id, tenantId } },
          data: { cerradaEn: ocurridoEn },
          select: { id: true },
        });
      }
      return aOportunidad(o);
    });
  }
}
