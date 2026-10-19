/**
 * Los puertos por los que otros contextos piden cosas a `crm` sin importarlo ni tocar sus tablas.
 * R4 y ADR-0004.
 *
 * **Quién los define y quién los implementa.** Los define quien los necesita —`inbox` quiere
 * asegurar un contacto, `quoting` quiere comprobar que uno existe— pero viven aquí, en `shared/`,
 * y no dentro de ninguno de los dos: `crm` tiene que implementarlos, y para eso tendría que
 * importar el archivo de su cliente, que es justo el acoplamiento que se quiere evitar. `crm` los
 * implementa en su `infrastructure/` y los registra con estos símbolos; los clientes inyectan el
 * símbolo con `@Inject`.
 *
 * **El tenant no cambia.** Cada método recibe la transacción `tx` del llamador, que ya trae
 * `app.current_tenant` fijado: el puerto corre DENTRO de la misma transacción y bajo la misma
 * RLS, y no abre otra. Por eso recibe el cliente y no tiene `PrismaService` propio. El
 * `tenantId` va además como argumento explícito para el predicado de defensa en profundidad.
 *
 * Son clases abstractas y no interfaces: Nest necesita un símbolo en ejecución para inyectar.
 */
import type { ClienteTenant } from '../prisma/prisma.service.js';

export interface EntradaDeContacto {
  tenantId: string;
  /** E.164, con el `+`. */
  telefonoE164: string;
  /** El nombre que el viajero tiene en su WhatsApp. Puede faltar. Solo se usa al CREAR. */
  nombrePerfil: string | null;
}

/** Lo que `inbox` necesita de `crm`: que exista el contacto de quien escribe. */
export abstract class PuertoContactos {
  /**
   * Devuelve el contacto de ese teléfono en ese tenant, creándolo si no existe. **No sobrescribe**:
   * si ya existe, su nombre no cambia por lo que diga un perfil de WhatsApp, que cualquiera puede
   * poner a su gusto.
   */
  abstract asegurarContacto(tx: ClienteTenant, entrada: EntradaDeContacto): Promise<{ id: string }>;
}

/** Lo que `quoting` necesita de `crm`: comprobar referencias antes de guardar una cotización. */
export abstract class PuertoReferenciasDeCrm {
  abstract existeContacto(
    tx: ClienteTenant,
    tenantId: string,
    contactoId: string,
  ): Promise<boolean>;

  /** La oportunidad existe Y pertenece a ese contacto. */
  abstract existeOportunidadDelContacto(
    tx: ClienteTenant,
    tenantId: string,
    oportunidadId: string,
    contactoId: string,
  ): Promise<boolean>;
}
