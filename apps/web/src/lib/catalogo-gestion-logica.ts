import {
  type CrearPaquete,
  type EditarPaquete,
  type PlanAlimentacion,
  type ResumenDePaqueteGestion,
  CrearPaquete as EsquemaCrearPaquete,
  EditarPaquete as EsquemaEditarPaquete,
} from '@viajapro/contracts';
import type { PaqueteConDetalle } from './mock-catalogo';

export interface FormularioPaqueteValores {
  nombre: string;
  destino: string;
  dias: number | string;
  noches: number | string;
  planAlimentacion?: PlanAlimentacion | 'SIN_DECLARAR' | '' | null;
  codigo?: string;
  formato?: string;
  inclusiones?: string | string[];
  exclusiones?: string | string[];
}

export type ResultadoValidacionPaquete =
  { exito: true; datos: CrearPaquete } | { exito: false; errores: Record<string, string> };

export type ResultadoValidacionEdicion =
  { exito: true; datos: EditarPaquete } | { exito: false; errores: Record<string, string> };

function normalizarLineas(valor?: string | string[]): string[] | undefined {
  if (!valor) return undefined;
  if (Array.isArray(valor)) {
    const filtrado = valor.map((l) => l.trim()).filter((l) => l.length > 0);
    return filtrado.length > 0 ? filtrado : undefined;
  }
  const separadas = valor
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return separadas.length > 0 ? separadas : undefined;
}

export function prepararDatosFormulario(
  valores: FormularioPaqueteValores,
): Record<string, unknown> {
  const nombre = valores.nombre.trim();
  const destino = valores.destino.trim();
  const dias = typeof valores.dias === 'string' ? parseInt(valores.dias, 10) : valores.dias;
  const noches = typeof valores.noches === 'string' ? parseInt(valores.noches, 10) : valores.noches;

  const resultado: Record<string, unknown> = {
    nombre,
    destino,
    dias,
    noches,
  };

  if (valores.planAlimentacion && valores.planAlimentacion !== 'SIN_DECLARAR') {
    resultado.planAlimentacion = valores.planAlimentacion;
  } else if (valores.planAlimentacion === 'SIN_DECLARAR') {
    resultado.planAlimentacion = null;
  }

  const codigo = valores.codigo?.trim();
  if (codigo) {
    resultado.codigo = codigo;
  }

  const formato = valores.formato?.trim();
  if (formato) {
    resultado.formato = formato;
  }

  const inclusiones = normalizarLineas(valores.inclusiones);
  if (inclusiones) {
    resultado.inclusiones = inclusiones;
  }

  const exclusiones = normalizarLineas(valores.exclusiones);
  if (exclusiones) {
    resultado.exclusiones = exclusiones;
  }

  return resultado;
}

export function validarFormularioCrearPaquete(
  valores: FormularioPaqueteValores,
): ResultadoValidacionPaquete {
  const objeto = prepararDatosFormulario(valores);
  const resultado = EsquemaCrearPaquete.safeParse(objeto);

  if (resultado.success) {
    return { exito: true, datos: resultado.data };
  }

  const errores: Record<string, string> = {};
  for (const issue of resultado.error.issues) {
    const campo = issue.path[0]?.toString() ?? 'general';
    if (!errores[campo]) {
      if (campo === 'nombre') {
        errores[campo] = 'El nombre es obligatorio y debe tener entre 1 y 200 caracteres.';
      } else if (campo === 'destino') {
        errores[campo] = 'El destino es obligatorio y debe tener entre 1 y 120 caracteres.';
      } else if (campo === 'dias') {
        errores[campo] = 'Los días de viaje deben ser un número entero entre 1 y 365.';
      } else if (campo === 'noches') {
        errores[campo] =
          issue.message || 'Las noches deben ser iguales a los días o uno menos (ej. 4D / 3N).';
      } else if (campo === 'codigo') {
        errores[campo] = 'El código debe tener entre 1 y 64 caracteres.';
      } else if (campo === 'formato') {
        errores[campo] = 'El formato de viaje no puede superar 80 caracteres.';
      } else {
        errores[campo] = issue.message;
      }
    }
  }

  return { exito: false, errores };
}

