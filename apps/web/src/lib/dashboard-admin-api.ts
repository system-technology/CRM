/**
 * Datos del dashboard de administración (T-344): tres lecturas independientes para que el fallo de
 * una no apague las otras.
 *
 *  · `GET /reportes/resumen` del periodo y del anterior (comparación entre periodos) y, por cada
 *    asesor, `?asesorId=` (comparación entre asesores).
 *  · `GET /cobros`: archivos abiertos con saldo, destino y fecha de salida (cobros, salidas, destinos).
 *
 * **El alcance lo manda el servidor.** Si la respuesta dice `alcance: 'PROPIO'`, esta pantalla no
 * es para quien la pide y se lanza `ErrorReportesApi('ALCANCE_PROPIO')`; la web no mira permisos.
 *
 * **Costo conocido:** comparar asesores es N consultas (una por asesor, tope
 * `MAXIMO_ASESORES_COMPARADOS`). Un agregado por asesor en el servidor está en cola (T-531).
 *
 * Demostración (`estaUsandoApiReal() === false`): datos de maqueta con la forma del contrato,
 * nunca mezclados con los reales.
 */
import {
  ErrorApi,
  ResumenDeReportesPorAlcance,
  VistaDeCobros,
  type ResumenDeReportes,
  type VistaDeCobros as VistaDeCobrosTipo,
} from '@viajapro/contracts';
import { obtenerBaseApi } from './api-base';
import { cabecerasDeTenantDev } from './cabeceras-tenant';
import { estaUsandoApiReal } from './crm-api';
import {
  MAXIMO_ASESORES_COMPARADOS,
  type MiembroParaComparar,
  type ResumenDeAsesor,
} from './dashboard-admin-logica';
import { listarMiembrosEquipoApi } from './equipo-api';
import { crearResumenDeReportesDemo } from './mock-reportes-resumen';
import { ErrorReportesApi } from './reportes-api';
import type { RangoDeInstantes } from './reportes-periodo';

