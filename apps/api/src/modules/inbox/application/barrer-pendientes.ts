/**
 * El barrido: recoge los changes que quedaron `PENDIENTE` sin trabajo vivo y los vuelve a encolar.
 * ADR-0008 §4, el «relay», que el ADR-0010 punto 9 reconoce que faltaba.
 *
 * **Para qué existe.** El POST guarda y luego encola. Si el proceso muere en medio, o Redis
 * rechaza el `add`, la fila existe y nadie la recogerá: Meta ya recibió su 200 o su 500 y reintenta
 * solo en el segundo caso. Esto cierra el hueco sin depender de Meta.
 *
 * **Lo durable es la base**, también el contador de reencolados (`intentos_barrido`). El barrido pregunta a PostgreSQL qué falta, no a Redis qué sobra.
 * Redis solo transporta identificadores.
 *
 * **Tres límites contra un barrido que hace daño:**
 *   · solo toma lo que lleva `antiguedadMinimaS` sin resolverse: no pisa al POST recién hecho;
 *   · si el change ya tiene trabajo vivo, no lo toca (no cuenta como reencolado);
 *   · un mismo change se reencola como mucho `maxReencolados` veces. Pasado eso se DA POR
 *     ABANDONADO: se registra una vez, con error, y deja de molestar. NO se descarta: sigue
 *     pendiente en la base, y es la purga de contenido por antigüedad (`purgar_payloads`) la que
 *     decide cuándo anularlo. Cerrarlo aquí como CLASIFICADO destruiría un mensaje de cliente
 *     que quizá solo esperaba a que alguien arreglara el defecto.
 *
 * **Sin PII en el registro.** Solo cuentas y el prefijo del `recepcion_id`, que es un hash.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfiguracionDelBarrido } from '../domain/configuracion-del-barrido.js';
import { PuertoPendientes, PuertoReencolador } from './puertos-de-barrido.js';

export interface ResultadoDelBarrido {
  /** Cuántos changes devolvió la base. */
  candidatos: number;
  /** Cuántos trabajos nuevos se dejaron en la cola. */
  reencolados: number;
  /** Cuántos ya tenían trabajo vivo y no se tocaron. */
  yaEnCola: number;
  /** Cuántos superaron el tope de reencolados y se dejaron. */
  abandonados: number;
}

@Injectable()
export class BarrerPendientes {
  private readonly log = new Logger(BarrerPendientes.name);

  constructor(
    @Inject(PuertoPendientes) private readonly pendientes: PuertoPendientes,
    @Inject(PuertoReencolador) private readonly reencolador: PuertoReencolador,
  ) {}

  async ejecutar(
    config: Pick<ConfiguracionDelBarrido, 'antiguedadMinimaS' | 'limite' | 'maxReencolados'>,
  ): Promise<ResultadoDelBarrido> {
    const filas = await this.pendientes.listar(
      config.antiguedadMinimaS,
      config.limite,
      config.maxReencolados,
    );
    const r: ResultadoDelBarrido = {
      candidatos: filas.length,
      reencolados: 0,
      yaEnCola: 0,
      abandonados: 0,
    };

    for (const fila of filas) {
      if (await this.reencolador.enCola(fila.recepcionId, fila.indice)) {
        r.yaEnCola += 1;
        continue;
      }

      const veces = await this.pendientes.contarReencolado(fila.recepcionId, fila.indice);
      if (veces > config.maxReencolados) {
        r.abandonados += 1;
        // Una sola vez, al cruzar el tope: el barrido siguiente no vuelve a gritar por lo mismo.
        if (veces === config.maxReencolados + 1) {
          this.log.error(
            `Change ${fila.recepcionId.toString('hex').slice(0, 12)}-${fila.indice} abandonado por ` +
              `el barrido tras ${config.maxReencolados} reencolados (${fila.antiguedadS} s sin resolver). ` +
              'Sigue pendiente en la base hasta la purga de contenido.',
          );
        }
        continue;
      }

      await this.reencolador.reencolar(fila.recepcionId, fila.indice);
      r.reencolados += 1;
    }

    this.log.log(
      `Barrido: ${r.candidatos} candidatos, ${r.reencolados} reencolados, ` +
        `${r.yaEnCola} ya en cola, ${r.abandonados} abandonados.`,
    );
    return r;
  }
}
