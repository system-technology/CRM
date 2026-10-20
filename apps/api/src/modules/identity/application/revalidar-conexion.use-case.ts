/**
 * El contrato de la autenticación del socket (ADR-0011, «La bandeja en vivo»).
 *
 * **Socket.IO todavía no existe en la API.** Cuando exista, su gateway NO pasa por
 * `TenantMiddleware`, así que repite los pasos 3 y 4 por su cuenta, y lo hace con esto:
 *
 *   · **Al conectar**, con la cookie del handshake. Si `mantener` es falso, se rechaza la conexión.
 *     Si es verdadero, el socket se une a las salas `tenant:<tenantId>` y `usuario:<usuarioId>` y
 *     guarda los permisos.
 *   · **Cada `INTERVALO_DE_REVALIDACION_MS`**, para cada socket abierto y con la cookie GUARDADA
 *     del handshake. Repite **también el paso 3** (la sesión existe y no está revocada), no solo el
 *     4: sin eso, una sesión revocada cuyo evento de baja se perdió seguiría viva. Si `mantener`
 *     es falso, se desconecta; si cambió el rol, se actualizan los permisos.
 *   · **Al dar de baja, revocar la sesión o cambiar el rol**, el evento del outbox hace
 *     `disconnectSockets()` sobre la sala `usuario:<id>`. El intervalo es el respaldo para cuando
 *     el evento se pierde, no el mecanismo principal.
 *
 * Es la misma pregunta que le hace el middleware a cada petición, por eso se apoya en el mismo
 * caso de uso (`ResolverAcceso`): dos sitios que implementaran «¿sigue dentro?» acabarían
 * decidiendo distinto.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  type AccesoConcedido,
  type MotivoDeNegacion,
  ResolutorDeAcceso,
} from '../../../shared/puertos/puerto-de-acceso.js';

/** Cada cuánto se revalida un socket abierto. */
export const INTERVALO_DE_REVALIDACION_MS = 60_000;

export type DecisionDeConexion =
  { mantener: true; acceso: AccesoConcedido } | { mantener: false; motivo: MotivoDeNegacion };

@Injectable()
export class RevalidarConexion {
  constructor(@Inject(ResolutorDeAcceso) private readonly acceso: ResolutorDeAcceso) {}

  async ejecutar(cookieDelHandshake: string | null): Promise<DecisionDeConexion> {
    const r = await this.acceso.resolver({ cookie: cookieDelHandshake });
    return r.concedido
      ? { mantener: true, acceso: r.acceso }
      : { mantener: false, motivo: r.motivo };
  }
}