async function pedir(
  ruta: string,
  senal?: AbortSignal,
): Promise<{ res: Response; cuerpo: unknown }> {
  let res: Response;
  try {
    res = await fetch(`${obtenerBaseApi()}${ruta}`, {
      method: 'GET',
      headers: { Accept: 'application/json', ...cabecerasDeTenantDev() },
      credentials: 'include',
      cache: 'no-store',
      ...(senal ? { signal: senal } : {}),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ErrorReportesApi(
      'ERROR_CONEXION',
      'No fue posible conectar con el servidor de ViajaPro.',
    );
  }
  const cuerpo: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = ErrorApi.safeParse(cuerpo);
    throw new ErrorReportesApi(
      res.status === 403 ? 'PERMISO_DENEGADO' : e.success ? e.data.error.code : 'ERROR_SERVIDOR',
      res.status === 403
        ? 'Tu rol no tiene permiso para ver esta información.'
        : `El servidor respondió con error ${res.status}.`,
      res.status,
    );
  }
  return { res, cuerpo };
}

// ---------------------------------------------------------------------------------------------
// Resumen de la agencia (y de un asesor)
// ---------------------------------------------------------------------------------------------

/**
 * Resumen del rango. Sin `asesorId`: toda la agencia. Con él, el de ese asesor (el servidor
 * responde 403 si quien pide no tiene `reportes.ver_agencia`, nunca un recorte en silencio).
 * Devuelve siempre la rama `AGENCIA`: si el servidor contesta `PROPIO`, esta vista no corresponde.
 */
export async function obtenerResumenDeAgenciaApi(
  rango: RangoDeInstantes,
  asesorId?: string,
  senal?: AbortSignal,
): Promise<ResumenDeReportes> {
  if (!estaUsandoApiReal()) return crearResumenDeAgenciaDemo(rango, asesorId);

  const params = new URLSearchParams({ desde: rango.desde, hasta: rango.hasta });
  if (asesorId) params.set('asesorId', asesorId);
  const { res, cuerpo } = await pedir(`/api/v1/reportes/resumen?${params.toString()}`, senal);

  const parseo = ResumenDeReportesPorAlcance.safeParse(cuerpo);
  if (!parseo.success) {
    throw new ErrorReportesApi(
      'RESPUESTA_INVALIDA',
      'El servidor devolvió un reporte con un formato inesperado.',
      res.status,
    );
  }
  if (parseo.data.alcance !== 'AGENCIA') {
    throw new ErrorReportesApi('ALCANCE_PROPIO', 'Esta vista es de administración.', res.status);
  }
  return parseo.data;
}

/**
 * El resumen de cada asesor activo, de a pocos a la vez (no se gasta el límite de peticiones de
 * la agencia). Si la consulta de uno falla, su fila queda con `resumen: null` y las demás siguen.
 * Un `AbortError` sí se propaga: es el usuario cambiando de periodo.
 */
export async function obtenerResumenesDeAsesoresApi(
  rango: RangoDeInstantes,
  senal?: AbortSignal,
): Promise<{ filas: ResumenDeAsesor[]; recortado: boolean }> {
  const miembros = await listarMiembrosEquipoApi();
  const activos: MiembroParaComparar[] = miembros
    .filter((m) => m.estado === 'ACTIVO')
    .map((m) => ({ id: m.id, nombre: m.nombre }));
  const comparados = activos.slice(0, MAXIMO_ASESORES_COMPARADOS);

  const filas: ResumenDeAsesor[] = [];
  const LOTE = 4;
  for (let i = 0; i < comparados.length; i += LOTE) {
    const lote = comparados.slice(i, i + LOTE);
    const resueltos = await Promise.all(
      lote.map(async (miembro): Promise<ResumenDeAsesor> => {
        try {
          return { miembro, resumen: await obtenerResumenDeAgenciaApi(rango, miembro.id, senal) };
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') throw err;
          return { miembro, resumen: null };
        }
      }),
    );
    filas.push(...resueltos);
  }
  return { filas, recortado: activos.length > comparados.length };
}

// ---------------------------------------------------------------------------------------------
// Cobros (archivos abiertos)
// ---------------------------------------------------------------------------------------------

export async function obtenerVistaDeCobrosApi(
  ahora: Date,
  senal?: AbortSignal,
): Promise<VistaDeCobrosTipo> {
  if (!estaUsandoApiReal()) return crearVistaDeCobrosDemo(ahora);

  const { res, cuerpo } = await pedir('/api/v1/cobros?limite=500', senal);
  const parseo = VistaDeCobros.safeParse(cuerpo);
  if (!parseo.success) {
    throw new ErrorReportesApi(
      'RESPUESTA_INVALIDA',
      'El servidor devolvió los cobros con un formato inesperado.',
      res.status,
    );
  }
  return parseo.data;
}

// ---------------------------------------------------------------------------------------------
// Maqueta (solo demostración)
// ---------------------------------------------------------------------------------------------

/** Asesores de la maqueta, con su peso relativo (quién vende más). */
const PESO_DE_ASESOR_DEMO = [1.0, 0.7, 0.45, 0.2];

function pesoDeAsesorDemo(asesorId: string): number {
  let h = 0;
  for (const c of asesorId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PESO_DE_ASESOR_DEMO[h % PESO_DE_ASESOR_DEMO.length] ?? 0.5;
}

/**
 * Resumen de la agencia (o de un asesor) de la maqueta. El periodo ANTERIOR se reconoce por el
 * rango: más viejo que el actual, rinde un poco menos, para que la comparación se vea.
 */
export function crearResumenDeAgenciaDemo(
  rango: RangoDeInstantes,
  asesorId?: string,
): ResumenDeReportes {
  const base = crearResumenDeReportesDemo(rango);
  const esAnterior = Date.parse(rango.hasta) <= Date.now() - 86_400_000;
  const f = (asesorId ? pesoDeAsesorDemo(asesorId) * 0.5 : 1) * (esAnterior ? 0.86 : 1);
  const e = (n: number): number => Math.round(n * f);

  const creadas = e(base.oportunidades.creadas);
  const ganadas = e(base.oportunidades.ganadas);
  const perdidas = e(base.oportunidades.perdidas);
  const enviadas = e(base.cotizaciones.enviadas);
  const aceptadas = e(base.cotizaciones.aceptadas);
  const nuevas = e(base.respuesta.conversacionesNuevas);
  const respondidas = Math.min(nuevas, e(base.respuesta.conversacionesRespondidas));
  const pct = (a: number, b: number): number | null =>
    b > 0 ? Math.round((a / b) * 1000) / 10 : null;

  return {
    ...base,
    alcance: 'AGENCIA',
    asesorId: asesorId ?? null,
    cotizaciones: {
      creadas: e(base.cotizaciones.creadas),
      enviadas,
      aceptadas,
      tasaAceptacion: pct(aceptadas, enviadas),
    },
    ventasPorMoneda: [
      {
        moneda: 'COP',
        cotizacionesAceptadas: aceptadas,
        ventas: { moneda: 'COP', unidades: String(Math.round(6_290_000 * aceptadas)) },
      },
      ...(e(2) > 0
        ? [
            {
              moneda: 'USD' as const,
              cotizacionesAceptadas: e(2),
              // Centavos: 3 840 USD por venta.
              ventas: { moneda: 'USD' as const, unidades: String(384_000 * e(2)) },
            },
          ]
        : []),
    ],
    oportunidades: {
      creadas,
      ganadas,
      perdidas,
      abiertas: Math.max(0, creadas - ganadas - perdidas),
      tasaConversion: pct(ganadas, ganadas + perdidas),
      porEtapa: base.oportunidades.porEtapa.map((et) => ({
        ...et,
        cantidad: et.esGanada ? ganadas : et.esPerdida ? perdidas : e(et.cantidad),
      })),
    },
    respuesta: {
      ...base.respuesta,
      // Responder más rápido este periodo que el anterior: la comparación se ve.
      medianaMinutos: esAnterior ? 8.5 : (base.respuesta.medianaMinutos ?? null),
      conversacionesNuevas: nuevas,
      conversacionesRespondidas: respondidas,
      sinResponder: nuevas - respondidas,
      tasaRespuesta: pct(respondidas, nuevas),
    },
  };
}

function fechaMas(ahora: Date, dias: number): string {
  const d = new Date(ahora.getTime() + dias * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const ID_DEMO = (n: number): string =>
  `01932000-0000-7000-8000-0000000e${n.toString().padStart(4, '0')}`;

/** Archivos abiertos de la maqueta: destinos y fechas coherentes con el resto de la demo. */
export function crearVistaDeCobrosDemo(ahora: Date): VistaDeCobrosTipo {
  // [destino, días para salir, total, pagado, moneda, estado de cobro, días al plazo]
  const filas: Array<[string, number, number, number, 'COP' | 'USD', string, number]> = [
    ['Cancún', 6, 9_800_000, 4_900_000, 'COP', 'VENCIDO', -3],
    ['Punta Cana', 9, 7_450_000, 7_450_000, 'COP', 'AL_DIA', 0],
    ['San Andrés', 12, 3_120_000, 1_000_000, 'COP', 'POR_VENCER', 4],
    ['Cancún', 19, 11_300_000, 3_000_000, 'COP', 'SALDO_PENDIENTE', 20],
    ['Madrid', 24, 612_000, 200_000, 'USD', 'POR_VENCER', 5],
    ['Cartagena', 27, 2_560_000, 2_560_000, 'COP', 'AL_DIA', 0],
    ['Miami', 41, 480_000, 100_000, 'USD', 'SALDO_PENDIENTE', 30],
    ['Punta Cana', 55, 8_900_000, 2_000_000, 'COP', 'SALDO_PENDIENTE', 35],
    ['San Andrés', 63, 2_890_000, 0, 'COP', 'SALDO_PENDIENTE', 40],
  ];
  const datos = filas.map(([destino, dias, total, pagado, moneda, estado, plazo], i) => {
    // USD en centavos (R8): la maqueta ya los trae en centavos.
    const dinero = (n: number) => ({ moneda, unidades: String(n) });
    return {
      archivoId: ID_DEMO(i + 1),
      numero: 1041 + i,
      contactoId: ID_DEMO(100 + i),
      destino,
      fechaSalida: fechaMas(ahora, dias),
      total: dinero(total),
      pagado: dinero(pagado),
      saldo: dinero(total - pagado),
      situacion: pagado === 0 ? 'SIN_PAGOS' : pagado >= total ? 'PAGADO' : 'PARCIAL',
      estadoDeCobro: estado,
      fechaLimite: fechaMas(ahora, plazo),
    };
  });

  return VistaDeCobros.parse({
    datos,
    totales: [],
    truncado: false,
  });
}
