/**
 * Adaptador de la bandeja: crea contacto, conversación y mensaje bajo el tenant resuelto.
 *
 * Todo en UNA transacción con el tenant fijado, así que corre bajo RLS: un error de ruteo no
 * puede escribir en otra agencia, falla por `WITH CHECK`.
 *
 * La idempotencia es `UNIQUE (tenant_id, wamid)` con `ON CONFLICT DO NOTHING`
 * (`createMany({ skipDuplicates })`): insertar y capturar el error de unicidad abortaría la
 * transacción entera en PostgreSQL.
 */
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  COLUMNAS_CIFRADAS,
  PuertoCifradoDeCampos,
} from '../../../shared/cifrado/puerto-de-cifrado.js';
import {
  columnasDeNombreDeArchivo,
  columnasDeTexto,
  columnasDeUltimoMensaje,
} from '../../../shared/cifrado/columnas-de-prisma.js';
import { PuertoContactos } from '../../../shared/puertos/puertos-hacia-crm.js';
import { PrismaWebhookService } from '../../../shared/prisma/prisma-webhook.service.js';
import { PuertoBandeja, type ResultadoDeBandeja } from '../application/puertos-de-proceso.js';
import type { MensajeEntrante } from '../domain/contenido-del-cambio.js';

@Injectable()
export class BandejaPrisma extends PuertoBandeja {
  constructor(
    @Inject(PrismaWebhookService) private readonly prisma: PrismaWebhookService,
    @Inject(PuertoContactos) private readonly contactos: PuertoContactos,
    @Inject(PuertoCifradoDeCampos) private readonly cifrado: PuertoCifradoDeCampos,
  ) {
    super();
  }

  async registrarEntrante(
    tenantId: string,
    canalId: string,
    m: MensajeEntrante,
  ): Promise<ResultadoDeBandeja> {
    return this.prisma.conTenantResuelto(tenantId, async (tx): Promise<ResultadoDeBandeja> => {
      // La verdad manda sobre el directorio, que es derivado: un canal revocado no recibe.
      // FOR SHARE: una revocación concurrente (UPDATE) espera a que esta transacción termine, o
      // esta espera a que ella confirme. Sin el bloqueo, el mensaje podía colarse tras la baja.
      const [canal] = await tx.$queryRaw<Array<{ estado: string; eliminado_en: Date | null }>>`
        SELECT estado::text AS estado, eliminado_en FROM canales WHERE id = ${canalId}::uuid FOR SHARE`;
      if (!canal || canal.estado === 'REVOCADO' || canal.eliminado_en !== null) {
        return 'CANAL_REVOCADO';
      }

      // El contacto es de `crm`: se pide por su puerto, en ESTA transacción y bajo la misma RLS.
      const contacto = await this.contactos.asegurarContacto(tx, {
        tenantId,
        telefonoE164: m.deTelefono,
        nombrePerfil: m.nombrePerfil,
      });

      const conversacion = await tx.conversacion.upsert({
        where: {
          tenantId_canalId_contactoId: { tenantId, canalId, contactoId: contacto.id },
        },
        update: {},
        create: { tenantId, canalId, contactoId: contacto.id },
        select: { id: true, ultimoMensajeClienteEn: true, ultimoMensajeEn: true },
      });

      // El id se genera ANTES del INSERT: va en el AAD del texto cifrado (ADR-0015, concreción 3).
      const mensajeId = randomUUID();
      const insertados = await tx.mensaje.createMany({
        data: [
          {
            id: mensajeId,
            tenantId,
            conversacionId: conversacion.id,
            direccion: 'ENTRANTE',
            tipo: m.tipo,
            estado: 'ENTREGADO',
            ...(m.texto === null
              ? {}
              : columnasDeTexto(
                  this.cifrado.cifrar(
                    COLUMNAS_CIFRADAS.MENSAJES_TEXTO,
                    tenantId,
                    mensajeId,
                    m.texto,
                  ),
                )),
            wamid: m.wamid,
            ocurridoEn: m.instante,
          },
        ],
        skipDuplicates: true,
      });
      if (insertados.count === 0) return 'DUPLICADO';

      const mensaje = await tx.mensaje.findFirstOrThrow({
        where: { wamid: m.wamid },
        select: { id: true },
      });

      if (m.medioId) {
        const adjuntoId = randomUUID();
        await tx.adjunto.create({
          data: {
            id: adjuntoId,
            tenantId,
            mensajeId: mensaje.id,
            tipo: m.tipo,
            mediaIdMeta: m.medioId,
            ...(m.nombreArchivo === null
              ? {}
              : columnasDeNombreDeArchivo(
                  this.cifrado.cifrar(
                    COLUMNAS_CIFRADAS.ADJUNTOS_NOMBRE_ARCHIVO,
                    tenantId,
                    adjuntoId,
                    // Tope de la columna antes de cifrar (ADR-0015): lo elige el viajero.
                    m.nombreArchivo.slice(0, 255),
                  ),
                )),
            mimeType: m.mimeType,
          },
        });
      }

      // Los mensajes llegan DESORDENADOS: los campos denormalizados solo avanzan, nunca
      // retroceden por un reintento de hace horas.
      const esMasReciente =
        !conversacion.ultimoMensajeEn || m.instante > conversacion.ultimoMensajeEn;
      const ventana =
        !conversacion.ultimoMensajeClienteEn || m.instante > conversacion.ultimoMensajeClienteEn
          ? m.instante
          : conversacion.ultimoMensajeClienteEn;
      await tx.conversacion.update({
        where: { id: conversacion.id },
        data: {
          estado: 'ABIERTA',
          mensajesSinLeer: { increment: 1 },
          ultimoMensajeClienteEn: ventana,
          ...(esMasReciente
            ? {
                ultimoMensajeEn: m.instante,
                ultimoMensajeDireccion: 'ENTRANTE' as const,
                ...columnasDeUltimoMensaje(
                  this.cifrado.cifrar(
                    COLUMNAS_CIFRADAS.CONVERSACIONES_ULTIMO_MENSAJE_TEXTO,
                    tenantId,
                    conversacion.id,
                    (m.texto ?? `[${m.tipo}]`).slice(0, 200),
                  ),
                ),
              }
            : {}),
        },
      });

      // Mismo cambio de estado, misma transacción (outbox). Solo identificadores: ni el
      // teléfono ni el texto viajan en el evento.
      await tx.outbox.create({
        data: {
          tenantId,
          agregado: 'mensaje',
          agregadoId: mensaje.id,
          tipoEvento: 'inbox.mensaje_recibido',
          payload: { conversacionId: conversacion.id, canalId },
        },
      });

      return 'CREADO';
    });
  }
}
