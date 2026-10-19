import type { CotizacionGuardada, VersionDeCotizacion } from '@viajapro/contracts';
import { obtenerUltimaVersion } from './cotizaciones-logica';

export type CriterioOrdenCotizaciones = 'fecha_desc' | 'fecha_asc' | 'total_desc' | 'total_asc';

export interface ResumenVisualCotizacion {
  id: string;
  titulo: string;
  contactoId?: string;
  contactoNombre?: string;
  estado: CotizacionGuardada['estado'];
  creadaEn: string;
  actualizadaEn: string;
  versionNumero: number;
  totalVersiones: number;
  paqueteNombre: string;
  destino: string;
  fechaSalida: string;
  totalUnidades: string;
  moneda: string;
  pasajerosTotal: number;
}

/**
 * Extrae de forma segura el resumen comercial de la última versión para la tabla/tarjeta.
 * R8 y R10: solo expone importes de venta (`venta.unidades`), nunca netos ni margen.
 */
export function extraerResumenVisualCotizacion(
  cotizacion: CotizacionGuardada,
  nombreContacto?: string,
): ResumenVisualCotizacion {
  const ultima = obtenerUltimaVersion(cotizacion.versiones);

  const totalUnidades = ultima?.venta?.unidades ?? '0';
  const moneda = ultima?.venta?.moneda ?? 'COP';
  const pasajerosTotal = (ultima?.adultos ?? 0) + (ultima?.ninos ?? 0) + (ultima?.infantes ?? 0);

  return {
    id: cotizacion.id,
    titulo: cotizacion.titulo,
    ...(cotizacion.contactoId ? { contactoId: cotizacion.contactoId } : {}),
    ...(nombreContacto ? { contactoNombre: nombreContacto } : {}),
    estado: cotizacion.estado,
    creadaEn: cotizacion.creadaEn,
    actualizadaEn: cotizacion.actualizadaEn,
    versionNumero: ultima?.numero ?? 1,
    totalVersiones: cotizacion.versiones.length,
    paqueteNombre: ultima?.paqueteNombre ?? 'Paquete sin nombre',
    destino: ultima?.destino ?? 'Destino no especificado',
    fechaSalida: ultima?.fechaSalida ?? 'Fecha por definir',
    totalUnidades,
    moneda,
    pasajerosTotal,
  };
}

/**
 * Filtra el listado de cotizaciones por texto en título, destino, paquete o cliente.
 */
export function filtrarCotizaciones(
  cotizaciones: CotizacionGuardada[],
  busqueda: string,
  mapaContactos: Record<string, string> = {},
): CotizacionGuardada[] {
  const termino = busqueda.trim().toLowerCase();
  if (!termino) return cotizaciones;

  return cotizaciones.filter((c) => {
    if (c.titulo.toLowerCase().includes(termino)) return true;

    if (c.contactoId) {
      const nombre = mapaContactos[c.contactoId];
      if (nombre && nombre.toLowerCase().includes(termino)) return true;
    }

    return c.versiones.some(
      (v) =>
        v.paqueteNombre.toLowerCase().includes(termino) ||
        v.destino.toLowerCase().includes(termino) ||
        v.fechaSalida.toLowerCase().includes(termino),
    );
  });
}

/**
 * Ordena cotizaciones por fecha o por total de venta.
 */
export function ordenarCotizaciones(
  cotizaciones: CotizacionGuardada[],
  criterio: CriterioOrdenCotizaciones = 'fecha_desc',
): CotizacionGuardada[] {
  const copia = [...cotizaciones];

  return copia.sort((a, b) => {
    const fechaA = new Date(a.actualizadaEn || a.creadaEn).getTime();
    const fechaB = new Date(b.actualizadaEn || b.creadaEn).getTime();

    if (criterio === 'fecha_desc') return fechaB - fechaA;
    if (criterio === 'fecha_asc') return fechaA - fechaB;

    const totalA = BigInt(obtenerUltimaVersion(a.versiones)?.venta?.unidades || '0');
    const totalB = BigInt(obtenerUltimaVersion(b.versiones)?.venta?.unidades || '0');

    if (criterio === 'total_desc') return totalB > totalA ? 1 : totalB < totalA ? -1 : 0;
    if (criterio === 'total_asc') return totalA > totalB ? 1 : totalA < totalB ? -1 : 0;

    return 0;
  });
}

export interface PaginaResultado<T> {
  items: T[];
  totalItems: number;
  totalPaginas: number;
  paginaActual: number;
  tamanoPagina: number;
}

/**
 * Pagina una lista de elementos para garantizar rendimiento y accesibilidad móvil (e.g. 500 cotizaciones).
 */
