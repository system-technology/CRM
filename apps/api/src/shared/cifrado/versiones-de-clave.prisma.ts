import type { PrismaClient } from '@prisma/client';
import { ContextoTenant } from '../tenant/contexto-tenant.js';
import type { PrismaWebhookService } from '../prisma/prisma-webhook.service.js';
import type { ClienteTenant, PrismaService } from '../prisma/prisma.service.js';
import { PuertoVersionesDeClave } from './comprobacion-de-claves.js';

/** Abre una transacción con `app.current_tenant` fijado, con la misma vía que usa cada proceso. */
export type EnTenant = <T>(tenantId: string, fn: (tx: ClienteTenant) => Promise<T>) => Promise<T>;

/** API: `PrismaService.conTenant`, que toma el tenant del `ContextoTenant` (aquí, uno de arranque). */
export function enTenantDeLaApi(prisma: PrismaService): EnTenant {
  return (tenantId, fn) =>
    ContextoTenant.ejecutarCon(
      {
        tenantId,
        usuarioId: null,
        identidadId: null,
        permisos: new Set(),
        trazaId: 'comprobacion-de-claves',
      },
      () => prisma.conTenant(fn),
    );
}

/** Trabajador: `PrismaWebhookService.conTenantResuelto`, con su aserción de lo fijado. */
export function enTenantDelTrabajador(prisma: PrismaWebhookService): EnTenant {
  return (tenantId, fn) => prisma.conTenantResuelto(tenantId, fn);
}

/**
 * Lee las versiones de clave en uso SIN función nueva y respetando R2: con el rol de la aplicación
 * (sin BYPASSRLS), lista las agencias (`tenants` es global y de solo lectura) y, por cada una,
 * abre su transacción con el `conTenant` del proceso (`EnTenant`: no reimplementa `set_config`) y
 * pregunta las versiones distintas de las cinco columnas cifradas. Devuelve solo números: ni ids
 * ni contenido.
 *
 * Sirve con cualquiera de los roles de login de negocio (`viajapro_app`, `viajapro_webhook`): los
 * dos leen las cinco tablas cifradas (las de booking, solo de `viajapro_app`, no llevan cifrado).
 *
 * TODO(datos): coste O(agencias) transacciones y un recorrido de `mensajes` por agencia. Cuando
 * haya volumen, sustituir por una función SECURITY DEFINER (propiedad de un rol sin login, EXECUTE
 * solo para los roles de la API y del trabajador, alta en `aislamiento.spec.ts`) que devuelva
 * `SELECT DISTINCT version` entre agencias; este adaptador sería lo único que cambia.
 */
export class VersionesDeClavePrisma extends PuertoVersionesDeClave {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly enTenant: EnTenant,
  ) {
    super();
  }

  async versionesEnUso(): Promise<number[]> {
    const agencias = await this.prisma.tenant.findMany({ select: { id: true } });
    const todas = new Set<number>();
    for (const { id } of agencias) {
      const filas = await this.enTenant(
        id,
        (tx) => tx.$queryRaw<Array<{ v: number }>>`
          SELECT DISTINCT v::int AS v FROM (
            SELECT texto_clave_version AS v FROM mensajes
            UNION SELECT ultimo_mensaje_texto_clave_version FROM conversaciones
            UNION SELECT preferencias_clave_version FROM contactos
            UNION SELECT texto_clave_version FROM notas_internas
            UNION SELECT nombre_archivo_clave_version FROM adjuntos
          ) t WHERE v IS NOT NULL`,
      );
      for (const { v } of filas) todas.add(v);
    }
    return [...todas];
  }
}
