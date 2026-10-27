/**
 * Previsualizar una importación de catálogo (ADR-0017 §4.2). **No escribe nada.**
 *
 *   1. tabla + mapeo -> `PropuestaDeCatalogo` (adaptador puro) o la propuesta ya viene hecha;
 *   2. lee el catálogo del tenant en una transacción de solo lectura (RLS fija el tenant);
 *   3. `validarYPlanificar` -> informe (nuevo, cambia precio, sin cambio, errores con su fila);
 *   4. suma al informe los errores de lectura de celdas y devuelve informe + huella.
 *
 * El tenant y los permisos salen de la sesión, nunca del cuerpo. No toma el bloqueo del catálogo
 * ni registra auditoría: confirmar (otra tarea) recalcula todo dentro de su propio bloqueo.
 */

import { Inject, Injectable } from '@nestjs/common';
import type {
  EntradaDeImportacion,
  InformeDeCatalogo,
  Permiso,
  RespuestaDePrevisualizacion,
} from '@viajapro/contracts';
import { huellaDeEstado } from '../domain/huella-de-estado.js';
import { tablaAPropuesta } from '../domain/tabla-a-propuesta.js';
import { huellaDePropuesta, validarYPlanificar } from '../domain/validar-y-planificar.js';
import { UnidadDeTrabajoDeCatalogo } from './puertos-de-catalogo.js';

export interface ContextoDePrevisualizacion {
  readonly tenantId: string;
  readonly permisos: readonly Permiso[];
}

@Injectable()
export class PrevisualizarImportacionUseCase {
  constructor(
    @Inject(UnidadDeTrabajoDeCatalogo) private readonly trabajo: UnidadDeTrabajoDeCatalogo,
  ) {}

  async ejecutar(
    entrada: EntradaDeImportacion,
    contexto: ContextoDePrevisualizacion,
  ): Promise<RespuestaDePrevisualizacion> {
    const lectura =
      'tabla' in entrada
        ? tablaAPropuesta(entrada.tabla, entrada.mapeo)
        : { propuesta: entrada.propuesta, errores: [] };

    const actual = await this.trabajo.ejecutar((espacio) => espacio.catalogo.leer());

    const { informe } = lectura.propuesta
      ? validarYPlanificar(lectura.propuesta, actual, contexto.permisos, {
          tenantId: contexto.tenantId,
          soportaM2: true,
        })
      : {
          informe: {
            elementos: [],
            resumen: { errores: 0, avisos: 0, creados: 0, actualizados: 0, sinCambios: 0 },
            noIncluidos: actual.paquetes.map((p) => ({ codigo: p.codigo, nombre: p.nombre })),
            huella: huellaDePropuesta(
              { version: 1, origen: 'ARCHIVO', productos: [] },
              contexto.tenantId,
            ),
          } satisfies InformeDeCatalogo,
        };

    const combinado: InformeDeCatalogo = {
      ...informe,
      elementos: [...lectura.errores, ...informe.elementos],
      resumen: { ...informe.resumen, errores: informe.resumen.errores + lectura.errores.length },
    };
    return { informe: combinado, huella: huellaDeEstado(combinado, actual) };
  }
}
