/**
 * Determina si un destino o paquete turístico náutico / de isla exige el aviso
 * explícito de impuesto de muelle / tasa portuaria no incluida.
 */
export function requiereAvisoImpuestoMuelle(destino: string, paqueteNombre: string): boolean {
  const normalizado = `${destino} ${paqueteNombre}`.toLowerCase();
  return (
    normalizado.includes('cartagena') ||
    normalizado.includes('rosario') ||
    normalizado.includes('barú') ||
    normalizado.includes('baru') ||
    normalizado.includes('cholón') ||
    normalizado.includes('cholon') ||
    normalizado.includes('tierra bomba') ||
    normalizado.includes('san cipriano') ||
    normalizado.includes('pianguita') ||
    normalizado.includes('magüipí') ||
    normalizado.includes('maguipi') ||
    normalizado.includes('muelle') ||
    normalizado.includes('náutico') ||
    normalizado.includes('nautico') ||
    normalizado.includes('isla') ||
    normalizado.includes('bote') ||
    normalizado.includes('lancha')
  );
}

import { formatearErrorAmigable } from './estados-ui-logica';
import type {
  Acomodacion,
  CotizacionCalculada,
  CotizacionDeSalida,
  CotizarPaquete,
  Habitacion,
  LineaCotizacion,
  SalidaPublicada,
} from '@viajapro/contracts';
import { CotizacionCalculada as EsquemaCotizacion } from '@viajapro/contracts';
import type { PaqueteConDetalle } from './mock-catalogo';
import { formatearDinero } from './api';
import { fechaLocalEnZona } from './reportes-periodo';
import { ZONA_HORARIA_COLOMBIA } from './formato';

const CAPACIDAD_ACOMODACION: Record<Acomodacion, number> = {
  SENCILLA: 1,
  DOBLE: 2,
  TRIPLE: 3,
  CUADRUPLE: 4,
};

/**
 * Genera el texto formateado para enviar la propuesta comercial por WhatsApp (Cotización Clásica).
 * NUNCA incluye tarifas netas ni márgenes internos de la agencia (R3 y R10).
 */
export function generarTextoPropuestaWhatsApp(
  cotizacion: CotizacionCalculada,
  opciones?: { incluirNeto?: boolean; contactoNombre?: string },
): string {
  const saludo = opciones?.contactoNombre
    ? `¡Hola, ${opciones.contactoNombre}! Te comparto la propuesta solicitada:`
    : '¡Hola! Te comparto los detalles de tu cotización:';

  const lineasPasajeros = cotizacion.lineas
    .map((l) => {
      const tipo =
        l.tipoPasajero === 'ADT' ? 'Adulto' : l.tipoPasajero === 'CHD' ? 'Niño' : 'Infante';
      return `  • ${l.cantidad}x ${tipo} (${formatearDinero(l.precioUnitarioVenta)} c/u): ${formatearDinero(l.subtotalVenta)}`;
    })
    .join('\n');

  let texto = `${saludo}

🌴 *${cotizacion.paqueteNombre.toUpperCase()}*
📍 *Destino:* ${cotizacion.destino}
🗓️ *Fechas:* ${cotizacion.fechaSalida} al ${cotizacion.fechaRegreso}
🏨 *Acomodación:* ${cotizacion.habitaciones.length} habitación(es) ${cotizacion.acomodacion.toLowerCase()}
🏷️ *Temporada:* ${cotizacion.temporadaNombre}

👥 *Desglose de pasajeros:*
${lineasPasajeros}

💰 *TOTAL VENTA:* *${formatearDinero(cotizacion.totalVenta)}*`;

  if (cotizacion.plazasSinUsar > 0) {
    texto += `\nℹ️ *Nota:* Incluye ${cotizacion.plazasSinUsar} plaza(s) no ocupada(s) requerida(s) por la acomodación seleccionada.`;
  }

  if (opciones?.incluirNeto && cotizacion.totalNeto && cotizacion.margen) {
    texto += `\n\n[CONFIDENCIAL AGENCIA]\nCosto Neto: ${formatearDinero(cotizacion.totalNeto)} | Margen: ${formatearDinero(cotizacion.margen)} (${cotizacion.margenPorcentaje?.toFixed(1)}%)`;
  }

  if (requiereAvisoImpuestoMuelle(cotizacion.destino, cotizacion.paqueteNombre)) {
    texto += `\n\n⚠️ *Aviso importante:* Impuesto de muelle no incluido (tasa portuaria requerida al abordar en taquilla del muelle, no incluida en el valor del tour).`;
  }

  texto += `\n\n_¿Deseas confirmar la reserva o requieres ajustar fechas o pasajeros? Quedo atento a tus comentarios._`;

  return texto;
}

