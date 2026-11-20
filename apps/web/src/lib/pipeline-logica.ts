import { formatearDinero, formatearFecha, formatearFechaHora } from './formato';
import {
  ClaveEtapa,
  type ColumnaPipeline,
  Dinero,
  EtapaDefinida,
  MotivoPerdida,
  MoverOportunidad,
  Oportunidad,
  TableroPipeline,
} from '@viajapro/contracts';

/**
 * Nombre de respaldo para las cinco etapas canónicas.
 *
 * **Casi nunca hace falta.** Desde que la etapa viaja como `EtapaDefinida`, trae su propio
 * `nombre` —el que la agencia le puso: la demo llama «Consulta nueva» a su primera etapa— y es
 * ése el que se pinta. Este diccionario solo sirve cuando hay que mostrar la clave canónica en
 * sí misma: un informe que compara agencias, un filtro guardado.
 *
 * Pintar desde aquí en vez de desde `etapa.nombre` le quitaría a la agencia el derecho a
 * llamar a sus etapas como quiera, que es lo que R12 protege.
 */
export const NOMBRES_ETAPAS: Record<ClaveEtapa, string> = {
  NUEVO_LEAD: 'Oportunidad nueva',
  EN_COTIZACION: 'En Cotización',
  EN_NEGOCIACION: 'En Negociación',
  GANADA: 'Ganada',
  PERDIDA: 'Perdida',
};

/**
 * Nombres legibles en español para los motivos de pérdida exigidos por el contrato.
 */
export const NOMBRES_MOTIVOS_PERDIDA: Record<MotivoPerdida, string> = {
  PRECIO: 'Precio alto frente a presupuesto',
  TIEMPO_DE_RESPUESTA: 'Tiempo de respuesta tardío (SLA)',
  SIN_DISPONIBILIDAD: 'Sin disponibilidad en fechas / cupos',
  COMPRO_EN_OTRA_AGENCIA: 'Compró con otra agencia',
  VIAJE_APLAZADO: 'Viaje aplazado o cancelado por el cliente',
  NO_RESPONDE: 'Cliente dejó de responder',
  OTRO: 'Otro motivo (especificar)',
};

/**
 * Formatea un objeto `Dinero` del contrato.
 *
 * **Las unidades NO son centavos: son la unidad mínima de cada moneda**, y en pesos
 * colombianos esa unidad es el peso. `Money.desdeDecimal('150000', 'COP')` da 150.000
 * unidades, no 15.000.000. Dividir entre cien aquí mostraba $2.750 donde van $275.000 — un
 * error de dos órdenes de magnitud en la cifra que el asesor usa para decidir.
 *
 * Mismo criterio que `formatearDinero` de `api.ts`, que es el que se verificó en navegador con
 * el cotizador.
 */
export function formatearDineroCifra(dinero: Dinero | null): string {
  // Sin valor no es «$0»: cero y «no hay nada» no son lo mismo en un tablero de ventas.
  if (!dinero) return '—';
  return formatearDinero(dinero);
}

/**
 * Total de una columna para pintar: una cifra si hay una sola moneda, el desglose si hay varias
 * (nunca se suman pesos con dólares, R8, T-181) y «—» si no hay nada.
 */
export function formatearTotalesDeColumna(
  col: Pick<ColumnaPipeline, 'valorTotal' | 'valoresPorMoneda'>,
): string {
  if (col.valoresPorMoneda.length > 1)
    return col.valoresPorMoneda.map((v) => formatearDinero(v)).join(' + ');
  return formatearDineroCifra(col.valorTotal ?? col.valoresPorMoneda[0] ?? null);
}

/** Suma o resta `delta` en la entrada de su moneda; las demás monedas no se tocan. */
export function ajustarPorMoneda(
  valores: readonly Dinero[],
  delta: Dinero | null,
  signo: 1 | -1,
): Dinero[] {
  if (!delta) return [...valores];
  const existe = valores.some((v) => v.moneda === delta.moneda);
  const base = existe ? valores : [...valores, { unidades: '0', moneda: delta.moneda }];
  return base
    .map((v) => {
      if (v.moneda !== delta.moneda) return v;
      const total = BigInt(v.unidades) + BigInt(signo) * BigInt(delta.unidades);
      return { unidades: (total < 0n ? 0n : total).toString(), moneda: v.moneda };
    })
    .filter((v) => v.unidades !== '0')
    .sort((a, b) => a.moneda.localeCompare(b.moneda));
}

