/**
 * Vigilancia de los dos plazos del mayorista (ADR-0024 §3.6, T-244): antes de cada plazo, y cuando
 * vence, deja UN aviso por reserva y plazo en el outbox. El aviso no cambia el estado de la reserva:
 * que se cayó lo sabe el mayorista y el asesor la marca `CAIDA`; el sistema solo grita.
 *
 * Recorre las agencias de una en una, cada una en su propia transacción bajo RLS. El fallo de una no
 * impide a las demás. Varias réplicas a la vez no duplican: la marca se escribe con
 * `WHERE aviso_… IS NULL` y solo quien la gana escribe el evento.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PuertoDeAgenciasVigilables, RepositorioDeAvisosDePlazo } from './puertos-de-vigilancia.js';

export interface ResultadoDeVigilancia {
  agencias: number;
  avisos: number;
  agenciasConFallo: number;
}

/** Solo la clase del error: el mensaje de uno de base puede traer la fila. */
const clase = (error: unknown): string =>
  error instanceof Error ? error.constructor.name : 'ERROR_DESCONOCIDO';

@Injectable()
export class VigilarPlazosUseCase {
  private readonly log = new Logger(VigilarPlazosUseCase.name);

  constructor(
    @Inject(PuertoDeAgenciasVigilables) private readonly agencias: PuertoDeAgenciasVigilables,
    @Inject(RepositorioDeAvisosDePlazo) private readonly avisos: RepositorioDeAvisosDePlazo,
  ) {}

  /** `ahora` llega por parámetro: el dominio no lee el reloj, y las pruebas lo fijan. */
  async ejecutar(ahora: Date): Promise<ResultadoDeVigilancia> {
    const resultado: ResultadoDeVigilancia = { agencias: 0, avisos: 0, agenciasConFallo: 0 };
    const ids = await this.agencias.agenciasActivas();
    for (const tenantId of ids) {
      resultado.agencias += 1;
      try {
        resultado.avisos += await this.avisos.avisarAgencia(tenantId, ahora);
      } catch (error) {
        resultado.agenciasConFallo += 1;
        this.log.error(`Falló la vigilancia de plazos de una agencia (${clase(error)}).`);
      }
    }
    if (resultado.avisos > 0) {
      this.log.log(
        `Vigilancia de plazos: ${resultado.avisos} aviso(s) en ${resultado.agencias} agencia(s).`,
      );
    }
    return resultado;
  }
}
