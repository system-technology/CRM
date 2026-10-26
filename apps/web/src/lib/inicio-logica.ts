/**
 * Lógica de agregación para la pantalla de inicio del asesor (T-020)
 *
 * Transforma los datos reales de la API (Bandeja, Pipeline CRM y Cotizaciones)
 * en métricas ejecutivas operativas para el asesor comercial.
 * Cumple R3: Esquemas Zod oficiales de @viajapro/contracts.
 */

import type {
  ConversacionResumen,
  ContadoresBandeja,
  TableroPipeline,
  FilaDeCotizacion,
} from '@viajapro/contracts';

export interface MetricasConversacionesInicio {
  totalPendientes: number;
  sinResponder: number;
  ventanaCritica: number;
  sinAsignar: number;
  itemsUrgentes: Array<{
    id: string;
    contactoNombre: string;
    contactoTelefono: string;
    ultimoMensaje: string;
    instanteUltimoMensaje: string;
    esUrgente: boolean;
  }>;
}

export interface MetricaEtapaPipeline {
  id: string;
  nombre: string;
  color: string;
  cantidad: number;
  valorCop: number;
}

export interface MetricasPipelineInicio {
  totalOportunidades: number;
  valorTotalCop: number;
  etapas: MetricaEtapaPipeline[];
  oportunidadesDestacadas: Array<{
    id: string;
    contactoNombre: string;
    etapaNombre: string;
    valorCop: number;
  }>;
}

export interface CotizacionItemInicio {
  id: string;
  titulo: string;
  contactoId: string;
  paqueteNombre: string;
  fechaSalida: string;
  totalCop: number;
  estado: string;
  vigenteHasta?: string | undefined;
  esCritica: boolean;
}

export interface MetricasCotizacionesInicio {
  totalPorVencer: number;
  enviadas: number;
  borradores: number;
  proximas: CotizacionItemInicio[];
}

const COLORES_POR_DEFECTO: Record<string, string> = {
  NUEVO_LEAD: '#0F766E', // teal
  EN_COTIZACION: '#0284C7', // sky
  EN_NEGOCIACION: '#D97706', // amber
  GANADA: '#16A34A', // green
  PERDIDA: '#DC2626', // red
};

/**
 * 1. Agrega métricas operativas de la bandeja de conversaciones de WhatsApp.
 */
export function agregarMetricasConversaciones(
  conversaciones: ConversacionResumen[],
  contadores?: ContadoresBandeja,
): MetricasConversacionesInicio {
  let sinResponder = 0;
  let ventanaCritica = 0;
  let sinAsignar = 0;

  const ahora = Date.now();
  const UMBRAL_4_HORAS_MS = 4 * 60 * 60 * 1000;

  const itemsUrgentes: MetricasConversacionesInicio['itemsUrgentes'] = [];

  for (const conv of conversaciones) {
    const noLeida = conv.mensajesSinLeer > 0;
    const noAsignada = !conv.asignadoAId;

    if (noAsignada) sinAsignar++;
    if (noLeida) sinResponder++;

    let esCriticaVentana = false;
    if (conv.ventana.abierta && conv.ventana.expiraEn) {
      const expira = new Date(conv.ventana.expiraEn).getTime();
      const restante = expira - ahora;
      if (restante > 0 && restante <= UMBRAL_4_HORAS_MS) {
        ventanaCritica++;
        esCriticaVentana = true;
      }
    }

    if (noLeida || esCriticaVentana || noAsignada) {
      itemsUrgentes.push({
        id: conv.id,
        contactoNombre: conv.contactoNombre || conv.contactoTelefono || 'Cliente WhatsApp',
        contactoTelefono: conv.contactoTelefono,
        ultimoMensaje: conv.ultimoMensajeTexto || 'Consulta entrante...',
        instanteUltimoMensaje: conv.ultimoMensajeEn || new Date().toISOString(),
        esUrgente: esCriticaVentana || noLeida,
      });
    }
  }

  const totalCalculado = sinResponder + sinAsignar + ventanaCritica;
  const total = contadores
    ? (contadores.conversacionesSinLeer || 0) + (contadores.sinAsignar || 0)
    : totalCalculado;

  return {
    totalPendientes: total > 0 ? total : conversaciones.length > 0 ? itemsUrgentes.length : 0,
    sinResponder: contadores?.conversacionesSinLeer ?? sinResponder,
    ventanaCritica,
    sinAsignar: contadores?.sinAsignar ?? sinAsignar,
    itemsUrgentes: itemsUrgentes.slice(0, 5),
  };
}

