/**
 * Caso de uso: el tablero de oportunidades.
 *
 * **Las columnas salen de `etapas_pipeline`, no de un `enum`.** Una agencia con seis etapas ve
 * seis columnas; una que renombró «Ganada» a «Cerrada» ve su propio nombre. Ramificar aquí
 * sobre la clave canónica sería reintroducir por la puerta de atrás el enum cerrado que el
 * contrato acaba de quitar — y romper R12.
 *
 * **Una columna vacía se devuelve igual.** Si no, el tablero cambia de forma según el día y el
 * asesor no puede arrastrar una tarjeta a una etapa que no está pintada.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Dinero, TableroPipeline } from '@viajapro/contracts';
import { PuertoCrm } from './puerto-crm.js';

/** Cuántas tarjetas se pintan por columna antes de paginar. */
const TARJETAS_POR_COLUMNA = 20;

@Injectable()
export class VerTablero {
  constructor(@Inject(PuertoCrm) private readonly crm: PuertoCrm) {}

  async ejecutar(): Promise<TableroPipeline> {
    const [etapas, porEtapa] = await Promise.all([
      this.crm.listarEtapas(),
      this.crm.tableroPorEtapa(TARJETAS_POR_COLUMNA),
    ]);

    const columnas = etapas
      .slice()
      .sort((a, b) => a.orden - b.orden)
      .map((etapa) => {
        const datos = porEtapa.get(etapa.id);
        return {
          etapa,
          total: datos?.total ?? 0,
          valorTotal: aDinero(datos?.valorUnidades ?? null),
          oportunidades: datos?.oportunidades ?? [],
        };
      });

    return { columnas };
  }
}

/**
 * El total de la columna, en la forma del contrato.
 *
 * Va como cadena porque un total en pesos colombianos supera el entero seguro de JavaScript en
 * cuanto hay unas pocas oportunidades grandes, y se corrompería en silencio al deserializar
 * (R8). `null` cuando la columna está vacía: cero y «no hay nada» no son lo mismo en un tablero
 * de ventas.
 *
 * La moneda está fija en COP mientras el mercado base sea Colombia. El día que una agencia
 * cotice en dólares, sumar dos monedas distintas en un total sería un error silencioso: por eso
 * esto tiene que fallar ruidosamente antes que inventarse una conversión.
 */
function aDinero(unidades: bigint | null): Dinero | null {
  if (unidades === null) return null;
  return { unidades: unidades.toString(), moneda: 'COP' };
}
