/**
 * La precondición dura de la fase 1 del apodo (ADR-0031 §4, B3): con el índice global de apodos,
 * la función solo es válida con UNA agencia. Con más, el apodo permitiría enumerar los de todo el
 * sistema (el 409) y acaparar los de otras agencias. Se hace cumplir en el código, no en un documento.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DomainError } from '@viajapro/domain';
import { PuertoCatalogoDeApodos } from '../domain/puertos-de-apodos.js';

/** `REGISTRO_AUTOSERVICIO_HABILITADO` (ADR-0030): activo salvo que valga explícitamente «apagado». */
export function registroAutoservicioHabilitado(
  entorno: Record<string, string | undefined>,
): boolean {
  const valor = (entorno['REGISTRO_AUTOSERVICIO_HABILITADO'] ?? '').trim().toLowerCase();
  // Falla cerrado: un valor que no se entiende cuenta como encendido.
  return !['', 'false', '0', 'no', 'off'].includes(valor);
}

/** La API se niega a arrancar: el autoservicio crearía una segunda agencia con el índice global. */
export class AutoservicioConApodosGlobalesError extends DomainError {
  readonly code = 'AUTOSERVICIO_CON_APODOS_GLOBALES';

  constructor() {
    super(
      'REGISTRO_AUTOSERVICIO_HABILITADO está activo y el índice de apodos es global ' +
        '(accesos_identidad_apodo_key): con varias agencias, un dueño podría enumerar y acaparar ' +
        'apodos ajenos (ADR-0031 §4). Termina la fase 2 (T-309) o apaga el autoservicio.',
    );
  }
}

@Injectable()
export class GuardiaDeApodos {
  private readonly log = new Logger(GuardiaDeApodos.name);

  constructor(@Inject(PuertoCatalogoDeApodos) private readonly catalogo: PuertoCatalogoDeApodos) {}

  /**
   * (b) `true` si la función de apodos está apagada: el índice es global y `tenants` tiene MÁS de
   * una fila. Falla cerrado: si no se puede comprobar, está apagada.
   */
  async estaApagada(): Promise<boolean> {
    try {
      if (!(await this.catalogo.indiceDeApodosEsGlobal())) return false;
      return (await this.catalogo.cuentaDeAgencias()) > 1;
    } catch (error) {
      this.log.warn(
        `No se pudo comprobar la precondición de apodos; la función queda apagada (${error instanceof Error ? error.name : 'error'}).`,
      );
      return true;
    }
  }

  /** (a) Al arrancar: con el autoservicio activo y el índice global, no se arranca. */
  async exigirAlArrancar(entorno: Record<string, string | undefined>): Promise<void> {
    if (!registroAutoservicioHabilitado(entorno)) return;
    if (await this.catalogo.indiceDeApodosEsGlobal())
      throw new AutoservicioConApodosGlobalesError();
  }
}
