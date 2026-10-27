/**
 * Confirmar una importación de catálogo (ADR-0017 §4.2). Todo o nada.
 *
 *   1. vuelve a leer la tabla en el servidor (`tablaAPropuesta`): no confía en la previsualización;
 *   2. si alguna fila no se pudo leer, la rechaza entera (422) sin tocar la base;
 *   3. delega en `AplicadorDeCatalogo` —el único que escribe—, que dentro de UNA transacción con el
 *      bloqueo de la agencia revalida, compara la huella de estado y aplica;
 *   4. nunca borra ni desactiva lo que no viene en la hoja.
 *
 * Idempotente por convergencia (R5): confirmar otra vez la misma hoja deja el catálogo y la
 * auditoría iguales (`sinCambios`), también con la huella de la primera previsualización.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { ConfirmarImportacion, Permiso, RespuestaDeConfirmacion } from '@viajapro/contracts';
import { NetoSinPermisoError, PropuestaInvalidaError } from '../domain/errors.js';
import { tablaAPropuesta } from '../domain/tabla-a-propuesta.js';
import { AplicadorDeCatalogo } from './aplicador-de-catalogo.js';
import type { JsonValue } from './puertos-de-catalogo.js';

export interface ContextoDeConfirmacion {
  readonly tenantId: string;
  readonly usuarioId: string | null;
  readonly permisos: readonly Permiso[];
}

/** Valores de un objeto ya validado por Zod (números, textos): viajan tal cual a la auditoría. */
function comoJson(valor: unknown): JsonValue {
  return JSON.parse(JSON.stringify(valor ?? null)) as JsonValue;
}

function traeNeto(entrada: ConfirmarImportacion): boolean {
  if ('tabla' in entrada) return entrada.mapeo.columnas['precio_neto'] !== undefined;
  return entrada.propuesta.productos.some((p) =>
    p.vigencias.some((v) => v.tarifas.some((t) => t.neto !== null && t.neto !== undefined)),
  );
}

@Injectable()
export class ConfirmarImportacionUseCase {
  constructor(@Inject(AplicadorDeCatalogo) private readonly aplicador: AplicadorDeCatalogo) {}

  async ejecutar(
    entrada: ConfirmarImportacion,
    contexto: ContextoDeConfirmacion,
  ): Promise<RespuestaDeConfirmacion> {
    if (!contexto.permisos.includes('cotizacion.ver_neto_y_margen') && traeNeto(entrada)) {
      throw new NetoSinPermisoError();
    }

    const lectura =
      'tabla' in entrada
        ? tablaAPropuesta(entrada.tabla, entrada.mapeo)
        : { propuesta: entrada.propuesta, errores: [] };

    if (lectura.errores.length > 0 || !lectura.propuesta) {
      throw new PropuestaInvalidaError(
        lectura.errores.map((e) => ({ codigo: e.codigo, ruta: e.ruta })),
        lectura.errores.length,
      );
    }

    const anotacion =
      'tabla' in entrada
        ? {
            mapeoConfirmado: comoJson(entrada.mapeo),
            mapeoSugerido: comoJson(entrada.mapeoSugerido),
          }
        : {};

    const resultado = await this.aplicador.aplicar(lectura.propuesta, contexto, {
      huellaDeEstadoEsperada: entrada.huella,
      anotacion,
    });
    return { informe: resultado.informe, paquetes: [...resultado.paquetes] };
  }
}
