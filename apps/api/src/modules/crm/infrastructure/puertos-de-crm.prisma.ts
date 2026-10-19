/**
 * Las implementaciones, dentro de `crm`, de los puertos que otros contextos le piden.
 *
 * Sin estado y sin `PrismaService`: usan la transacción que les pasa el llamador, que ya lleva el
 * tenant fijado. Ver `shared/puertos/puertos-hacia-crm.ts`.
 */
import { Injectable } from '@nestjs/common';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import {
  type EntradaDeContacto,
  PuertoContactos,
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
