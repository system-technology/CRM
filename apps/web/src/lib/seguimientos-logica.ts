import type { Seguimiento } from '@viajapro/contracts';
import { formatearFecha } from './formato';

export type TipoCategoriaSeguimiento = 'TODOS' | 'VENCIDOS' | 'HOY' | 'PROXIMOS' | 'COMPLETADOS';

export interface MetricasSeguimientos {
  total: number;
  pendientes: number;
  vencidos: number;
  deHoy: number;
  proximos: number;
  completados: number;
}

/**
 * Clasifica un seguimiento según su estado de cumplimiento y su proximidad en el tiempo.
 * Regla R9: La comparación de fechas respeta el inicio y fin del día local.
 */
export function clasificarSeguimiento(
  seguimiento: Seguimiento,
  ahora: Date = new Date(),
): 'VENCIDO' | 'HOY' | 'PROXIMO' | 'COMPLETADO' {
  if (seguimiento.completadoEn !== null) {
    return 'COMPLETADO';
  }

  const hoyStr = ahora.toISOString().slice(0, 10);
  const inicioHoy = new Date(`${hoyStr}T00:00:00.000Z`).getTime();
  const finHoy = new Date(`${hoyStr}T23:59:59.999Z`).getTime();
  const venceMs = new Date(seguimiento.venceEn).getTime();

  if (venceMs < inicioHoy) {
    return 'VENCIDO';
  }
  if (venceMs <= finHoy) {
    return 'HOY';
  }
  return 'PROXIMO';
}

/**
 * Calcula las métricas acumuladas de seguimientos para visualización en tarjetas de resumen.
 */
export function calcularMetricasSeguimientos(
  seguimientos: readonly Seguimiento[],
  ahora: Date = new Date(),
): MetricasSeguimientos {
  let vencidos = 0;
  let deHoy = 0;
  let proximos = 0;
  let completados = 0;

  for (const s of seguimientos) {
    const cat = clasificarSeguimiento(s, ahora);
    switch (cat) {
      case 'VENCIDO':
        vencidos++;
        break;
      case 'HOY':
        deHoy++;
        break;
      case 'PROXIMO':
        proximos++;
        break;
      case 'COMPLETADO':
        completados++;
        break;
    }
  }

  return {
    total: seguimientos.length,
    pendientes: vencidos + deHoy + proximos,
    vencidos,
    deHoy,
    proximos,
    completados,
  };
}

export interface OpcionesFiltradoSeguimientos {
  seguimientos: readonly Seguimiento[];
  categoria: TipoCategoriaSeguimiento;
  busqueda?: string;
  asesorId?: string;
  ahora?: Date;
}

/**
 * Filtra y ordena seguimientos de acuerdo a categoría seleccionada, búsqueda libre y asesor asignado.
 */
