/**
 * El paso 4 de ADR-0011: la lectura de `usuarios` bajo RLS.
 *
 * Corre con el pool de la API (`viajapro_app`), que no puede saltarse RLS, dentro de una
 * transacción con `app.current_tenant` fijado al tenant que se quiere comprobar. **Eso es lo que
 * hace que la respuesta valga:** con ese tenant fijado, PostgreSQL solo deja ver filas de esa
 * agencia, así que una fila devuelta ES de esa agencia aunque el valor viniera de una sesión
 * manipulada. Si la identidad no pertenece a ella, el resultado son cero filas, y cero filas es
 * «no».
 *
 * El `tenantId` va además en el `where`, como defensa en profundidad: no depende de RLS para ser
 * correcto, y si alguna vez RLS fallara, esta consulta seguiría acotada.
 */
import { Inject, Injectable } from '@nestjs/common';
import { type Permiso, Permiso as EsquemaDePermiso } from '@viajapro/contracts';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { agenciaPermiteAcceso } from '../domain/estados-de-agencia.js';
import { type MembresiaVerificada, PuertoMembresias } from '../domain/puertos.js';

@Injectable()
export class MembresiasPrisma extends PuertoMembresias {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async verificar(tenantId: string, identidadId: string): Promise<MembresiaVerificada> {
    // Contexto provisional: existe solo para que `conTenant` fije `app.current_tenant`. No tiene
    // permisos y no sale de esta función.
    const fila = await ContextoTenant.ejecutarCon(
      { tenantId, usuarioId: null, identidadId, permisos: new Set(), trazaId: 'membresia' },
      () =>
        this.prisma.conTenant((tx) =>
          tx.usuario.findFirst({
            where: { tenantId, identidadId, activo: true, eliminadoEn: null },
            select: {
              id: true,
              rol: { select: { nombre: true, permisos: true } },
              tenant: { select: { estado: true } },
            },
          }),
        ),
    );

    if (!fila) return { tipo: 'sin_membresia' };
    if (!agenciaPermiteAcceso(fila.tenant.estado)) return { tipo: 'agencia_suspendida' };

    return {
      tipo: 'vigente',
      usuarioId: fila.id,
      rol: fila.rol.nombre,
      permisos: soloDelCatalogo(fila.rol.permisos),
    };
  }
}

/**
 * La base ya lo garantiza con un `CHECK`, pero el código no confía en eso para autorizar: lo que
 * no está en el catálogo cerrado no concede nada.
 */
function soloDelCatalogo(crudos: readonly string[]): ReadonlySet<Permiso> {
  const permisos = new Set<Permiso>();
  for (const p of crudos) {
    const r = EsquemaDePermiso.safeParse(p);
    if (r.success) permisos.add(r.data);
  }
  return permisos;
}