// =============================================================================
// Lógica para Cotización Armada de Salidas Reales (ADR-0009 - 0c.16)
// =============================================================================

/**
 * Genera el texto para WhatsApp de una cotización armada de salida (0c.16.2).
 * Incluye desglose por tipo de pasajero, total protagonista, aviso si es vigencia abierta
 * y alternativas de grupo si existen. Cero filtración de datos de margen/neto (R3, R10).
 */
export function generarTextoPropuestaWhatsAppSalida(
  cotizacion: CotizacionDeSalida,
  opciones?: { contactoNombre?: string },
): string {
  const saludo = opciones?.contactoNombre
    ? `¡Hola, ${opciones.contactoNombre}! Te comparto los detalles de tu cotización:`
    : '¡Hola! Te comparto los detalles de tu cotización:';

  const estadoCupo = cotizacion.deSalidaProgramada
    ? '🗓️ *Salida confirmada:* ' + cotizacion.fecha
    : '🗓️ *Fecha:* ' + cotizacion.fecha + ' _(Bajo consulta de cupo - Vigencia abierta)_';

  let tieneTarifaGrupo = false;
  const lineasDesglose = cotizacion.lineas
    .map((l) => {
      const vecesTxt = l.veces > 1 ? ` ${l.veces}x (${formatearDinero(l.precioUnitario)} c/u)` : '';
      let condGrupo = '';
      if (l.unidad === 'POR_GRUPO' || l.cubrePasajeros > 1) {
        tieneTarifaGrupo = true;
        condGrupo = ` _(Tarifa de grupo para ${l.cubrePasajeros} personas)_`;
      }
      return `  • ${l.nombre}${vecesTxt}${condGrupo} → *${formatearDinero(l.total)}*`;
    })
    .join('\n');

  let texto = `${saludo}

🌴 *${cotizacion.paqueteNombre.toUpperCase()}*
📍 *Destino:* ${cotizacion.destino}
${estadoCupo}
👥 *Pasajeros:* ${cotizacion.pasajeros} persona(s) (${cotizacion.adultos} adulto(s)${cotizacion.ninos > 0 ? `, ${cotizacion.ninos} niño(s)` : ''}${cotizacion.infantes > 0 ? `, ${cotizacion.infantes} infante(s)` : ''})

📝 *Desglose de la cotización:*
${lineasDesglose}

💰 *TOTAL A PAGAR:* *${formatearDinero(cotizacion.total)}*`;

  if (tieneTarifaGrupo) {
    texto += `\n\nℹ️ *Nota de tarifa grupal:* La cotización incluye tarifa(s) en modalidad de grupo/pareja condicionada a la cantidad mínima de pasajeros indicada.`;
  }

  if (cotizacion.alternativas.length > 0) {
    const altText = cotizacion.alternativas
      .map(
        (a) =>
          `  • ${a.nombre}: ${formatearDinero(a.total)} (${a.unidad === 'POR_GRUPO' ? `Tarifa grupal para ${a.cubrePasajeros} personas` : 'Por persona'})`,
      )
      .join('\n');
    texto += `\n\n🏷️ *Tarifas alternativas disponibles:*\n${altText}\n_(Sujetas a condiciones comerciales de la agencia)_`;
  }

  if (requiereAvisoImpuestoMuelle(cotizacion.destino, cotizacion.paqueteNombre)) {
    texto += `\n\n⚠️ *Aviso importante:* Impuesto de muelle no incluido (tasa portuaria requerida al abordar en taquilla del muelle, no incluida en el valor del tour).`;
  }

  texto += `\n\n_¿Deseas apartar tus cupos o necesitas información adicional? Quedo muy atento a tu respuesta._`;

  return texto;
}

/**
 * Traduce códigos de error de dominio de cotización a mensajes amigables y honestos (0c.16.3).
 */
