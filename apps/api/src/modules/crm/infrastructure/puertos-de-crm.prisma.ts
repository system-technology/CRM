/**
 * Las implementaciones, dentro de `crm`, de los puertos que otros contextos le piden.
 *
 * Sin estado y sin `PrismaService`: usan la transacción que les pasa el llamador, que ya lleva el
 * tenant fijado. Ver `shared/puertos/puertos-hacia-crm.ts`.
 */
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { columnasDeTexto } from '../../../shared/cifrado/columnas-de-prisma.js';
import {
  COLUMNAS_CIFRADAS,
  PuertoCifradoDeCampos,
} from '../../../shared/cifrado/puerto-de-cifrado.js';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import {
  type EntradaDeContacto,
  type NotaDeConversacionLeida,
  PuertoContactos,
  PuertoNotasDeConversacion,
  PuertoReferenciasDeCrm,
} from '../../../shared/puertos/puertos-hacia-crm.js';

@Injectable()
export class ContactosDeCrm extends PuertoContactos {
  async asegurarContacto(tx: ClienteTenant, e: EntradaDeContacto): Promise<{ id: string }> {
    return tx.contacto.upsert({
      where: { tenantId_telefonoE164: { tenantId: e.tenantId, telefonoE164: e.telefonoE164 } },
      // Vacío a propósito: un contacto que ya existe no cambia por lo que diga un perfil.
      update: {},
      create: { tenantId: e.tenantId, telefonoE164: e.telefonoE164, nombre: e.nombrePerfil },
      select: { id: true },
    });
  }
}

@Injectable()
export class ReferenciasDeCrm extends PuertoReferenciasDeCrm {
  async existeContacto(tx: ClienteTenant, tenantId: string, contactoId: string): Promise<boolean> {
    const c = await tx.contacto.findFirst({
      where: { id: contactoId, tenantId, eliminadoEn: null },
      select: { id: true },
    });
    return c !== null;
  }

  async existeOportunidadDelContacto(
    tx: ClienteTenant,
    tenantId: string,
    oportunidadId: string,
    contactoId: string,
  ): Promise<boolean> {
    const o = await tx.oportunidad.findFirst({
      where: { id: oportunidadId, contactoId, tenantId },
      select: { id: true },
    });
    return o !== null;
  }
}

@Injectable()
export class NotasDeConversacionDeCrm extends PuertoNotasDeConversacion {
  constructor(@Inject(PuertoCifradoDeCampos) private readonly cifrado: PuertoCifradoDeCampos) {
    super();
  }

  async crear(
    tx: ClienteTenant,
    e: {
      tenantId: string;
      conversacionId: string;
      contactoId: string;
      autorId: string | null;
      texto: string;
    },
  ): Promise<{ id: string; escritaEn: Date }> {
    // El id nace antes del INSERT: va en el AAD del texto cifrado (ADR-0015, concreción 3).
    const id = randomUUID();
    return tx.notaInterna.create({
      data: {
        id,
        tenantId: e.tenantId,
        contactoId: e.contactoId,
        conversacionId: e.conversacionId,
        autorId: e.autorId,
        ...columnasDeTexto(
          this.cifrado.cifrar(COLUMNAS_CIFRADAS.NOTAS_INTERNAS_TEXTO, e.tenantId, id, e.texto),
        ),
      },
      select: { id: true, escritaEn: true },
    });
  }

  async deLaConversacion(
    tx: ClienteTenant,
    tenantId: string,
    conversacionId: string,
  ): Promise<NotaDeConversacionLeida[]> {
    const filas = await tx.notaInterna.findMany({
      // El contrato exige autor: una nota de automatización (autor nulo) no cabe todavía.
      where: { tenantId, conversacionId, eliminadaEn: null, autorId: { not: null } },
      orderBy: [{ escritaEn: 'asc' }, { id: 'asc' }],
      include: { autor: { select: { nombre: true } } },
    });
    return filas.flatMap((n) =>
      n.autorId === null
        ? []
        : [
            {
              id: n.id,
              texto: this.cifrado.descifrar(
                COLUMNAS_CIFRADAS.NOTAS_INTERNAS_TEXTO,
                n.tenantId,
                n.id,
                {
                  cifrado: n.textoCifrado,
                  nonce: n.textoNonce,
                  tag: n.textoTag,
                  claveVersion: n.textoClaveVersion,
                },
              ),
              autorId: n.autorId,
              autorNombre: n.autor?.nombre ?? '',
              creadaEn: n.escritaEn,
            },
          ],
    );
  }
}
