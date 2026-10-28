import { FichaDeContacto, Seguimiento } from '@viajapro/contracts';
import { formatearDinero, formatearFecha } from './formato';

export type TipoEvento360 =
  | 'CREACION_CONTACTO'
  | 'OPORTUNIDAD'
  | 'COTIZACION'
  | 'SEGUIMIENTO'
  | 'NOTA_INTERNA'
  | 'VIAJE_CONFIRMADO';

export interface EventoLineaTiempo360 {
  readonly id: string;
  readonly tipo: TipoEvento360;
  readonly titulo: string;
  readonly descripcion: string | null;
  readonly fechaIso: string;
  readonly autor: string | null;
  readonly etiquetaBadge: string | null;
  readonly icono: 'contacto' | 'oportunidad' | 'cotizacion' | 'seguimiento' | 'nota' | 'viaje';
  readonly estado?: 'completado' | 'pendiente' | 'info';
  readonly enlace?: string | null;
}

export interface MetricasContacto360 {
  readonly totalCotizaciones: number;
  readonly cotizacionesMontoTotalCop: number;
  readonly seguimientosPendientes: number;
  readonly tieneOportunidadActiva: boolean;
  readonly valorOportunidadEstimadoCop: number;
  readonly etapaOportunidad: string | null;
}

/**
 * Unifica cronológicamente todos los hitos del contacto en una sola línea de tiempo 360.
 * Ordena de más reciente a más antiguo (reverse chronological order).
 */
export function construirLineaTiempo360(
  ficha: FichaDeContacto,
  seguimientos: readonly Seguimiento[] = [],
): EventoLineaTiempo360[] {
  const eventos: EventoLineaTiempo360[] = [];

  // 1. Alta o creación del contacto
  if (ficha.contacto.creadoEn) {
    eventos.push({
      id: `contacto-creado-${ficha.contacto.id}`,
      tipo: 'CREACION_CONTACTO',
      titulo: 'Contacto registrado en el CRM',
      descripcion: `Canal de origen y registro en el directorio de clientes (${ficha.contacto.telefono}).`,
      fechaIso: ficha.contacto.creadoEn,
      autor: 'Sistema / Asesor',
      etiquetaBadge: 'Registro',
      icono: 'contacto',
      estado: 'info',
    });
  }

  // 2. Oportunidad comercial
  if (ficha.oportunidadActual) {
    const op = ficha.oportunidadActual;
    const valorFormateado = op.valorEstimado ? formatearDinero(op.valorEstimado) : 'Sin estimar';

    eventos.push({
      id: `oportunidad-${op.id}`,
      tipo: 'OPORTUNIDAD',
      titulo: `Oportunidad: ${op.titulo}`,
      descripcion: `Destino: ${op.destino ?? 'Por definir'} · Valor estimado: ${valorFormateado} · Etapa: ${op.etapa.nombre}.`,
      fechaIso: op.creadaEn,
      autor: op.asesorNombre ?? 'Asesor comercial',
      etiquetaBadge: op.etapa.nombre,
      icono: 'oportunidad',
      estado: op.etapa.esGanada ? 'completado' : op.etapa.esPerdida ? 'info' : 'pendiente',
    });
  }

  // 3. Cotizaciones
  for (const cot of ficha.cotizaciones) {
    const fecha = cot.enviadaEn ?? ficha.contacto.ultimoContactoEn ?? ficha.contacto.creadoEn;
    const precio = formatearDinero(cot.precioVenta);

    eventos.push({
      id: `cotizacion-${cot.id}`,
      tipo: 'COTIZACION',
      titulo: `Cotización v${cot.version}: ${cot.titulo}`,
      descripcion: `Precio de venta: ${precio}${cot.vigenteHasta ? ` · Vence: ${formatearFecha(cot.vigenteHasta)}` : ''}`,
      fechaIso: fecha,
      autor: 'Asesor Comercial',
      etiquetaBadge: `v${cot.version}`,
      icono: 'cotizacion',
      estado: 'info',
      enlace: `/cotizaciones/${cot.id}`,
    });
  }

  // 4. Notas internas
  for (const nota of ficha.notasInternas) {
    eventos.push({
      id: `nota-${nota.id}`,
      tipo: 'NOTA_INTERNA',
      titulo: 'Nota interna de asesoría',
      descripcion: nota.texto,
      fechaIso: nota.escritaEn,
      autor: nota.autorNombre ?? 'Asesor comercial',
      etiquetaBadge: 'Nota',
      icono: 'nota',
      estado: 'info',
    });
  }

  // 5. Seguimientos comerciales
  for (const seg of seguimientos) {
    const esCompletado = seg.completadoEn !== null;
    const fecha = seg.completadoEn ?? seg.venceEn;

    eventos.push({
      id: `seguimiento-${seg.id}`,
      tipo: 'SEGUIMIENTO',
      titulo: esCompletado
        ? `Seguimiento cumplido: ${seg.descripcion}`
        : `Compromiso: ${seg.descripcion}`,
      descripcion: `Asignado a: ${seg.asesorNombre ?? 'Equipo comercial'}${seg.oportunidadTitulo ? ` · En oportunidad: ${seg.oportunidadTitulo}` : ''}`,
      fechaIso: fecha,
      autor: seg.asesorNombre,
      etiquetaBadge: esCompletado ? 'Completado' : 'Pendiente',
      icono: 'seguimiento',
      estado: esCompletado ? 'completado' : 'pendiente',
    });
  }

  // 6. Archivos de viaje confirmados
  for (const archivoId of ficha.archivosDeViajeIds) {
    eventos.push({
      id: `archivo-${archivoId}`,
      tipo: 'VIAJE_CONFIRMADO',
      titulo: 'Reserva confirmada y archivo de viaje creado',
      descripcion: `Expediente operativo #${archivoId.slice(0, 8)}. Documentación y vouchers de servicios listos.`,
      fechaIso: ficha.contacto.ultimoContactoEn ?? ficha.contacto.creadoEn,
      autor: 'Operaciones',
      etiquetaBadge: 'Confirmado',
      icono: 'viaje',
      estado: 'completado',
      enlace: '/viajes',
    });
  }

  // Ordenar de más reciente a más antiguo
  return eventos.sort((a, b) => {
    const tiempoA = new Date(a.fechaIso).getTime();
    const tiempoB = new Date(b.fechaIso).getTime();
    return tiempoB - tiempoA;
  });
}