export function interpretarErrorCotizacion(error: unknown): {
  codigo: string;
  mensaje: string;
  esErrorAgencia: boolean;
} {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code);
    if (code === 'SIN_VIGENCIA') {
      return {
        codigo: 'SIN_VIGENCIA',
        mensaje:
          'No hay precio ni salida disponible para esa fecha — prueba otra fecha o consúltala con la agencia.',
        esErrorAgencia: false,
      };
    }
    if (code === 'VIGENCIAS_EMPATADAS') {
      return {
        codigo: 'VIGENCIAS_EMPATADAS',
        mensaje:
          'El tarifario tiene dos ventanas de vigencia solapadas para esta fecha (error de datos de la agencia).',
        esErrorAgencia: true,
      };
    }
    if (code === 'OPCION_DE_SALIDA_REQUERIDA') {
      return {
        codigo: 'OPCION_DE_SALIDA_REQUERIDA',
        mensaje: 'Este producto se cotiza por opción de salida: elige una antes de cotizar.',
        esErrorAgencia: false,
      };
    }
    if (code === 'TARIFAS_CON_CONDICION_NO_EVALUABLE') {
      return {
        codigo: 'TARIFAS_CON_CONDICION_NO_EVALUABLE',
        mensaje:
          'Este producto tiene tarifa por edad: indica la edad de cada niño (y si el infante ocupa silla) para cotizar.',
        esErrorAgencia: false,
      };
    }
    if (code === 'ACOMODACION_REQUERIDA') {
      return {
        codigo: 'ACOMODACION_REQUERIDA',
        mensaje:
          'Este producto tiene precio por acomodación: elige sencilla, doble, triple o cuádruple para cotizar.',
        esErrorAgencia: false,
      };
    }
    if (code === 'ACOMODACION_NO_DISPONIBLE') {
      return {
        codigo: 'ACOMODACION_NO_DISPONIBLE',
        mensaje:
          'Esa acomodación no tiene precio para esta fecha: elige otra o consúltalo con la agencia.',
        esErrorAgencia: false,
      };
    }
    if (code === 'LINEAS_EN_MONEDAS_DISTINTAS') {
      return {
        codigo: 'LINEAS_EN_MONEDAS_DISTINTAS',
        mensaje:
          'El tarifario mezcla monedas (por ejemplo COP y USD) en esta fecha y no se pueden sumar. Avisa a la agencia para corregirlo.',
        esErrorAgencia: true,
      };
    }
    if (code === 'PASAJEROS_SIN_TARIFA') {
      const texto = 'message' in error ? String(error.message) : '';
      const quienes = /cubre a: (.+?)\.(?:\s|$)/.exec(texto)?.[1];
      return {
        codigo: 'PASAJEROS_SIN_TARIFA',
        mensaje:
          `Ninguna tarifa cubre a ${quienes ?? 'algún pasajero'}, y el total quedaría corto. ` +
          'Revisa las edades o cotiza a mano.',
        esErrorAgencia: false,
      };
    }
    if (code === 'PAQUETE_NO_ENCONTRADO') {
      return {
        codigo: 'PAQUETE_NO_ENCONTRADO',
        mensaje: 'El paquete turístico seleccionado no existe en el catálogo.',
        esErrorAgencia: false,
      };
    }
    if (code === 'SIN_SESION') {
      return {
        codigo: 'SIN_SESION',
        mensaje: 'Falta configurar la agencia activa o iniciar sesión.',
        esErrorAgencia: true,
      };
    }
  }

  const msg = formatearErrorAmigable(error, 'Ocurrió un error inesperado al cotizar.');
  return {
    codigo: 'DESCONOCIDO',
    mensaje: msg,
    esErrorAgencia: false,
  };
}

/** Forma mínima de una opción de salida para decidir si hay que elegir (contrato `Paquete`). */
interface OpcionElegible {
  id: string;
  activa: boolean;
  orden: number;
}

/** Solo las opciones activas, en su orden. Las inactivas no se ofrecen ni se envían. */
export function opcionesActivasDeSalida<T extends OpcionElegible>(
  opciones: readonly T[] | undefined | null,
): T[] {
  return (opciones ?? []).filter((o) => o.activa).sort((a, b) => a.orden - b.orden);
}

/**
 * La opción de salida a enviar a la API: la elegida si sigue siendo una opción activa del
 * producto. `undefined` si el producto no tiene opciones (nada cambia) o no hay elección válida.
 */
export function opcionDeSalidaAEnviar(
  opciones: readonly OpcionElegible[] | undefined | null,
  elegidaId: string,
): string | undefined {
  return opcionesActivasDeSalida(opciones).find((o) => o.id === elegidaId)?.id;
}

