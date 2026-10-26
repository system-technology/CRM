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
import { Inject, Injectable } from '@nestjs/common';
import { PuertoContactos } from '../../../shared/puertos/puertos-hacia-crm.js';
import { PrismaWebhookService } from '../../../shared/prisma/prisma-webhook.service.js';
import {
  PuertoBandeja,
  type ResultadoDeBandeja,
  type ResultadoDeEstado,
} from '../application/puertos-de-proceso.js';
import type {
  CambioDeEstado,
  EstadoMensaje,
  MensajeEntrante,
} from '../domain/contenido-del-cambio.js';
import { errorDeMeta } from '../domain/errores-de-envio.js';
import { estadoTrasReporte } from '../domain/estado-de-entrega.js';
import { TIPO_MENSAJE_ACTUALIZADO } from '../domain/evento-de-dominio.js';

/** Un `failed` de webhook no trae estado HTTP: se clasifica como un 4xx (definitivo). */
const HTTP_DE_UN_ESTADO_FALLIDO = 400;

@Injectable()
export class BandejaPrisma extends PuertoBandeja {
  constructor(
    @Inject(PrismaWebhookService) private readonly prisma: PrismaWebhookService,
    @Inject(PuertoContactos) private readonly contactos: PuertoContactos,
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

      const insertados = await tx.mensaje.createMany({
        data: [
          {
            tenantId,
            conversacionId: conversacion.id,
            direccion: 'ENTRANTE',
            tipo: m.tipo,
            estado: 'ENTREGADO',
            texto: m.texto,
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
        await tx.adjunto.create({
          data: {
            tenantId,
            mensajeId: mensaje.id,
            tipo: m.tipo,
            mediaIdMeta: m.medioId,
            nombreArchivo: m.nombreArchivo,
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
                ultimoMensajeTexto: (m.texto ?? `[${m.tipo}]`).slice(0, 200),
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

  /**
   * Un acuse de estado de Meta sobre un mensaje NUESTRO. ADR-0018 §4.
   *
   * Se busca por `wamid` y, si todavía no lo conocemos, por la referencia que el envío puso en
   * `biz_opaque_callback_data` (nuestro id). `FOR UPDATE`: dos acuses del mismo mensaje procesados
   * a la vez (`sent` y `delivered`) se serializan, y la máquina de estados decide sobre lo último
   * escrito y no sobre una lectura vieja. El cambio y su evento van en la misma transacción.
   */
  async aplicarEstado(tenantId: string, c: CambioDeEstado): Promise<ResultadoDeEstado> {
    return this.prisma.conTenantResuelto(tenantId, async (tx): Promise<ResultadoDeEstado> => {
      const [fila] = await tx.$queryRaw<
        Array<{ id: string; conversacion_id: string; estado: EstadoMensaje; wamid: string | null }>
      >`
        SELECT id::text AS id, conversacion_id::text AS conversacion_id, estado::text AS estado, wamid
          FROM mensajes
         WHERE tenant_id = ${tenantId}::uuid
           AND direccion = 'SALIENTE'
           AND eliminado_en IS NULL
           AND (wamid = ${c.wamid} OR (wamid IS NULL AND id = ${c.referencia}::uuid))
         ORDER BY (wamid IS NULL)
         LIMIT 1
           FOR UPDATE`;
      if (!fila) return 'DESCONOCIDO';

      const wamidConocido = fila.wamid !== null;
      const nuevo = estadoTrasReporte(fila.estado, c.estado, wamidConocido);
      if (nuevo === null && wamidConocido) return 'SIN_CAMBIO';

      const estado = nuevo ?? fila.estado;
      const fallo =
        estado === 'FALLIDO' ? errorDeMeta(c.codigoError, HTTP_DE_UN_ESTADO_FALLIDO) : null;
      await tx.mensaje.update({
        where: { id: fila.id },
        data: {
          estado,
          wamid: c.wamid,
          // Si Meta corrige un «sin confirmar» nuestro, el motivo viejo deja de ser verdad.
          codigoErrorMeta: fallo ? c.codigoError : null,
          motivoFallo: fallo ? fallo.message.slice(0, 500) : null,
        },
      });
      await tx.outbox.create({
        data: {
          tenantId,
          agregado: 'mensaje',
          agregadoId: fila.id,
          tipoEvento: TIPO_MENSAJE_ACTUALIZADO,
          payload: { conversacionId: fila.conversacion_id },
        },
      });
      return 'APLICADO';
    });
  }
}
