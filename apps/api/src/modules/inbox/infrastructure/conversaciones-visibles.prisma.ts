/**
 * Lo que `inbox` ofrece a `crm`: resolver una conversación visible para quien pide. Ver
 * `shared/puertos/puertos-hacia-inbox.ts`.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  filtroDeVisibilidad,
  visibilidadDe,
} from '../../../shared/autorizacion/visibilidad-de-conversaciones.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import {
  type ConversacionParaCrm,
  PuertoConversacionesVisibles,
} from '../../../shared/puertos/puertos-hacia-inbox.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';

@Injectable()
export class ConversacionesVisiblesDeInbox extends PuertoConversacionesVisibles {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async resolver(conversacionId: string): Promise<ConversacionParaCrm | null> {
    const contexto = ContextoTenant.obtener();
    return this.prisma.conTenant((tx) =>
      tx.conversacion.findFirst({
        where: {
          id: conversacionId,
          tenantId: contexto.tenantId,
          eliminadoEn: null,
          ...filtroDeVisibilidad(visibilidadDe(contexto)),
        },
        select: { id: true, contactoId: true, asignadoAId: true },
      }),
    );
  }
}
