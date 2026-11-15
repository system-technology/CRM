/**
 * Las implementaciones, dentro de `crm`, de los puertos que otros contextos le piden.
 *
 * Sin estado y sin `PrismaService`: usan la transacción que les pasa el llamador, que ya lleva el
 * tenant fijado. Ver `shared/puertos/puertos-hacia-crm.ts`. Las notas cifran y descifran su texto
 * aquí (ADR-0015): quien pide una nota por el puerto la recibe en claro y nunca ve bytes cifrados.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  campoDeTextoObligatorio,
  columnasDeTexto,
  SELECCION_DE_TEXTO,
} from '../../../shared/cifrado/columnas-de-prisma.js';
import {
  COLUMNAS_CIFRADAS,
  PuertoCifradoDeCampos,
} from '../../../shared/cifrado/puerto-de-cifrado.js';
import { uuidV7 } from '../../../shared/cifrado/uuid-v7.js';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import {
  type DefinicionDeCampoLeida,
  type EntradaDeContacto,
  type NotaDeConversacionLeida,
  PuertoContactos,
  PuertoDefinicionesDeCampo,
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
      // Id de la aplicación: `preferencias` se cifra con el id del contacto en el AAD (ADR-0015).
      create: {
        id: uuidV7(),
        tenantId: e.tenantId,
        telefonoE164: e.telefonoE164,
        nombre: e.nombrePerfil,
      },
      select: { id: true },
    });
  }
}

@Injectable()
export class DefinicionesDeCampoDeCrm extends PuertoDefinicionesDeCampo {
  async deLosPaquetes(
    tx: ClienteTenant,
    tenantId: string,
    claves?: readonly string[],
  ): Promise<DefinicionDeCampoLeida[]> {
    const filas = await tx.definicionCampoPersonalizado.findMany({
      where: { tenantId, entidad: 'PAQUETE', ...(claves ? { clave: { in: [...claves] } } : {}) },
      orderBy: [{ orden: 'asc' }, { clave: 'asc' }],
    });
    return filas.map((d) => ({
      clave: d.clave,
      etiqueta: d.etiqueta,
      tipo: d.tipo,
      obligatorio: d.obligatorio,
      orden: d.orden,
      opciones: Array.isArray(d.opciones)
        ? d.opciones.filter((o): o is string => typeof o === 'string')
        : [],
    }));
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
    // El id va en el AAD del texto cifrado: se genera antes del INSERT (ADR-0015, concreción 3).
    const id = uuidV7();
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
      select: {
        id: true,
        autorId: true,
        escritaEn: true,
        ...SELECCION_DE_TEXTO,
        autor: { select: { nombre: true } },
      },
    });
    return filas.flatMap((n) =>
      n.autorId === null
        ? []
        : [
            {
              id: n.id,
              texto: this.cifrado.descifrarObligatorio(
                COLUMNAS_CIFRADAS.NOTAS_INTERNAS_TEXTO,
                tenantId,
                n.id,
                campoDeTextoObligatorio(n),
              ),
              autorId: n.autorId,
              autorNombre: n.autor?.nombre ?? '',
              creadaEn: n.escritaEn,
            },
          ],
    );
  }
}
