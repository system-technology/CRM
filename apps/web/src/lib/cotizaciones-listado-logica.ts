import {
  type FilaDeCotizacion,
  type PaginaDeCotizaciones,
  type ListarCotizaciones,
  type EstadoCotizacion,
  type CotizacionGuardada,
  FilaDeCotizacion as EsquemaFilaDeCotizacion,
  PaginaDeCotizaciones as EsquemaPaginaDeCotizaciones,
} from '@viajapro/contracts';
import { obtenerUltimaVersion } from './cotizaciones-logica';

export interface ResumenVisualCotizacion {
  id: string;
  contactoId: string;
  contactoNombre?: string;
  oportunidadId: string | null;
  titulo: string;
  estado: EstadoCotizacion;
  creadaEn: string;
  ultimaVersionEn: string;
  numeroDeVersiones: number;
  paqueteNombre: string;
  fechaSalida: string;
  totalUnidades: string;
  moneda: string;
}

/**
 * Convierte una CotizacionGuardada (con sus versiones completas) en una FilaDeCotizacion
 * conforme al contrato oficial de @viajapro/contracts.
 * Regla R10: Cero exposición de neto o margen.
 */
export function cotizacionGuardadaAFila(cot: CotizacionGuardada): FilaDeCotizacion {
  const ultima = obtenerUltimaVersion(cot.versiones);
  return EsquemaFilaDeCotizacion.parse({
    id: cot.id,
    contactoId: cot.contactoId,
    oportunidadId: cot.oportunidadId,
    titulo: cot.titulo,
    estado: cot.estado,
    versionEnviada: cot.versionEnviada,
    enviadaEn: cot.enviadaEn,
    creadaEn: cot.creadaEn,
    ultimaVersionEn: ultima?.creadaEn ?? cot.actualizadaEn,
    numeroDeVersiones: cot.versiones.length,
    paqueteNombre: ultima?.paqueteNombre ?? 'Paquete sin nombre',
    fechaSalida: ultima?.fechaSalida ?? '2026-10-01',
    venta: ultima?.venta ?? { unidades: '0', moneda: 'COP' },
  });
}

/**
 * Deriva el resumen visual a partir de una FilaDeCotizacion del contrato.
 * Cero tipos redefinidos (R3) y cero filtración de margen/neto (R10).
 */
export function extraerResumenVisualCotizacion(
  fila: FilaDeCotizacion,
  nombreContacto?: string,
): ResumenVisualCotizacion {
  return {
    id: fila.id,
    contactoId: fila.contactoId,
    ...(nombreContacto ? { contactoNombre: nombreContacto } : {}),
    oportunidadId: fila.oportunidadId,
    titulo: fila.titulo,
    estado: fila.estado,
    creadaEn: fila.creadaEn,
    ultimaVersionEn: fila.ultimaVersionEn,
    numeroDeVersiones: fila.numeroDeVersiones,
    paqueteNombre: fila.paqueteNombre,
    fechaSalida: fila.fechaSalida,
    totalUnidades: fila.venta.unidades,
    moneda: fila.venta.moneda,
  };
}

/**
 * Filtra filas de cotización por texto en título, paquete, fecha o cliente.
 */
export function filtrarFilasCotizacion(
  filas: FilaDeCotizacion[],
  busqueda: string,
  mapaContactos: Record<string, string> = {},
): FilaDeCotizacion[] {
  const termino = busqueda.trim().toLowerCase();
  if (!termino) return filas;

  return filas.filter((f) => {
    if (f.titulo.toLowerCase().includes(termino)) return true;
    if (f.paqueteNombre.toLowerCase().includes(termino)) return true;
    if (f.fechaSalida.toLowerCase().includes(termino)) return true;

    const nombre = mapaContactos[f.contactoId];
    if (nombre && nombre.toLowerCase().includes(termino)) return true;

    return false;
  });
}

/**
 * Simula la paginación por cursor sobre un arreglo de filas para el modo offline / sin API.
 * Garantiza cumplimiento estricto del contrato PaginaDeCotizaciones.
 */
export function paginarPorCursor(
  filas: FilaDeCotizacion[],
  cursor?: string,
  limite = 25,
): PaginaDeCotizaciones {
  const limiteValido = Math.max(1, Math.min(limite, 100));

  let inicio = 0;
  if (cursor) {
    const idx = filas.findIndex((f) => f.id === cursor);
    if (idx !== -1) {
      inicio = idx + 1;
    }
  }

  const hayMas = filas.length > inicio + limiteValido;
  const datos = filas.slice(inicio, inicio + limiteValido);
  const ultima = datos[datos.length - 1];
  const nextCursor = hayMas && ultima ? ultima.id : null;

  return EsquemaPaginaDeCotizaciones.parse({
    datos,
    pageInfo: {
      nextCursor,
      hasMore: hayMas,
    },
  });
}

/**
 * Genera filas de cotización simuladas para pruebas de estrés y rendimiento (500 cotizaciones).
 * Tipado estricto con FilaDeCotizacion de @viajapro/contracts.
 */
export function generarCotizacionesSimuladasLote(cantidad: number): FilaDeCotizacion[] {
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

  const estados: EstadoCotizacion[] = ['BORRADOR', 'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'VENCIDA'];
  const resultado: FilaDeCotizacion[] = [];

  for (let i = 1; i <= cantidad; i++) {
    const pad = String(i).padStart(4, '0');
    const destino = destinos[i % destinos.length] || 'Destino Nacional';
    const cliente = nombresClientes[i % nombresClientes.length] || 'Cliente Especial';
    const totalPesos = (2500000 + (i % 20) * 450000).toString();
    const fechaSalida = '2026-11-15';
    const estado = estados[i % estados.length]!;
    const fechaCreacion = new Date(Date.now() - i * 3600000).toISOString();

    resultado.push({
      id: `01932000-0000-7000-8000-${pad}00000000`,
      contactoId: `00000000-0002-4000-8000-${pad}00000001`,
      oportunidadId: null,
      titulo: `Cotización ${cliente} — ${destino}`,
      estado,
      versionEnviada: estado === 'ENVIADA' || estado === 'ACEPTADA' ? 1 : null,
      enviadaEn: estado === 'ENVIADA' || estado === 'ACEPTADA' ? fechaCreacion : null,
      creadaEn: fechaCreacion,
      ultimaVersionEn: fechaCreacion,
      numeroDeVersiones: 1 + (i % 3),
      paqueteNombre: `Paquete Turístico Premium — ${destino}`,
      fechaSalida,
      venta: { unidades: totalPesos, moneda: 'COP' },
    });
  }

  return resultado;
}

export type { ListarCotizaciones, PaginaDeCotizaciones, FilaDeCotizacion, EstadoCotizacion };