/** Recalcula `valorTotal` desde el desglose: solo hay total único con una sola moneda. */
function conTotales<T extends { valoresPorMoneda: Dinero[] }>(
  col: T,
  valoresPorMoneda: Dinero[],
): T & { valorTotal: Dinero | null } {
  return {
    ...col,
    valoresPorMoneda,
    valorTotal: valoresPorMoneda.length === 1 ? (valoresPorMoneda[0] ?? null) : null,
  };
}

/**
 * Formatea un instante ISO a texto relativo amigable ('hace 2 h', 'ayer', etc.).
 */
/**
 * Formatea una fecha de vencimiento de tarea de forma determinista para evitar
 * errores de hidratación entre servidor (Node) y cliente (Navegador) (Tarea 0c.14.3).
 *
 * Normaliza espacios no separables (\u202f, \u00a0) generados de forma dispar por
 * distintas implementaciones de Intl en es-CO, y fija la zona horaria a America/Bogota (R9).
 */
export function formatearFechaTarea(fechaIso: string | null): string {
  if (!fechaIso) return '—';
  const d = new Date(fechaIso);
  if (isNaN(d.getTime())) return '—';

  return formatearFechaHora(d);
}

export function formatearTiempoRelativo(instante: string | null): string {
  if (!instante) return 'Sin contacto previo';
  const fecha = new Date(instante).getTime();
  const ahora = Date.now();
  const difMin = Math.floor((ahora - fecha) / 60000);

  if (difMin < 1) return 'Hace un momento';
  if (difMin < 60) return `Hace ${difMin} min`;
  const difHoras = Math.floor(difMin / 60);
  if (difHoras < 24) return `Hace ${difHoras} h`;
  const difDias = Math.floor(difHoras / 24);
  if (difDias === 1) return 'Ayer';
  if (difDias < 30) return `Hace ${difDias} d`;
  return formatearFecha(instante);
}

/**
 * Determina si la fecha de vencimiento de una próxima tarea ya está en el pasado (alerta de retraso).
 */
export function esTareaAtrasada(venceEn: string | null): boolean {
  if (!venceEn) return false;
  return new Date(venceEn).getTime() < Date.now();
}

/**
 * Suma dos valores Dinero en enteros según R8 (sin coma flotante ni mezclar monedas).
 */
export function sumarDinero(base: Dinero | null, delta: Dinero | null): Dinero | null {
  if (!delta) return base;
  if (!base) return delta;
  if (base.moneda !== delta.moneda) {
    // Si difieren las monedas, no se mezclan directamente (R8)
    return base;
  }
  const total = BigInt(base.unidades) + BigInt(delta.unidades);
  return {
    unidades: total.toString(),
    moneda: base.moneda,
  };
}

/**
 * Resta dos valores Dinero en enteros según R8 (sin coma flotante ni resultados negativos).
 */
export function restarDinero(base: Dinero | null, delta: Dinero | null): Dinero | null {
  if (!delta) return base;
  if (!base) return null;
  if (base.moneda !== delta.moneda) {
    return base;
  }
  const resta = BigInt(base.unidades) - BigInt(delta.unidades);
  const total = resta < 0n ? 0n : resta;
  return {
    unidades: total.toString(),
    moneda: base.moneda,
  };
}

/**
 * Calcula dinámicamente la suma del valor estimado de una lista de oportunidades para una moneda dada (R8).
 */
export function calcularTotalColumna(
  oportunidades: Oportunidad[],
  moneda: 'COP' | 'USD' | 'EUR' | 'MXN' = 'COP',
): Dinero {
  let acumulado = 0n;
  for (const op of oportunidades) {
    if (op.valorEstimado && op.valorEstimado.moneda === moneda) {
      try {
        acumulado += BigInt(op.valorEstimado.unidades);
      } catch {
        // Ignorar posibles valores no enteros
      }
    }
  }
  return {
    unidades: acumulado.toString(),
    moneda,
  };
}

