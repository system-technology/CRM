import type { PrismaClient } from '@prisma/client';
import { clavesDeCamposDesdeEntorno } from './cifrado-de-campos.js';
import { comprobarClavesAlArrancar, PuertoVersionesDeClave } from './comprobacion-de-claves.js';

/**
 * Lee las versiones de clave en uso SIN función nueva y respetando R2: con el rol de la aplicación
 * (sin BYPASSRLS), lista las agencias (`tenants` es global y de solo lectura) y, por cada una, fija
 * `app.current_tenant` en su propia transacción y pregunta las versiones distintas de las cinco
 * columnas cifradas. Devuelve solo números: ni ids ni contenido.
 *
 * Sirve con cualquiera de los roles de login de negocio (`viajapro_app`, `viajapro_webhook`): los
 * dos tienen los mismos privilegios sobre las tablas.
 *
 * TODO(datos): coste O(agencias) transacciones y un recorrido de `mensajes` por agencia. Cuando
 * haya volumen, sustituir por una función SECURITY DEFINER (propiedad de un rol sin login, EXECUTE
 * solo para los roles de la API y del trabajador, alta en `aislamiento.spec.ts`) que devuelva
 * `SELECT DISTINCT version` entre agencias; este adaptador sería lo único que cambia.
 */
export class VersionesDeClavePrisma extends PuertoVersionesDeClave {
  constructor(private readonly prisma: PrismaClient) {
    super();
  }

  async versionesEnUso(): Promise<number[]> {
    const agencias = await this.prisma.tenant.findMany({ select: { id: true } });
    const todas = new Set<number>();
    for (const { id } of agencias) {
      const filas = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant', ${id}::text, true)`;
        return tx.$queryRaw<Array<{ v: number }>>`
          SELECT DISTINCT v::int AS v FROM (
            SELECT texto_clave_version AS v FROM mensajes
            UNION SELECT ultimo_mensaje_texto_clave_version FROM conversaciones
            UNION SELECT preferencias_clave_version FROM contactos
            UNION SELECT texto_clave_version FROM notas_internas
            UNION SELECT nombre_archivo_clave_version FROM adjuntos
          ) t WHERE v IS NOT NULL`;
      });
      for (const { v } of filas) todas.add(v);
    }
    return [...todas];
  }
}

/** Punto de entrada de `main.ts`, `worker.ts` y `arrancar-unico.ts`: lanza si hay datos huérfanos. */
export async function comprobarClavesDeCamposAlArrancar(
  prisma: PrismaClient,
  entorno: Record<string, string | undefined> = process.env,
): Promise<void> {
  await comprobarClavesAlArrancar(
    new VersionesDeClavePrisma(prisma),
    clavesDeCamposDesdeEntorno(entorno),
  );
}
