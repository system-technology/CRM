/**
 * Lee el estado del canal con el pool de la API y SIEMPRE bajo RLS (R1, R2).
 *
 * Fuente: `canales`, `cuentas_whatsapp` (la verdad, bajo RLS) y `mensajes`. No lee el directorio
 * de enrutamiento: es global, el rol de la aplicación no debe consultarlo y es una proyección
 * derivada de estas mismas tablas.
 *
 * R6: el `select` de la cuenta NO incluye las columnas de token; no hay forma de que lleguen aquí.
 * R10: de los mensajes solo se leen instantes, estado, motivo traducido y código; nunca `texto`.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { CanalWhatsappEstado } from '@viajapro/contracts';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { PuertoEstadoDelCanal } from '../application/puerto-estado-del-canal.js';
import { estaConectado } from '../domain/estado-del-canal.js';

@Injectable()
export class EstadoDelCanalPrisma extends PuertoEstadoDelCanal {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async canalesDeLaAgencia(): Promise<CanalWhatsappEstado[]> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const canales = await tx.canal.findMany({
        where: { tenantId, eliminadoEn: null },
        orderBy: [{ creadoEn: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          numeroE164: true,
          nombreVisible: true,
          estado: true,
          creadoEn: true,
          cuenta: { select: { estado: true } },
        },
      });

      const resultado: CanalWhatsappEstado[] = [];
      for (const c of canales) {
        const enEsteCanal = { tenantId, eliminadoEn: null, conversacion: { canalId: c.id } };
        const ultimaRecepcion = await tx.mensaje.findFirst({
          where: { ...enEsteCanal, direccion: 'ENTRANTE' },
          orderBy: [{ ocurridoEn: 'desc' }, { id: 'desc' }],
          select: { ocurridoEn: true },
        });
        const ultimoFallo = await tx.mensaje.findFirst({
          where: { ...enEsteCanal, direccion: 'SALIENTE', estado: 'FALLIDO' },
          orderBy: [{ ocurridoEn: 'desc' }, { id: 'desc' }],
          select: { ocurridoEn: true, motivoFallo: true, codigoErrorMeta: true },
        });
        resultado.push({
          id: c.id,
          numeroE164: c.numeroE164,
          nombreVisible: c.nombreVisible,
          estado: c.estado,
          estadoCuenta: c.cuenta.estado,
          conectado: estaConectado(c.estado, c.cuenta.estado),
          conectadoDesde: c.creadoEn.toISOString(),
          ultimaRecepcionEn: ultimaRecepcion?.ocurridoEn.toISOString() ?? null,
          ultimoEnvioFallido: ultimoFallo
            ? {
                ocurridoEn: ultimoFallo.ocurridoEn.toISOString(),
                motivo: ultimoFallo.motivoFallo,
                codigoErrorMeta: ultimoFallo.codigoErrorMeta,
              }
            : null,
        });
      }
      return resultado;
    });
  }
}