/** `true` si el producto tiene opciones activas y todavía no hay una elegida válida. */
export function faltaElegirOpcionDeSalida(
  opciones: readonly OpcionElegible[] | undefined | null,
  elegidaId: string,
): boolean {
  return (
    opcionesActivasDeSalida(opciones).length > 0 &&
    opcionDeSalidaAEnviar(opciones, elegidaId) === undefined
  );
}

/**
 * Motor de cálculo puro para simulación local y desarrollo offline
 */
export function calcularCotizacionMock(
  entrada: CotizarPaquete,
  paquete: PaqueteConDetalle,
): CotizacionCalculada {
  const vigencia =
    paquete.vigencias.find(
      (v) => entrada.fechaSalida >= v.desde && entrada.fechaSalida <= v.hasta,
    ) ?? paquete.vigencias[0];
  if (!vigencia) throw new Error('El simulador necesita al menos una vigencia con tarifas');

  const totalPasajeros =
    entrada.pasajeros.adultos + entrada.pasajeros.ninos + entrada.pasajeros.infantes;
  const totalPagantes = entrada.pasajeros.adultos + entrada.pasajeros.ninos;

  let acomodacionElegida: Acomodacion = entrada.acomodacion ?? 'DOBLE';
  if (!entrada.acomodacion) {
    if (totalPagantes === 1) acomodacionElegida = 'SENCILLA';
    else if (totalPagantes === 3) acomodacionElegida = 'TRIPLE';
    else if (totalPagantes >= 4 && totalPagantes % 4 === 0) acomodacionElegida = 'CUADRUPLE';
    else acomodacionElegida = 'DOBLE';
  }

  const capacidadHab = CAPACIDAD_ACOMODACION[acomodacionElegida];
  const numHabitaciones = Math.max(1, Math.ceil(totalPagantes / capacidadHab));
  const plazasTotales = numHabitaciones * capacidadHab;
  let plazasSinUsar = Math.max(0, plazasTotales - totalPagantes);
  if (paquete.noches === 0) {
    plazasSinUsar = 0;
  }

  const habitaciones: Habitacion[] = [];
  let restantes = totalPasajeros;
  for (let i = 0; i < numHabitaciones; i++) {
    const ocupantes = Math.min(capacidadHab, restantes);
    habitaciones.push({
      acomodacion: acomodacionElegida,
      ocupantes: Math.max(1, ocupantes),
    });
    restantes = Math.max(0, restantes - ocupantes);
  }

  const markupFactor = 1 + (entrada.markupExtra ?? 0) / 100;
  const lineas: LineaCotizacion[] = [];
  let sumaVentaBigInt = 0n;
  let sumaNetoBigInt = 0n;

  const grupos = [
    { tipo: 'ADT' as const, cant: entrada.pasajeros.adultos },
    { tipo: 'CHD' as const, cant: entrada.pasajeros.ninos },
    { tipo: 'INF' as const, cant: entrada.pasajeros.infantes },
  ];

  for (const g of grupos) {
    if (g.cant <= 0) continue;
    const precioBase =
      vigencia.tarifas.find(
        (t) =>
          t.condicion?.acomodacion === acomodacionElegida && t.condicion?.tipoPasajero === g.tipo,
      ) ??
      vigencia.tarifas.find((t) => t.condicion?.tipoPasajero === g.tipo) ??
      vigencia.tarifas[0];
    if (!precioBase) throw new Error('La vigencia del simulador no tiene tarifas');

    const ventaUnit = Math.round(Number(precioBase.venta.unidades) * markupFactor);
    const subtotalVenta = ventaUnit * g.cant;
    // El tarifario de muestra siempre trae el neto; la API real ya no lo entrega sin `incluirMargen`.
    if (!precioBase.neto) throw new Error('El simulador necesita el neto del tarifario de muestra');
    const netoUnit = Number(precioBase.neto.unidades);
    const subtotalNeto = netoUnit * g.cant;

    sumaVentaBigInt += BigInt(subtotalVenta);
    sumaNetoBigInt += BigInt(subtotalNeto);

    lineas.push({
      tipoPasajero: g.tipo,
      cantidad: g.cant,
      precioUnitarioVenta: {
        unidades: String(ventaUnit),
        moneda: 'COP',
      },
      subtotalVenta: {
        unidades: String(subtotalVenta),
        moneda: 'COP',
      },
      subtotalNeto: {
        unidades: String(subtotalNeto),
        moneda: 'COP',
      },
    });
  }

  const salidaDate = new Date(entrada.fechaSalida);
  const regresoDate = new Date(salidaDate.getTime() + (paquete.dias - 1) * 24 * 60 * 60 * 1000);
  const fechaRegreso = regresoDate.toISOString().slice(0, 10);

  const margenBigInt = sumaVentaBigInt - sumaNetoBigInt;
  const margenPorcentaje =
    sumaVentaBigInt > 0n ? (Number(margenBigInt) / Number(sumaVentaBigInt)) * 100 : 0;

  const cotizacionResultado: CotizacionCalculada = {
    paqueteId: paquete.id,
    paqueteNombre: paquete.nombre,
    destino: paquete.destino,
    fechaSalida: entrada.fechaSalida,
    fechaRegreso,
    temporadaNombre: `Vigencia del ${vigencia.desde} al ${vigencia.hasta}`,
    acomodacion: acomodacionElegida,
    habitaciones,
    plazasSinUsar,
    lineas,
    totalVenta: {
      unidades: String(sumaVentaBigInt),
      moneda: 'COP',
    },
    totalNeto: {
      unidades: String(sumaNetoBigInt),
      moneda: 'COP',
    },
    margen: {
      unidades: String(margenBigInt),
      moneda: 'COP',
    },
    margenPorcentaje,
  };

  return EsquemaCotizacion.parse(cotizacionResultado);
}

