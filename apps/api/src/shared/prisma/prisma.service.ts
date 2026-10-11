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
import { type RolDeConexion, resolverCadena, verificarIdentidad } from './guardia-de-rol.js';

/**
 * El rol con el que DEBE conectarse este proceso.
 *
 * La API general es `viajapro_app`. El trabajador del webhook y el caso de uso de alta usan
 * sus propios procesos y sus propias cadenas, y declaran el suyo. Ver ADR-0008 §1.3.
 */
const ROL_ESPERADO: RolDeConexion = 'viajapro_app';

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
        // Sin respaldo a propósito: si falta la variable, no se arranca. El
        // `?? DATABASE_URL` que había aquí conectaba la aplicación con el rol propietario
        // cuando se activaba, y eso no produce ningún error visible. R2, ADR-0003, ADR-0007.
        db: { url: resolverCadena(process.env, 'DATABASE_APP_URL') },
      },
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();

    // Se comprueba la IDENTIDAD, no solo los atributos. Los tres roles de login tienen los
    // mismos privilegios sobre las tablas y se distinguen únicamente en qué funciones
    // `SECURITY DEFINER` ejecutan, así que conectarse con el equivocado no rompe nada visible
    // — solo amplía lo que la API puede hacer. Ninguna aserción de base de datos lo detecta.
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
      ROL_ESPERADO,
    );
    if (motivo) throw new Error(motivo);

    this.log.log(`Conectado como '${rol.usuario}', verificado contra '${ROL_ESPERADO}'.`);
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
