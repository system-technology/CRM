/**
 * Credenciales de la FASE DE PRUEBA: el token de usuario del sistema del Tech Provider
 * (`META_SYSTEM_USER_TOKEN`) y el número de prueba de Meta (`META_PHONE_NUMBER_ID_PRUEBA`).
 *
 * **Solo sirve al canal cuyo `phone_number_id` es el de prueba Y cuya agencia es
 * `META_TENANT_ID_PRUEBA`.** Un token de usuario del sistema
 * puede tener alcance sobre más de un WABA; sin esta restricción, cualquier canal registrado en la
 * base podría enviar con el token de la plataforma. Cualquier otro canal recibe
 * `CredencialNoDisponibleError` y su mensaje queda `FALLIDO`, explicado.
 *
 * En producción esto se sustituye por las credenciales POR AGENCIA de `cuentas_whatsapp`
 * (token del Embedded Signup cifrado con AES-256-GCM, R6), detrás del mismo puerto. ADR-0018 §7.
 */
import { CredencialNoDisponibleError } from '../domain/errores-de-envio.js';
import {
  type CredencialDeEnvio,
  PuertoCredencialesWhatsapp,
} from '../application/puertos-de-envio.js';

export class CredencialesDePrueba extends PuertoCredencialesWhatsapp {
  /** `@inyeccion-manual`: lo construye `crearCredencialesWhatsapp`. */
  constructor(
    private readonly token: string,
    private readonly phoneNumberIdDePrueba: string,
    private readonly tenantIdDePrueba: string,
  ) {
    super();
  }

  paraCanal(
    tenantId: string,
    canal: { canalId: string; phoneNumberId: string },
  ): Promise<CredencialDeEnvio> {
    // `phone_number_id` es único POR AGENCIA, no global: dos agencias pueden registrar el mismo
    // número. Por eso el número solo no basta; también tiene que ser la agencia configurada. T-060.
    if (tenantId !== this.tenantIdDePrueba || canal.phoneNumberId !== this.phoneNumberIdDePrueba) {
      return Promise.reject(new CredencialNoDisponibleError());
    }
    return Promise.resolve({ phoneNumberId: canal.phoneNumberId, token: this.token });
  }
}

/** Sin configuración: ningún canal puede enviar, y cada mensaje lo dice en vez de quedar colgado. */
export class CredencialesNoConfiguradas extends PuertoCredencialesWhatsapp {
  paraCanal(): Promise<CredencialDeEnvio> {
    return Promise.reject(new CredencialNoDisponibleError());
  }
}
