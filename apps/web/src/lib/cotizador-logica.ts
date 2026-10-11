import type {
  Acomodacion,
  CotizacionCalculada,
  CotizarPaquete,
  Habitacion,
  LineaCotizacion,
} from '@viajapro/contracts';
import { CotizacionCalculada as EsquemaCotizacion } from '@viajapro/contracts';
import type { PaqueteConDetalle } from './mock-catalogo';
import { formatearDinero } from './api';

const CAPACIDAD_ACOMODACION: Record<Acomodacion, number> = {
  SENCILLA: 1,
  DOBLE: 2,
  TRIPLE: 3,
  CUADRUPLE: 4,
};

/**
 * Genera el texto formateado para enviar la propuesta comercial por WhatsApp.
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

  texto += `\n\n_¿Deseas confirmar la reserva o requieres ajustar fechas o pasajeros? Quedo atento a tus comentarios._`;

  return texto;
}

/**
 * Motor de cálculo puro para simulación local y desarrollo offline
 * cuando la API backend no está disponible.
 * Garantiza concordancia total con el esquema Zod CotizacionCalculada.
 */
export function calcularCotizacionMock(
  entrada: CotizarPaquete,
  paquete: PaqueteConDetalle,
): CotizacionCalculada {
  // 1. Determinar temporada
  const temporada =
    paquete.temporadas.find(
      (t) => entrada.fechaSalida >= t.desde && entrada.fechaSalida <= t.hasta,
    ) ?? paquete.temporadas[0]!;

  // 2. Determinar acomodación sugerida si no se indicó
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
  const plazasSinUsar = Math.max(0, plazasTotales - totalPagantes);

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

  // 3. Precios y líneas
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

    // Buscar precio en la temporada para esta acomodación y tipo
    const precioBase =
      temporada.precios.find(
        (p) => p.acomodacion === acomodacionElegida && p.tipoPasajero === g.tipo,
      ) ??
      temporada.precios.find((p) => p.tipoPasajero === g.tipo) ??
      temporada.precios[0]!;

    const ventaUnit = Math.round(Number(precioBase.venta.unidades) * markupFactor);
    const subtotalVenta = ventaUnit * g.cant;
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

  // Fecha regreso estimada
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
    temporadaNombre: temporada.nombre,
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

  // Validar exhaustivamente contra el esquema oficial Zod
  return EsquemaCotizacion.parse(cotizacionResultado);
}
