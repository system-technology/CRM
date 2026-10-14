import type {
  Acomodacion,
  CotizacionCalculada,
  CotizacionDeSalida,
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
        mensaje: 'Falta configurar el identificador de la agencia (x-dev-tenant-id).',
        esErrorAgencia: true,
      };
    }
  }

  const msg = error instanceof Error ? error.message : 'Ocurrió un error inesperado al cotizar.';
  return {
    codigo: 'DESCONOCIDO',
    mensaje: msg,
    esErrorAgencia: false,
  };
}

/**
 * Motor de cálculo puro para simulación local y desarrollo offline
 */
export function calcularCotizacionMock(
  entrada: CotizarPaquete,
  paquete: PaqueteConDetalle,
): CotizacionCalculada {
  const temporada =
    paquete.temporadas.find(
      (t) => entrada.fechaSalida >= t.desde && entrada.fechaSalida <= t.hasta,
    ) ?? paquete.temporadas[0]!;

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

  return EsquemaCotizacion.parse(cotizacionResultado);
}