// ─── Selector de acomodación (T-188 / T-219) ───────────────────────────────

/** Orden de ocupación; el mismo que devuelve la API. */
export const ACOMODACIONES_EN_ORDEN: readonly Acomodacion[] = [
  'SENCILLA',
  'DOBLE',
  'TRIPLE',
  'CUADRUPLE',
];

export const ETIQUETA_ACOMODACION: Record<Acomodacion, string> = {
  SENCILLA: 'Sencilla (1 persona)',
  DOBLE: 'Doble (2 personas)',
  TRIPLE: 'Triple (3 personas)',
  CUADRUPLE: 'Cuádruple (4 personas)',
};

interface FuenteDeAcomodaciones {
  /** Salidas publicadas que ya trajo el catálogo (cada una puede traer su lista). */
  salidas: readonly Pick<SalidaPublicada, 'paqueteId' | 'fecha' | 'acomodacionesDisponibles'>[];
  paqueteId: string;
  fecha: string;
  /** La última cotización real recibida, si la hay. */
  cotizacion: Pick<CotizacionDeSalida, 'acomodacionesDisponibles'> | null;
  /** `true` si la API ya respondió ACOMODACION_REQUERIDA/NO_DISPONIBLE sin traer la lista. */
  pedidaPorLaApi: boolean;
}

/**
 * Las acomodaciones que ofrece el selector. Vacío = no se muestra.
 *
 * Prioridad: la lista de la cotización (la más precisa: ya filtra por opción de salida), la de la
 * salida publicada elegida (se conoce ANTES del primer cálculo) y, como último recurso para
 * vigencias abiertas sin lista, las cuatro una vez que la API dijo que hace falta (comportamiento
 * de T-188). Siempre en orden de ocupación y sin repetir.
 */
export function acomodacionesParaElSelector(f: FuenteDeAcomodaciones): Acomodacion[] {
  const delaSalida = f.salidas.find(
    (s) => s.paqueteId === f.paqueteId && s.fecha === f.fecha,
  )?.acomodacionesDisponibles;
  const lista = f.cotizacion?.acomodacionesDisponibles ?? delaSalida;
  if (lista && lista.length > 0) {
    return ACOMODACIONES_EN_ORDEN.filter((a) => lista.includes(a));
  }
  return f.pedidaPorLaApi ? [...ACOMODACIONES_EN_ORDEN] : [];
}

/** Hoy como AAAA-MM-DD en la zona del tenant (R9): sin desfase por UTC. */
export function fechaDeHoy(ahora: Date = new Date(), zona: string = ZONA_HORARIA_COLOMBIA): string {
  const { anio, mes, dia } = fechaLocalEnZona(ahora, zona);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${String(anio).padStart(4, '0')}-${dos(mes)}-${dos(dia)}`;
}

/**
 * Fecha por omisión del cotizador: la primera salida disponible del paquete (en o después de
 * `hoy`); si no hay salidas, `hoy`.
 */
export function fechaPorOmision(
  salidas: readonly { paqueteId: string; fecha: string }[],
  paqueteId: string,
  hoy: string,
): string {
  const fechas = salidas
    .filter((s) => s.paqueteId === paqueteId && s.fecha >= hoy)
    .map((s) => s.fecha)
    .sort();
  return fechas[0] ?? hoy;
}
