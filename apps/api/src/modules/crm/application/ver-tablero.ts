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
import { Dinero, type TableroPipeline } from '@viajapro/contracts';
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
          ...totalesEnDinero(datos?.valores ?? []),
          oportunidades: datos?.oportunidades ?? [],
        };
      });

    return { columnas };
  }
}

/**
 * Los totales de la columna, en la forma del contrato.
 *
 * Van como cadena porque un total en pesos colombianos supera el entero seguro de JavaScript en
 * cuanto hay unas pocas oportunidades grandes, y se corrompería en silencio al deserializar
 * (R8). `valorTotal` es `null` cuando la columna está vacía (cero y «no hay nada» no son lo
 * mismo en un tablero de ventas) **y cuando mezcla monedas**: sumar pesos con dólares sería
 * inventarse una cifra. El desglose va siempre en `valoresPorMoneda` (T-181).
 */
export function totalesEnDinero(valores: readonly { monedaIso: string; unidades: bigint }[]): {
  valorTotal: Dinero | null;
  valoresPorMoneda: Dinero[];
} {
  // `parse` y no un cast: una moneda fuera del contrato debe fallar ruidosamente.
  const valoresPorMoneda = valores.map((v) =>
    Dinero.parse({ unidades: v.unidades.toString(), moneda: v.monedaIso }),
  );
  return {
    valorTotal: valoresPorMoneda.length === 1 ? (valoresPorMoneda[0] ?? null) : null,
    valoresPorMoneda,
  };
}
