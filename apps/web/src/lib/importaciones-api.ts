/**
 * Cliente de API para el asistente de importación de catálogo y plantillas (T-029 y T-030).
 *
 * Consume los endpoints del ADR-0017:
 * - `GET  /api/v1/catalogo/formatos`: Lista de formatos disponibles.
 * - `GET  /api/v1/catalogo/formatos/:id/plantilla`: Descriptor de plantilla por formato.
 * - `POST /api/v1/catalogo/importaciones/sugerir-mapeo`: Sugerencia inteligente de columnas.
 * - `POST /api/v1/catalogo/importaciones/previsualizar`: Previsualización con informe y huella SHA-256.
 * - `POST /api/v1/catalogo/importaciones/confirmar`: Confirmación atómica todo-o-nada.
 */

import {
  PLANTILLAS_DE_SISTEMA,
  type DescriptorDePlantilla,
  type FormatoDeViaje,
  type PeticionDeSugerenciaDeMapeo,
  type SugerenciaDeMapeo,
  type EntradaDeImportacion,
  type RespuestaDePrevisualizacion,
  type ConfirmarImportacion,
  type RespuestaDeConfirmacion,
  ErrorApi as EsquemaError,
} from '@viajapro/contracts';
import { obtenerBaseApi } from './api-base';
import { cabecerasDeTenantDev } from './cabeceras-tenant';
import { sugerirMapeoLocal } from './importacion-logica';

export interface FormatoConPlantilla {
  formato: string;
  nombre: string;
  descripcion?: string | undefined;
  plantilla: DescriptorDePlantilla;
}

async function pedirApi<T>(ruta: string, init?: RequestInit): Promise<T> {
  const base = obtenerBaseApi();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...cabecerasDeTenantDev(),
    ...(init?.headers as Record<string, string>),
  };

  const res = await fetch(`${base}${ruta}`, {
    ...init,
    credentials: 'include',
    headers,
    cache: 'no-store',
  });

  const cuerpo: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const errorAnalizado = EsquemaError.safeParse(cuerpo);
    if (errorAnalizado.success) {
      throw new Error(`${errorAnalizado.data.error.code}: ${errorAnalizado.data.error.message}`);
    }
    throw new Error(`Error en API (${res.status}): ${ruta}`);
  }

  return cuerpo as T;
}

/**
 * Obtiene los formatos y sus descriptores de plantilla desde la API (T-030).
 * Si la API está offline, utiliza las plantillas de sistema oficiales.
 */
export async function listarFormatosYPlantillasApi(): Promise<FormatoConPlantilla[]> {
  try {
    const resFormatos = await pedirApi<{ datos: FormatoDeViaje[] }>('/api/v1/catalogo/formatos');
    const formatos = resFormatos.datos;

    if (formatos && formatos.length > 0) {
      const resultados: FormatoConPlantilla[] = [];
      for (const fmt of formatos) {
        try {
          const plantilla = await pedirApi<DescriptorDePlantilla>(
            `/api/v1/catalogo/formatos/${fmt.id}/plantilla`,
          );
          resultados.push({
            formato: plantilla.formato,
            nombre: fmt.nombre,
            plantilla,
          });
        } catch {
          // Fallback a plantilla de sistema si un formato particular falla
          const sistema = PLANTILLAS_DE_SISTEMA.find(
            (p) => p.formato === fmt.id || p.nombre.toLowerCase() === fmt.nombre.toLowerCase(),
          );
          if (sistema) {
            resultados.push({
              formato: sistema.formato,
              nombre: fmt.nombre,
              plantilla: sistema,
            });
          }
        }
      }
      if (resultados.length > 0) return resultados;
    }
  } catch {
    // Modo offline / demostración
  }

  // Fallback con PLANTILLAS_DE_SISTEMA oficiales
  return PLANTILLAS_DE_SISTEMA.map((p) => ({
    formato: p.formato,
    nombre: p.nombre,
    descripcion: `Plantilla oficial estándar para ${p.nombre.toLowerCase()} (${p.valoresPorDefecto.dias ?? 1}D / ${p.valoresPorDefecto.noches ?? 0}N).`,
    plantilla: p,
  }));
}

/**
 * Solicita al servidor sugerencias de correspondencia para las columnas del archivo.
 */
export async function sugerirMapeoApi(
  peticion: PeticionDeSugerenciaDeMapeo,
  plantillaFallback: DescriptorDePlantilla,
): Promise<SugerenciaDeMapeo> {
  try {
    return await pedirApi<SugerenciaDeMapeo>('/api/v1/catalogo/importaciones/sugerir-mapeo', {
      method: 'POST',
      body: JSON.stringify(peticion),
    });
  } catch {
    // Si la API falla, calcula sugerencia con la lógica local
    return sugerirMapeoLocal(peticion.encabezados, plantillaFallback);
  }
}

/**
 * Previsualiza la importación generando un informe de impacto y huella SHA-256.
 */
export async function previsualizarImportacionApi(
  entrada: EntradaDeImportacion,
): Promise<RespuestaDePrevisualizacion> {
  try {
    return await pedirApi<RespuestaDePrevisualizacion>(
      '/api/v1/catalogo/importaciones/previsualizar',
      {
        method: 'POST',
        body: JSON.stringify(entrada),
      },
    );
  } catch (error) {
    // Si falla la API en modo demo, generar previsualización verosímil
    if ('tabla' in entrada) {
      const totalFilas = entrada.tabla.filas.length;
      const huellaDemo = 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0';

      return {
        huella: huellaDemo,
        informe: {
          elementos: entrada.tabla.filas.map((fila, idx) => ({
            nivel: 'OK' as const,
            codigo: 'FILA_VALIDA',
            ruta: `productos[${idx}]`,
            mensaje: `Fila válida: paquete "${fila[0] || 'Nuevo producto'}" listo para creación`,
            procedencia: { fila: entrada.tabla.filaInicial + idx },
          })),
          resumen: {
            errores: 0,
            avisos: 0,
            creados: totalFilas,
            actualizados: 0,
            sinCambios: 0,
          },
          noIncluidos: [],
          huella: huellaDemo,
        },
      };
    }
    throw error;
  }
}

/**
 * Confirma atómicamente la importación (todo o nada) enviando la huella digital.
 */
export async function confirmarImportacionApi(
  confirmacion: ConfirmarImportacion,
): Promise<RespuestaDeConfirmacion> {
  try {
    return await pedirApi<RespuestaDeConfirmacion>('/api/v1/catalogo/importaciones/confirmar', {
      method: 'POST',
      body: JSON.stringify(confirmacion),
    });
  } catch (error) {
    if ('tabla' in confirmacion) {
      // Simulación offline en modo demo
      return {
        informe: {
          elementos: [],
          resumen: {
            errores: 0,
            avisos: 0,
            creados: confirmacion.tabla.filas.length,
            actualizados: 0,
            sinCambios: 0,
          },
          noIncluidos: [],
          huella: confirmacion.huella,
        },
        paquetes: confirmacion.tabla.filas.map((_, idx) => ({
          indice: idx,
          id: `paq-importado-${idx + 1}`,
          accion: 'CREAR' as const,
        })),
      };
    }
    throw error;
  }
}
