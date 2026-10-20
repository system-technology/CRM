/**
 * `POST /api/v1/identidad/invitaciones`: el dueño invita por correo, con un rol de SU agencia.
 *
 * **Quién puede.** Solo `usuarios.administrar`. La ruta lo exige con `@RequierePermiso`, y el caso
 * de uso lo vuelve a comprobar: el permiso sale de `roles` leído bajo RLS en esta petición
 * (ADR-0011 paso 4), y una ruta nueva que olvidara el decorador no abriría la puerta.
 *
 * **Nadie reparte más de lo que tiene.** Los permisos del rol invitado deben estar INCLUIDOS en los
 * de quien invita; si no, 403. Sin esto, quien tiene `usuarios.administrar` se invitaría a sí mismo
 * con un rol de dueño y escalaría privilegios dentro de la agencia.
 *
 * **Bajo RLS.** El rol se busca con el tenant de la petición: un `rolId` de otra agencia no existe
 * aquí y responde 404. El `tenantId` de la invitación sale del contexto, nunca del cuerpo.
 *
 * **No revela nada.** No consulta si el correo ya tiene identidad, ni si ya es miembro de esta u
 * otra agencia: siempre crea la invitación y siempre encola el mismo correo. La respuesta HTTP es
 * la misma. Aceptar ya sabrá qué hacer con una identidad que existe.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { InvitarMiembro, Permiso } from '@viajapro/contracts';
import { permisoDenegado } from '../../../shared/autorizacion/permiso.guard.js';
import { PuertoColaDeCorreo } from '../../../shared/puertos/puerto-de-correo.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  claveDeCorreoDeInvitacion,
  enlaceDeInvitacion,
  generarTokenDeInvitacion,
  hashearTokenDeInvitacion,
  VIGENCIA_DE_INVITACION_MS,
} from '../domain/invitacion.js';
import { PuertoInvitaciones, PuertoMiembros } from '../domain/puertos-de-miembros.js';
import { RolNoEncontradoError } from './errores.js';

@Injectable()
export class InvitarMiembroUseCase {
  constructor(
    @Inject(PuertoMiembros) private readonly miembros: PuertoMiembros,
    @Inject(PuertoInvitaciones) private readonly invitaciones: PuertoInvitaciones,
    @Inject(PuertoColaDeCorreo) private readonly correo: PuertoColaDeCorreo,
  ) {}

  async ejecutar(entrada: InvitarMiembro, urlDeLaWeb: string, ahora = new Date()): Promise<void> {
    const contexto = ContextoTenant.obtener();
    if (!contexto.permisos.has('usuarios.administrar')) {
      throw permisoDenegado('usuarios.administrar');
    }

    const descripcion = await this.miembros.describirInvitacion(entrada.rolId);
    if (!descripcion) throw new RolNoEncontradoError();

    // Subconjunto estricto de lo que tiene quien invita. Un permiso que el catálogo no conoce no
    // se tiene: ante la duda, se niega.
    const sinTener = descripcion.permisos.find(
      (p) => !(contexto.permisos as ReadonlySet<string>).has(p),
    );
    if (sinTener !== undefined) throw permisoDenegado(sinTener as Permiso);

    const token = generarTokenDeInvitacion();
    const hash = hashearTokenDeInvitacion(token);
    await this.invitaciones.guardar(
      hash,
      {
        tenantId: contexto.tenantId,
        correo: entrada.correo,
        rolId: entrada.rolId,
        invitadoPorUsuarioId: contexto.usuarioId,
      },
      new Date(ahora.getTime() + VIGENCIA_DE_INVITACION_MS),
    );

    await this.correo.encolar(
      {
        para: entrada.correo,
        asunto: `Te invitaron a ${descripcion.agencia} en ViajaPro`,
        texto:
          `Te invitaron a unirte a ${descripcion.agencia} en ViajaPro con el rol ${descripcion.rol}.\n\n` +
          `Acepta la invitación aquí (caduca en 7 días y solo sirve una vez):\n` +
          `${enlaceDeInvitacion(urlDeLaWeb, token)}\n\n` +
          'Si no esperabas este correo, ignóralo: no pasa nada.',
      },
      claveDeCorreoDeInvitacion(hash),
    );
  }
}
