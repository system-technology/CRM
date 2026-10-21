/**
 * Traduce errores de dominio a HTTP, en un solo sitio.
 *
 * Sin esto, cada controlador acabaría con su propio try/catch repartiendo códigos de estado a
 * ojo, y el mismo error daría 400 en una ruta y 500 en otra.
 *
 * El cuerpo que sale respeta el contrato `ErrorApi`: `code` estable, `message` legible.
 */

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  DemasiadosIntentosError,
  DomainError,
  EstadoInvalidoError,
  InvariantError,
  NoAutenticadoError,
  ProhibidoError,
} from '@viajapro/domain';
import type { Response } from 'express';
import { ContextoTenant } from '../tenant/contexto-tenant.js';

@Catch()
export class DominioExcepcionFilter implements ExceptionFilter {
  private readonly log = new Logger(DominioExcepcionFilter.name);

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const ctx = ContextoTenant.obtenerONulo();

    if (excepcion instanceof HttpException) {
      const cuerpo = excepcion.getResponse();
      res
        .status(excepcion.getStatus())
        .json(
          typeof cuerpo === 'object' && cuerpo !== null && 'error' in cuerpo
            ? cuerpo
            : { error: { code: 'HTTP_ERROR', message: excepcion.message } },
        );
      return;
    }

    if (excepcion instanceof DomainError) {
      // La invariante violada es culpa de la entrada (422); el estado inválido es un
      // conflicto con la realidad actual (409); el resto, no encontrado o petición mala.
      const estado =
        excepcion instanceof InvariantError
          ? HttpStatus.UNPROCESSABLE_ENTITY
          : excepcion instanceof EstadoInvalidoError
            ? HttpStatus.CONFLICT
            : excepcion instanceof NoAutenticadoError
              ? HttpStatus.UNAUTHORIZED
              : excepcion instanceof ProhibidoError
                ? HttpStatus.FORBIDDEN
                : excepcion instanceof DemasiadosIntentosError
                  ? HttpStatus.TOO_MANY_REQUESTS
                  : /_NO_ENCONTRAD[OA]$/.test(excepcion.code)
                    ? HttpStatus.NOT_FOUND
                    : HttpStatus.BAD_REQUEST;

      this.log.warn(
        `${excepcion.code}: ${excepcion.message}` +
          (ctx ? `  [tenant ${ctx.tenantId} · traza ${ctx.trazaId}]` : ''),
      );

      res.status(estado).json({ error: { code: excepcion.code, message: excepcion.message } });
      return;
    }

    // Errores de cliente de los analizadores de cuerpo (body-parser/http-errors): un cuerpo por
    // encima del tope es 413, un JSON malformado es 400. No son HttpException de Nest, y sin esto
    // caían en el 500 de abajo: Meta reintenta los 5xx, y un cuerpo enorme se reintentaría solo.
    const estadoDeCliente = estadoDeClienteDeHttpErrors(excepcion);
    if (estadoDeCliente !== null) {
      res.status(estadoDeCliente).json({
        error: {
          code: estadoDeCliente === 413 ? 'CUERPO_DEMASIADO_GRANDE' : 'PETICION_INVALIDA',
          message:
            estadoDeCliente === 413
              ? 'El cuerpo supera el tamaño permitido.'
              : 'Petición inválida.',
        },
      });
      return;
    }

    // Lo inesperado se registra entero, pero hacia fuera NO sale el detalle: un stack trace
    // o un mensaje de PostgreSQL filtran nombres de tablas y estructura interna.
    this.log.error(
      `Error no controlado${ctx ? ` [tenant ${ctx.tenantId} · traza ${ctx.trazaId}]` : ''}`,
      excepcion instanceof Error ? excepcion.stack : String(excepcion),
    );

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'ERROR_INTERNO',
        message: 'Ocurrió un error inesperado. El equipo ya tiene el detalle.',
        ...(ctx ? { details: { trazaId: ctx.trazaId } } : {}),
      },
    });
  }
}

/** El estado 4xx de un error de http-errors marcado como exponible; null si no lo es. */
function estadoDeClienteDeHttpErrors(e: unknown): number | null {
  if (typeof e !== 'object' || e === null) return null;
  const { status, expose } = e as { status?: unknown; expose?: unknown };
  return expose === true && typeof status === 'number' && status >= 400 && status < 500
    ? status
    : null;
}
