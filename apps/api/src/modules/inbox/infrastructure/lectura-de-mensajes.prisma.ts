/**
 * Lee un mensaje para armar el evento del socket, con el pool de la API y bajo RLS.
 *
 * El tenant es el del EVENTO, fijado con el mismo mecanismo que cualquier petición
 * (`conTenant`), y va además en el predicado: un mensaje de otra agencia no existe aquí.
 *
 * **Sin visibilidad a propósito:** esto arma el evento para varios destinatarios, y quién lo recibe
 * se decide después con `quienesVen`. Nunca se le devuelve a una persona.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Mensaje } from '@viajapro/contracts';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { PuertoLecturaDeMensajes } from '../application/puertos-de-eventos.js';
import { aMensaje, PARA_EL_MENSAJE } from './mapeo.js';

@Injectable()
export class LecturaDeMensajesPrisma extends PuertoLecturaDeMensajes {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async mensajePorId(tenantId: string, mensajeId: string): Promise<Mensaje | null> {
    const fila = await ContextoTenant.ejecutarCon(
      { tenantId, usuarioId: null, identidadId: null, permisos: new Set(), trazaId: 'tiempo-real' },
      () =>
        this.prisma.conTenant((tx) =>
          tx.mensaje.findFirst({
            where: { id: mensajeId, tenantId, eliminadoEn: null },
            select: PARA_EL_MENSAJE,
          }),
        ),
    );
    return fila ? aMensaje(fila) : null;
  }
}
