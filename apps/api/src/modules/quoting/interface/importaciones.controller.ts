/**
 * Importación de catálogo (ADR-0017 §4.2): previsualizar (sin escritura) y sugerir mapeo.
 *
 * Ambas rutas exigen `catalogo.administrar`. El tenant sale de la sesión; los esquemas son
 * `.strict()`, así que un `tenantId` en el cuerpo es un 400. Antes de validar celdas se comprueban
 * los topes de la tabla: superarlos es 413 y no se valida ninguna fila (el tope de 2 MB del cuerpo
 * lo aplica `cuerpoDeImportaciones`).
 */

import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';
import {
  ConfirmarImportacion,
  EntradaDeImportacion,
  MAXIMO_DE_COLUMNAS_DE_IMPORTACION,
  MAXIMO_DE_FILAS_DE_IMPORTACION,
  PeticionDeSugerenciaDeMapeo,
} from '@viajapro/contracts';
import { RequierePermiso } from '../../../shared/autorizacion/permiso.decorator.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import { ConfirmarImportacionUseCase } from '../application/confirmar-importacion.use-case.js';
import { PrevisualizarImportacionUseCase } from '../application/previsualizar-importacion.use-case.js';
import { SugeridorDeMapeo } from '../application/sugeridor-de-mapeo.js';

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Pipe de los topes: corre antes que Zod, para que una tabla enorme no se valide celda a celda. */
export function verificarTopesDeLaTabla(cuerpo: unknown): unknown {
  const tabla = esObjeto(cuerpo) ? cuerpo['tabla'] : undefined;
  if (esObjeto(tabla)) {
    const filas = tabla['filas'];
    const encabezados = tabla['encabezados'];
    const demasiadas =
      (Array.isArray(filas) &&
        (filas.length > MAXIMO_DE_FILAS_DE_IMPORTACION ||
          filas.some((f) => Array.isArray(f) && f.length > MAXIMO_DE_COLUMNAS_DE_IMPORTACION))) ||
      (Array.isArray(encabezados) && encabezados.length > MAXIMO_DE_COLUMNAS_DE_IMPORTACION);
    if (demasiadas) {
      throw new HttpException(
        {
          error: {
            code: 'TABLA_DEMASIADO_GRANDE',
            message: `La tabla admite como máximo ${MAXIMO_DE_FILAS_DE_IMPORTACION} filas y ${MAXIMO_DE_COLUMNAS_DE_IMPORTACION} columnas.`,
          },
        },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
  }
  return cuerpo;
}

@Controller('api/v1/catalogo/importaciones')
export class ImportacionesController {
  // `@Inject` explícito: ver la nota de `catalogo.controller.ts`.
  constructor(
    @Inject(PrevisualizarImportacionUseCase)
    private readonly previsualizar: PrevisualizarImportacionUseCase,
    @Inject(ConfirmarImportacionUseCase)
    private readonly confirmar: ConfirmarImportacionUseCase,
    @Inject(SugeridorDeMapeo) private readonly sugeridor: SugeridorDeMapeo,
  ) {}

  @Post('previsualizar')
  @HttpCode(200)
  @RequierePermiso('catalogo.administrar')
  async previsualizarImportacion(
    @Body({ transform: verificarTopesDeLaTabla }, new ZodValidationPipe(EntradaDeImportacion))
    body: EntradaDeImportacion,
  ) {
    const { tenantId, permisos } = ContextoTenant.obtener();
    return this.previsualizar.ejecutar(body, { tenantId, permisos: [...permisos] });
  }

  /** Todo o nada. 409 `PROPUESTA_CAMBIO` si la huella ya no coincide; 422 si alguna fila es ERROR. */
  @Post('confirmar')
  @HttpCode(200)
  @RequierePermiso('catalogo.administrar')
  async confirmarImportacion(
    @Body({ transform: verificarTopesDeLaTabla }, new ZodValidationPipe(ConfirmarImportacion))
    body: ConfirmarImportacion,
  ) {
    const { tenantId, usuarioId, permisos } = ContextoTenant.obtener();
    return this.confirmar.ejecutar(body, { tenantId, usuarioId, permisos: [...permisos] });
  }

  @Post('sugerir-mapeo')
  @HttpCode(200)
  @RequierePermiso('catalogo.administrar')
  sugerirMapeo(
    @Body(new ZodValidationPipe(PeticionDeSugerenciaDeMapeo)) body: PeticionDeSugerenciaDeMapeo,
  ) {
    return this.sugeridor.sugerir(body);
  }
}