export function filtrarYOrdenarSeguimientos({
  seguimientos,
  categoria,
  busqueda = '',
  asesorId = 'todos',
  ahora = new Date(),
}: OpcionesFiltradoSeguimientos): Seguimiento[] {
  const query = busqueda.trim().toLowerCase();

  const filtrados = seguimientos.filter((s) => {
    // 1. Filtro por categoría
    const cat = clasificarSeguimiento(s, ahora);
    if (categoria === 'VENCIDOS' && cat !== 'VENCIDO') return false;
    if (categoria === 'HOY' && cat !== 'HOY') return false;
    if (categoria === 'PROXIMOS' && cat !== 'PROXIMO') return false;
    if (categoria === 'COMPLETADOS' && cat !== 'COMPLETADO') return false;
    if (categoria === 'TODOS' && cat === 'COMPLETADO') return false;

    // 2. Filtro por asesor
    if (asesorId !== 'todos' && s.asesorId !== asesorId) {
      return false;
    }

    // 3. Filtro por búsqueda
    if (query) {
      const matchDescripcion = s.descripcion.toLowerCase().includes(query);
      const matchContacto = s.contactoNombre?.toLowerCase().includes(query) ?? false;
      const matchOportunidad = s.oportunidadTitulo?.toLowerCase().includes(query) ?? false;
      const matchAsesor = s.asesorNombre?.toLowerCase().includes(query) ?? false;

      if (!matchDescripcion && !matchContacto && !matchOportunidad && !matchAsesor) {
        return false;
      }
    }

    return true;
  });

  // Ordenación lógica:
  return filtrados.sort((a, b) => {
    const catA = clasificarSeguimiento(a, ahora);
    const catB = clasificarSeguimiento(b, ahora);

    // Los completados se ordenan por fecha de completado más reciente
    if (catA === 'COMPLETADO' && catB === 'COMPLETADO') {
      const tA = a.completadoEn ? new Date(a.completadoEn).getTime() : 0;
      const tB = b.completadoEn ? new Date(b.completadoEn).getTime() : 0;
      return tB - tA;
    }

    // Prioridad por categoría si estamos en pestaña 'TODOS'
    const peso: Record<string, number> = {
      VENCIDO: 1,
      HOY: 2,
      PROXIMO: 3,
      COMPLETADO: 4,
    };

    if (peso[catA] !== peso[catB]) {
      return (peso[catA] ?? 99) - (peso[catB] ?? 99);
    }

    // Dentro de la misma categoría: vencidos y de hoy por hora ascendente (urgente primero)
    return new Date(a.venceEn).getTime() - new Date(b.venceEn).getTime();
  });
}

/**
 * Retorna los textos descriptivos de fecha, hora y retraso amigable en formato es-CO.
 */
export function formatearDetalleVencimiento(
  venceEnIso: string,
  completadoEnIso: string | null,
  ahora: Date = new Date(),
): {
  etiqueta: string;
  retrasoTexto: string;
  esVencido: boolean;
  esUrgente: boolean;
  badgeClase: string;
} {
  if (completadoEnIso) {
    return {
      etiqueta: 'Completado',
      retrasoTexto: `Finalizado ${formatearFecha(completadoEnIso, { conHora: true })}`,
      esVencido: false,
      esUrgente: false,
      badgeClase:
        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    };
  }

  const diffMs = ahora.getTime() - new Date(venceEnIso).getTime();
  const hoyStr = ahora.toISOString().slice(0, 10);
  const venceStr = venceEnIso.slice(0, 10);

  if (diffMs > 0) {
    const min = Math.floor(diffMs / 60000);
    let retraso: string;
    if (min < 60) {
      retraso = `hace ${min} min`;
    } else {
      const horas = Math.floor(min / 60);
      if (horas < 24) {
        retraso = `hace ${horas} h`;
      } else {
        const dias = Math.floor(horas / 24);
        retraso = `hace ${dias} día${dias === 1 ? '' : 's'}`;
      }
    }

    return {
      etiqueta: 'Vencido',
      retrasoTexto: `Venció ${retraso} (${formatearFecha(venceEnIso, { conHora: true })})`,
      esVencido: true,
      esUrgente: true,
      badgeClase:
        'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50',
    };
  }

  // Tarea futura
  if (venceStr === hoyStr) {
    const faltanMs = -diffMs;
    const min = Math.floor(faltanMs / 60000);
    const esUrgente = min <= 120; // Menos de 2 horas

    return {
      etiqueta: 'Para hoy',
      retrasoTexto: `Hoy a las ${formatearFecha(venceEnIso, { estilo: 'hora' })}`,
      esVencido: false,
      esUrgente,
      badgeClase: esUrgente
        ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50'
        : 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900/50',
    };
  }

  return {
    etiqueta: 'Próximo',
    retrasoTexto: formatearFecha(venceEnIso, { conHora: true }),
    esVencido: false,
    esUrgente: false,
    badgeClase:
      'bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700',
  };
}
