/**
 * Lee un mensaje para armar el evento del socket, con el pool de la API y bajo RLS.
 *
 * El tenant es el del EVENTO, fijado con el mismo mecanismo que cualquier petición
 * (`conTenant`), y va además en el predicado: un mensaje de otra agencia no existe aquí.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Mensaje } from '@viajapro/contracts';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { PuertoLecturaDeMensajes } from '../application/puertos-de-eventos.js';

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
            select: {
              id: true,
              conversacionId: true,
              direccion: true,
              tipo: true,
              texto: true,
              estado: true,
              motivoFallo: true,
              autorId: true,
              cotizacionId: true,
              ocurridoEn: true,
              autor: { select: { nombre: true } },
            },
          }),
        ),
    );
    if (!fila) return null;

    return Mensaje.parse({
      id: fila.id,
      conversacionId: fila.conversacionId,
      direccion: fila.direccion,
      tipo: fila.tipo,
      texto: fila.texto,
      // El contrato exige la URL propia y firmada de un adjunto YA descargado. Hasta que exista la
      // descarga a S3, el evento no lleva adjuntos: el hilo los trae al abrirse.
      adjuntos: [],
      estado: fila.estado,
      motivoFallo: fila.motivoFallo,
      autorId: fila.autorId,
      autorNombre: fila.autor?.nombre ?? null,
      ocurridoEn: fila.ocurridoEn.toISOString(),
      cotizacionId: fila.cotizacionId,
    });
  }
}