export function validarFormularioEditarPaquete(
  valores: Partial<FormularioPaqueteValores>,
): ResultadoValidacionEdicion {
  const dias =
    valores.dias !== undefined
      ? typeof valores.dias === 'string'
        ? parseInt(valores.dias, 10)
        : valores.dias
      : undefined;
  const noches =
    valores.noches !== undefined
      ? typeof valores.noches === 'string'
        ? parseInt(valores.noches, 10)
        : valores.noches
      : undefined;

  const objeto: Record<string, unknown> = {};
  if (valores.nombre !== undefined) objeto.nombre = valores.nombre.trim();
  if (valores.destino !== undefined) objeto.destino = valores.destino.trim();
  if (dias !== undefined) objeto.dias = dias;
  if (noches !== undefined) objeto.noches = noches;

  if (valores.planAlimentacion !== undefined) {
    if (valores.planAlimentacion && valores.planAlimentacion !== 'SIN_DECLARAR') {
      objeto.planAlimentacion = valores.planAlimentacion;
    } else {
      objeto.planAlimentacion = null;
    }
  }

  if (valores.codigo !== undefined) {
    const c = valores.codigo.trim();
    if (c) objeto.codigo = c;
  }
  if (valores.formato !== undefined) {
    const f = valores.formato.trim();
    if (f) objeto.formato = f;
  }

  if (valores.inclusiones !== undefined) {
    const inc = normalizarLineas(valores.inclusiones);
    if (inc) objeto.inclusiones = inc;
  }
  if (valores.exclusiones !== undefined) {
    const exc = normalizarLineas(valores.exclusiones);
    if (exc) objeto.exclusiones = exc;
  }

  const resultado = EsquemaEditarPaquete.safeParse(objeto);

  if (resultado.success) {
    return { exito: true, datos: resultado.data };
  }

  const errores: Record<string, string> = {};
  for (const issue of resultado.error.issues) {
    const campo = issue.path[0]?.toString() ?? 'general';
    if (!errores[campo]) {
      if (campo === 'nombre') {
        errores[campo] = 'El nombre no puede estar vacío (máx. 200 caracteres).';
      } else if (campo === 'destino') {
        errores[campo] = 'El destino no puede estar vacío (máx. 120 caracteres).';
      } else if (campo === 'dias') {
        errores[campo] = 'Los días deben ser un número entre 1 y 365.';
      } else if (campo === 'noches') {
        errores[campo] =
          issue.message || 'Las noches deben ser iguales a los días o uno menos (ej. 4D / 3N).';
      } else {
        errores[campo] = issue.message;
      }
    }
  }

  return { exito: false, errores };
}

export interface FiltrosGestionCatalogo {
  busqueda?: string;
  estado?: 'TODOS' | 'ACTIVOS' | 'INACTIVOS';
  destino?: string;
}

export function filtrarPaquetesGestion(
  paquetes: ResumenDePaqueteGestion[],
  filtros: FiltrosGestionCatalogo,
): ResumenDePaqueteGestion[] {
  const busquedaNorm = filtros.busqueda?.trim().toLowerCase() ?? '';
  const estado = filtros.estado ?? 'TODOS';
  const destinoNorm = filtros.destino ?? 'TODOS';

  return paquetes.filter((p) => {
    // 1. Filtro de estado
    if (estado === 'ACTIVOS' && !p.activo) return false;
    if (estado === 'INACTIVOS' && p.activo) return false;

    // 2. Filtro de destino
    if (destinoNorm !== 'TODOS' && p.destino !== destinoNorm) return false;

    // 3. Búsqueda por texto (nombre, destino o código)
    if (busquedaNorm) {
      const coincideNombre = p.nombre.toLowerCase().includes(busquedaNorm);
      const coincideDestino = p.destino.toLowerCase().includes(busquedaNorm);
      const coincideCodigo = p.codigo?.toLowerCase().includes(busquedaNorm) ?? false;
      if (!coincideNombre && !coincideDestino && !coincideCodigo) return false;
    }

    return true;
  });
}

/**
 * Convierte paquetes simulados del catálogo a `ResumenDePaqueteGestion` para modo offline/demo.
 */
export function construirResumenMockGestion(
  paquetesMock: PaqueteConDetalle[],
  incluirInactivos: boolean = true,
): ResumenDePaqueteGestion[] {
  return paquetesMock
    .filter((p) => incluirInactivos || p.activo)
    .map((p) => {
      // Buscar menor precio en COP de las temporadas mock
      let menorCop = Infinity;
      for (const temp of p.temporadas) {
        for (const pr of temp.precios) {
          if (pr.tipoPasajero === 'ADT' && pr.venta.moneda === 'COP') {
            const val = Number(pr.venta.unidades);
            if (val < menorCop) menorCop = val;
          }
        }
      }

      const desde =
        menorCop !== Infinity ? [{ unidades: menorCop.toString(), moneda: 'COP' as const }] : [];

      return {
        id: p.id,
        nombre: p.nombre,
        destino: p.destino,
        paisIso: p.paisIso,
        dias: p.dias,
        noches: p.noches,
        descripcion: p.descripcion,
        planAlimentacion: p.planAlimentacion,
        activo: p.activo,
        mayoristaId: p.mayoristaId,
        creadoEn: p.creadoEn,
        codigo: p.codigo ?? null,
        formato: p.formato ?? null,
        cargosEnDestino: p.cargosEnDestino ?? [],
        inclusiones: p.inclusiones,
        exclusiones: p.exclusiones,
        desde,
        desdeEsDeGrupo: false,
        vigenciasActivas: p.temporadas.length,
      };
    });
}
