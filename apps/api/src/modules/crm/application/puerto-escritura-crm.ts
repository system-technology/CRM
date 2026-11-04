/**
 * Puerto de escritura de contactos y oportunidades (T-075). Aparte de `PuertoCrm` (lectura del
 * tablero y la ficha) para no obligar a todo doble de esa clase a implementar escrituras.
 *
 * Todo corre bajo el tenant de la petición; el adaptador no recibe `tenantId`.
 */
import type { Consentimiento, Contacto, Dinero, Oportunidad } from '@viajapro/contracts';

export interface NuevoContacto {
  telefonoE164: string;
  nombre: string | null;
  correo: string | null;
  etiquetas: string[];
  preferencias: string | null;
  creadoPorId: string | null;
}

/** Solo lo presente se escribe; `null` borra un campo opcional. */
export interface CambiosDeContacto {
  telefonoE164?: string;
  nombre?: string | null;
  correo?: string | null;
  etiquetas?: string[];
  preferencias?: string | null;
}

export interface NuevaOportunidad {
  contactoId: string;
  etapaId: string;
  titulo: string;
  destino: string | null;
  paqueteId: string | null;
  fechaSalida: string | null;
  valorEstimado: Dinero | null;
  asesorId: string | null;
  creadoPorId: string | null;
}

export interface NuevoConsentimiento {
  finalidad: Consentimiento;
  canal: string;
  prueba: string;
  textoMostrado: string;
  versionAviso: string;
  registradoPorId: string | null;
}

export abstract class PuertoEscrituraCrm {
  /**
   * Registra el consentimiento. Si la finalidad ya estaba vigente no escribe nada (conserva la
   * prueba original). `null` si el contacto no existe en esta agencia.
   */
  abstract otorgarConsentimiento(
    contactoId: string,
    datos: NuevoConsentimiento,
  ): Promise<Contacto | null>;

  /**
   * Marca `revocado_en` en la fila vigente de la finalidad; idempotente. La fila se conserva
   * (la ley pide poder demostrar el histórico). `null` si el contacto no existe en esta agencia.
   */
  abstract revocarConsentimiento(
    contactoId: string,
    finalidad: Consentimiento,
  ): Promise<Contacto | null>;

  /** @throws TelefonoYaRegistradoError si otro contacto de la agencia ya lo tiene. */
  abstract crearContacto(datos: NuevoContacto): Promise<Contacto>;

  /**
   * @returns `null` si el contacto no existe en esta agencia.
   * @throws TelefonoYaRegistradoError si el nuevo teléfono ya es de otro contacto.
   */
  abstract editarContacto(
    contactoId: string,
    cambios: CambiosDeContacto,
    actorId: string | null,
  ): Promise<Contacto | null>;

  abstract existeContacto(contactoId: string): Promise<boolean>;
  /** Usuario activo de esta agencia. */
  abstract existeAsesor(usuarioId: string): Promise<boolean>;
  abstract existePaquete(paqueteId: string): Promise<boolean>;

  /**
   * La etapa por la que entra una oportunidad: la de clave `NUEVO_LEAD`, o si la agencia no la
   * tiene, la primera por orden que no sea ganada ni perdida. `null` si no hay ninguna.
   */
  abstract etapaInicial(): Promise<{ id: string } | null>;

  abstract crearOportunidad(datos: NuevaOportunidad): Promise<Oportunidad>;
}
