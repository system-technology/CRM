/**
 * Acceso a PostgreSQL con aislamiento de tenant forzado.
 *
 * Toda consulta de negocio pasa por `conTenant()`, que abre una transacción y fija
 * `app.current_tenant` antes de ejecutar nada. Las políticas RLS hacen el resto.
 *
 * Dos detalles que parecen menores y no lo son:
 *
 *   · **`SET LOCAL`, no `SET`.** El valor debe morir con la transacción. Con `SET` a secas
 *     sobrevive en la conexión y contamina la siguiente petición que la tome del pool: el
 *     tenant B vería datos del tenant A, de forma intermitente e imposible de reproducir.
 *     Con un agrupador en modo transacción (Neon, PgBouncer) esto es aún más crítico.
 *
 *   · **`set_config(..., true)` con parámetro vinculado**, no interpolación de cadena.
 *     `SET LOCAL` no admite parámetros, así que la alternativa sería concatenar el UUID en
 *     el SQL. Aunque venga de un token firmado, concatenar identificadores en SQL es una
 *     costumbre que acaba mal el día que el valor venga de otro sitio.
 */

import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ContextoTenant } from '../tenant/contexto-tenant.js';

/** Lo que recibe un caso de uso: un cliente ya atado a la transacción con tenant fijado. */
export type ClienteTenant = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PrismaService.name);

  constructor() {
    super({
      datasources: {
        // La aplicación se conecta con viajapro_app, que NO puede saltarse RLS.
        // Si esta variable apuntara al rol propietario, el aislamiento sería ficticio
        // y no habría ningún error que lo delatara. Regla R2, ADR-0003 y ADR-0007.
        db: { url: process.env['DATABASE_APP_URL'] ?? process.env['DATABASE_URL'] ?? '' },
      },
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();

    // Si la aplicación arrancara con un rol capaz de saltarse RLS, todo "funcionaría"
    // y el aislamiento sería mentira. Mejor no arrancar.
    const [rol] = await this.$queryRaw<Array<{ usuario: string; bypassa: boolean }>>`
      SELECT current_user AS usuario,
             (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypassa
    `;

    if (!rol) throw new Error('No se pudo determinar el rol de conexión.');
    if (rol.bypassa) {
      throw new Error(
        `La aplicación se conectó como '${rol.usuario}', que tiene BYPASSRLS. ` +
          'El aislamiento entre agencias sería ficticio. Revisa DATABASE_APP_URL y ejecuta ' +
          'pnpm --filter @viajapro/database run rol:crear. Ver ADR-0007.',
      );
    }

    this.log.log(`Conectado como '${rol.usuario}' (sin BYPASSRLS).`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Ejecuta `fn` dentro de una transacción con el tenant del contexto fijado.
   *
   * El `tenantId` se toma del contexto de la petición, nunca de un argumento: un parámetro
   * es algo que alguien puede pasar mal.
   */
  async conTenant<T>(fn: (tx: ClienteTenant) => Promise<T>): Promise<T> {
    const { tenantId } = ContextoTenant.obtener();

    return this.$transaction(async (tx) => {
      // El tercer argumento `true` es `is_local`: el valor vive solo en esta transacción.
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}::text, true)`;
      return fn(tx);
    });
  }

  /**
   * Para operaciones de plataforma que NO pertenecen a ningún tenant: alta de agencias,
   * catálogos globales, administración.
   *
   * Es deliberadamente incómodo de nombrar. Cada uso debería llamar la atención en una
   * revisión: si aparece dentro de un módulo de negocio, es un defecto.
   */
  async sinTenantPorqueEsPlataforma<T>(
    motivo: string,
    fn: (tx: ClienteTenant) => Promise<T>,
  ): Promise<T> {
    this.log.warn(`Acceso sin contexto de tenant: ${motivo}`);
    return this.$transaction((tx) => fn(tx));
  }
}
