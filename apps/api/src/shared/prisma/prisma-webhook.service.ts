/**
 * Conexión del trabajador del webhook: rol `viajapro_webhook`, y solo ése.
 *
 * Mismo criterio que `PrismaService` para la API: **cada proceso aborta al arrancar si no es el
 * rol que esperaba ser**. Los tres roles de login tienen los mismos privilegios sobre las tablas
 * y se distinguen en qué funciones `SECURITY DEFINER` ejecutan; conectar el trabajador con otro
 * no rompería nada visible. R2, ADR-0008 §1.3.
 *
 * No hay respaldo a otra cadena, ni a `DATABASE_URL`: ver `resolverCadena`.
 */
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { resolverCadena, verificarIdentidad } from './guardia-de-rol.js';
import type { ClienteTenant } from './prisma.service.js';

@Injectable()
export class PrismaWebhookService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PrismaWebhookService.name);

  constructor() {
    super({
      datasources: { db: { url: resolverCadena(process.env, 'DATABASE_WEBHOOK_URL') } },
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    const [rol] = await this.$queryRaw<
      Array<{ usuario: string; superusuario: boolean; saltaRls: boolean }>
    >`
      SELECT current_user AS usuario,
             COALESCE((SELECT rolsuper     FROM pg_roles WHERE rolname = current_user), false) AS "superusuario",
             COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user), false) AS "saltaRls"
    `;
    if (!rol) throw new Error('No se pudo determinar el rol de conexión.');
    const motivo = verificarIdentidad(
      { usuario: rol.usuario, esSuperusuario: rol.superusuario, saltaRls: rol.saltaRls },
      'viajapro_webhook',
    );
    if (motivo) throw new Error(motivo);
    this.log.log(`Conectado como '${rol.usuario}', verificado contra 'viajapro_webhook'.`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Transacción bajo el tenant que el DIRECTORIO resolvió para este change.
   *
   * El trabajador no tiene `ContextoTenant` (no hay petición), así que el tenant llega como
   * argumento, y por eso se hace la afirmación de defensa en profundidad del ADR-0008 §4 paso 2:
   * antes de que `fn` escriba, se lee de vuelta lo que quedó en la sesión y se compara.
   */
  async conTenantResuelto<T>(tenantId: string, fn: (tx: ClienteTenant) => Promise<T>): Promise<T> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new Error('El tenant resuelto no es un UUID: no se fija nada.');
    }
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}::text, true)`;
      const [fijado] = await tx.$queryRaw<Array<{ t: string | null }>>`
        SELECT current_setting('app.current_tenant', true) AS t`;
      if (fijado?.t !== tenantId) {
        throw new Error('El tenant fijado en la sesión no es el resuelto: se aborta la escritura.');
      }
      return fn(tx);
    });
  }
}
