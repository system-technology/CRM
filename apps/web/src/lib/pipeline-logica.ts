import {
  ClaveEtapa,
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
  NUEVO_LEAD: 'Nuevo Lead',
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
  if (!dinero) return '$0';
  const decimales = dinero.moneda === 'COP' ? 0 : 2;
  const unidades = Number(dinero.unidades);
  if (!Number.isFinite(unidades)) return '$0';

  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: dinero.moneda,
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(unidades / 10 ** decimales);
}

/**
 * Formatea un instante ISO a texto relativo amigable ('hace 2 h', 'ayer', etc.).
 */
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
  return new Date(instante).toLocaleDateString('es-CO');
}

/**
 * Determina si la fecha de vencimiento de una próxima tarea ya está en el pasado (alerta de retraso).
 */
export function esTareaAtrasada(venceEn: string | null): boolean {
  if (!venceEn) return false;
  return new Date(venceEn).getTime() < Date.now();
}

/**
 * Mueve una oportunidad dentro de la estructura inmutable del TableroPipeline.
 * Valida estrictamente la operación con el esquema MoverOportunidad de @viajapro/contracts (R3).
 * Invariante: No recalcula sumas en cliente (los totales de servidor se conservan).
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

  // Retornar nuevo TableroPipeline inmutable
  const nuevasColumnas = tablero.columnas.map((col) => {
    // Si es la columna origen, remover la tarjeta y decrementar contador
    if (col.etapa.id === etapaOrigen.id && col.etapa.id !== etapaDestino.id) {
      return {
        ...col,
        total: Math.max(0, col.total - 1),
        oportunidades: col.oportunidades.filter((op) => op.id !== oportunidadId),
      };
    }

    // Si es la columna destino, agregar la tarjeta actualizada al inicio e incrementar contador
    if (col.etapa.id === etapaDestino.id && col.etapa.id !== etapaOrigen.id) {
      return {
        ...col,
        total: col.total + 1,
        oportunidades: [tarjetaActualizada, ...col.oportunidades],
      };
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