/**
 * Mueve una oportunidad dentro de la estructura inmutable del TableroPipeline.
 * Valida estrictamente la operación con el esquema MoverOportunidad de @viajapro/contracts (R3).
 * Invariante: Recalcula total numérico y valor monetario entero (R8) tanto en columna origen como destino.
 */
export function moverOportunidadEnTablero(
  tablero: TableroPipeline,
  oportunidadId: string,
  movimiento: MoverOportunidad,
): TableroPipeline {
  // Validación estricta Zod: si es PERDIDA sin motivo, o no-PERDIDA con motivo, lanza ZodError
  const movValidado = MoverOportunidad.parse(movimiento);

  // 1. Encontrar la tarjeta en alguna de las columnas
  let tarjetaEncontrada: Oportunidad | null = null;
  let etapaOrigen: EtapaDefinida | null = null;

  for (const col of tablero.columnas) {
    const encontrada = col.oportunidades.find((op) => op.id === oportunidadId);
    if (encontrada) {
      tarjetaEncontrada = encontrada;
      etapaOrigen = col.etapa;
      break;
    }
  }

  // La etapa destino se busca en el propio tablero: el movimiento solo lleva su `etapaId`, y
  // la tarjeta necesita la etapa entera —con su nombre y su `esPerdida`— para pintarse.
  const etapaDestino =
    tablero.columnas.find((col) => col.etapa.id === movValidado.etapaId)?.etapa ?? null;
  if (!etapaDestino) {
    throw new Error(
      `La etapa ${movValidado.etapaId} no existe en este tablero. Las etapas son por agencia.`,
    );
  }

  if (!tarjetaEncontrada || !etapaOrigen) {
    throw new Error(`No se encontró la oportunidad con ID ${oportunidadId} en el tablero.`);
  }

  // Si ya está en la misma etapa y no cambia motivo, retornar el tablero idéntico
  if (
    etapaOrigen.id === etapaDestino.id &&
    tarjetaEncontrada.motivoPerdida === movValidado.motivoPerdida
  ) {
    return tablero;
  }

  // Tarjeta actualizada con su nueva etapa y motivos de pérdida
  const tarjetaActualizada: Oportunidad = Oportunidad.parse({
    ...tarjetaEncontrada,
    etapa: etapaDestino,
    motivoPerdida: movValidado.motivoPerdida,
    notaPerdida: movValidado.notaPerdida,
  });

  // Retornar nuevo TableroPipeline inmutable con totales y valores monetarios recalculados (R8)
  const nuevasColumnas = tablero.columnas.map((col) => {
    // Si es la columna origen, remover la tarjeta, decrementar contador y restar valorTotal
    if (col.etapa.id === etapaOrigen.id && col.etapa.id !== etapaDestino.id) {
      return conTotales(
        {
          ...col,
          total: Math.max(0, col.total - 1),
          oportunidades: col.oportunidades.filter((op) => op.id !== oportunidadId),
        },
        ajustarPorMoneda(col.valoresPorMoneda, tarjetaEncontrada.valorEstimado, -1),
      );
    }

    // Si es la columna destino, agregar la tarjeta actualizada al inicio, incrementar contador y sumar valorTotal
    if (col.etapa.id === etapaDestino.id && col.etapa.id !== etapaOrigen.id) {
      return conTotales(
        {
          ...col,
          total: col.total + 1,
          oportunidades: [tarjetaActualizada, ...col.oportunidades],
        },
        ajustarPorMoneda(col.valoresPorMoneda, tarjetaEncontrada.valorEstimado, 1),
      );
    }

    // Si se actualizó dentro de la misma columna (ej. edición de nota de pérdida)
    if (col.etapa.id === etapaDestino.id && col.etapa.id === etapaOrigen.id) {
      return {
        ...col,
        oportunidades: col.oportunidades.map((op) =>
          op.id === oportunidadId ? tarjetaActualizada : op,
        ),
      };
    }

    return col;
  });

  return TableroPipeline.parse({ columnas: nuevasColumnas });
}