/**
 * 2. Agrega métricas y distribución del pipeline comercial por etapa.
 */
export function agregarMetricasPipeline(tablero: TableroPipeline): MetricasPipelineInicio {
  let totalOportunidades = 0;
  let valorTotalCop = 0;

  const etapas: MetricaEtapaPipeline[] = [];
  const destacadas: MetricasPipelineInicio['oportunidadesDestacadas'] = [];

  for (const col of tablero.columnas) {
    let valorEtapaCop = 0;

    for (const op of col.oportunidades) {
      totalOportunidades++;
      const val = op.valorEstimado ? Number(op.valorEstimado.unidades) : 0;
      valorEtapaCop += val;
      valorTotalCop += val;

      if (destacadas.length < 5) {
        destacadas.push({
          id: op.id,
          contactoNombre: op.contactoNombre ?? 'Cliente sin nombre',
          etapaNombre: col.etapa.nombre,
          valorCop: val,
        });
      }
    }

    const color = (col.etapa.clave && COLORES_POR_DEFECTO[col.etapa.clave]) || '#0F766E';

    etapas.push({
      id: col.etapa.id,
      nombre: col.etapa.nombre,
      color,
      cantidad: col.oportunidades.length,
      valorCop: valorEtapaCop,
    });
  }

  // Ordenar destacadas por valor descendente
  destacadas.sort((a, b) => b.valorCop - a.valorCop);

  return {
    totalOportunidades,
    valorTotalCop,
    etapas,
    oportunidadesDestacadas: destacadas,
  };
}

/**
 * 3. Agrega cotizaciones pendientes por vencer y seguimiento comercial.
 */
export function agregarMetricasCotizaciones(
  cotizaciones: FilaDeCotizacion[],
  fechaReferencia: Date = new Date(),
): MetricasCotizacionesInicio {
  let enviadas = 0;
  let borradores = 0;
  let totalPorVencer = 0;

  const refTime = fechaReferencia.getTime();
  const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;
  const proximas: CotizacionItemInicio[] = [];

  for (const cot of cotizaciones) {
    if (cot.estado === 'ENVIADA') enviadas++;
    if (cot.estado === 'BORRADOR') borradores++;

    const valorCop = Number(cot.venta.unidades);

    // Si tiene fecha de viaje próxima o fue enviada
    let esCritica = false;
    let dentroDeVentana = false;

    if (cot.fechaSalida) {
      const salidaTime = new Date(cot.fechaSalida).getTime();
      const diff = salidaTime - refTime;
      if (diff > 0 && diff <= SIETE_DIAS_MS) {
        dentroDeVentana = true;
        totalPorVencer++;
        if (diff <= 2 * 24 * 60 * 60 * 1000) {
          esCritica = true;
        }
      }
    }

    if (cot.estado === 'ENVIADA') {
      dentroDeVentana = true;
      totalPorVencer++;
    }

    if (dentroDeVentana || cot.estado === 'ENVIADA') {
      proximas.push({
        id: cot.id,
        titulo: cot.titulo,
        contactoId: cot.contactoId,
        paqueteNombre: cot.paqueteNombre,
        fechaSalida: cot.fechaSalida,
        totalCop: valorCop,
        estado: cot.estado,
        esCritica,
      });
    }
  }

  // Ordenar críticas primero, luego por monto
  proximas.sort((a, b) => {
    if (a.esCritica && !b.esCritica) return -1;
    if (!a.esCritica && b.esCritica) return 1;
    return b.totalCop - a.totalCop;
  });

  return {
    totalPorVencer: totalPorVencer > 0 ? totalPorVencer : enviadas,
    enviadas,
    borradores,
    proximas: proximas.slice(0, 5),
  };
}