/**
 * Calcula métricas sintéticas para el resumen 360 del contacto.
 */
export function calcularMetricasContacto360(
  ficha: FichaDeContacto,
  seguimientos: readonly Seguimiento[] = [],
): MetricasContacto360 {
  const totalCotizaciones = ficha.cotizaciones.length;

  let cotizacionesMontoTotalCop = 0;
  for (const cot of ficha.cotizaciones) {
    if (cot.precioVenta.moneda === 'COP') {
      const unidades = Number(cot.precioVenta.unidades);
      if (Number.isFinite(unidades)) {
        cotizacionesMontoTotalCop += unidades;
      }
    }
  }

  const seguimientosPendientes = seguimientos.filter((s) => s.completadoEn === null).length;

  const tieneOportunidadActiva =
    ficha.oportunidadActual !== null &&
    !ficha.oportunidadActual.etapa.esGanada &&
    !ficha.oportunidadActual.etapa.esPerdida;

  let valorOportunidadEstimadoCop = 0;
  if (ficha.oportunidadActual?.valorEstimado?.moneda === 'COP') {
    const u = Number(ficha.oportunidadActual.valorEstimado.unidades);
    if (Number.isFinite(u)) valorOportunidadEstimadoCop = u;
  }

  return {
    totalCotizaciones,
    cotizacionesMontoTotalCop,
    seguimientosPendientes,
    tieneOportunidadActiva,
    valorOportunidadEstimadoCop,
    etapaOportunidad: ficha.oportunidadActual?.etapa.nombre ?? null,
  };
}