export function paginarItems<T>(items: T[], pagina: number, tamanoPagina = 10): PaginaResultado<T> {
  const tamano = Math.max(1, tamanoPagina);
  const totalItems = items.length;
  const totalPaginas = Math.max(1, Math.ceil(totalItems / tamano));
  const paginaAjustada = Math.min(Math.max(1, pagina), totalPaginas);

  const inicio = (paginaAjustada - 1) * tamano;
  const itemsPagina = items.slice(inicio, inicio + tamano);

  return {
    items: itemsPagina,
    totalItems,
    totalPaginas,
    paginaActual: paginaAjustada,
    tamanoPagina: tamano,
  };
}

/**
 * Generador de cotizaciones simuladas para pruebas de carga (e.g. 500 cotizaciones con nombres largos).
 */
export function generarCotizacionesSimuladasLote(cantidad: number): CotizacionGuardada[] {
  const destinos = [
    'San Andrés Islas — Archipiélago de San Andrés, Providencia y Santa Catalina',
    'Cartagena de Indias — Ciudad Amurallada, Islas del Rosario y Barú',
    'Santa Marta — Parque Nacional Natural Tayrona, Bahía Concha y El Rodadero',
    'Eje Cafetero — Recorrido del Café, Valle de Cocora, Salento y Parque del Café',
    'Cancún & Riviera Maya — Todo Incluido, Cenotes Sagrados y Ruinas de Tulum',
  ];

  const nombresClientes = [
    'Dra. María Claudia Restrepo Santamaría de los Ángeles',
    'Ing. Juan Guillermo Echeverry Gómez-Pinzón y Asociados',
    'Sra. Gloria Patricia Fernández de Soto Delgadillo',
    'Lic. Carlos Hernando Betancur Rodríguez de la Torre',
    'Familia Rodríguez-Cárdenas de la Santísima Trinidad',
  ];

  const resultado: CotizacionGuardada[] = [];

  for (let i = 1; i <= cantidad; i++) {
    const pad = String(i).padStart(4, '0');
    const destino = destinos[i % destinos.length] || 'Destino Nacional';
    const cliente = nombresClientes[i % nombresClientes.length] || 'Cliente Especial';
    const totalPesos = (2500000 + (i % 20) * 450000).toString();

    const version: VersionDeCotizacion = {
      id: `01932000-0000-7000-8000-${pad}00000001`,
      numero: 1,
      creadaEn: new Date(Date.now() - i * 3600000).toISOString(),
      paqueteId: `01932000-0000-7000-8000-${pad}00000002`,
      paqueteNombre: `Paquete Turístico Premium — ${destino}`,
      destino,
      noches: 4,
      fechaSalida: '2026-11-15',
      vigenciaId: `01932000-0000-7000-8000-${pad}00000003`,
      vigenciaDesde: '2026-11-01',
      vigenciaHasta: '2026-11-30',
      deSalidaProgramada: true,
      adultos: 2,
      ninos: 1,
      infantes: 0,
      acomodacion: 'TRIPLE',
      politica: {
        porcentaje: 15,
        base: 'SOBRE_EL_NETO',
        origenDeLaVenta: 'DERIVADA_DEL_NETO',
        redondeoVenta: 1000,
      },
      lineas: [
        {
          tarifaId: `01932000-0000-7000-8000-${pad}00000011`,
          nombre: `Tarifa Integral Turística — ${destino}`,
          unidad: 'POR_GRUPO',
          cubrePasajeros: 3,
          veces: 1,
          precioUnitario: { unidades: totalPesos, moneda: 'COP' },
          total: { unidades: totalPesos, moneda: 'COP' },
          masBarata: true,
        },
      ],
      venta: { unidades: totalPesos, moneda: 'COP' },
      vigenteHasta: '2026-11-20',
    };

    const estado = i % 3 === 0 ? 'ACEPTADA' : i % 2 === 0 ? 'ENVIADA' : 'BORRADOR';
    resultado.push({
      id: `01932000-0000-7000-8000-${pad}00000000`,
      contactoId: `00000000-0002-4000-8000-${pad}00000001`,
      oportunidadId: null,
      titulo: `Cotización ${cliente} — ${destino}`,
      estado,
      versionEnviada: estado === 'ENVIADA' || estado === 'ACEPTADA' ? 1 : null,
      enviadaEn: estado === 'ENVIADA' || estado === 'ACEPTADA' ? version.creadaEn : null,
      creadaEn: version.creadaEn,
      actualizadaEn: version.creadaEn,
      versiones: [version],
    });
  }

  return resultado;
}
