/**
 * Middleware global de comprobación de `Origin` en **todas** las mutaciones de la API.
 *
 * Reglas:
 * - Saltar métodos seguros: `GET`, `HEAD`, `OPTIONS`.
 * - Saltar rutas de webhooks: `/webhooks/*` (Meta no envía `Origin`, es server-to-server).
 * - Saltar health-check: `/salud/*`.
 * - Si la petición es mutación y trae `Origin`:
 *   - Usar `origenEsDeConfianza()` existente para validar contra `origenesDeConfianzaDeLaWeb()`.
 *   - Si no es de confianza → responder **403** con error `ORIGEN_NO_CONFIABLE`.
 * - Si la petición es mutación y **no** trae `Origin` → **permitir** (server-to-server, webhooks firmados, scripts internos).
 *
 * IMPORTANTE: Este middleware debe registrarse **antes** del `TenantMiddleware` para que corte
 * antes de tocar la base de datos.
 */

import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { ProhibidoError } from '@viajapro/domain';
import { origenEsDeConfianza, origenesDeConfianzaDeLaWeb } from './origen.js';

/** Métodos HTTP que NO son mutaciones. */
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Rutas que siempre se excluyen de la comprobación de Origin. */
const RUTAS_EXCLUIDAS = [/^\/salud/, /^\/webhooks\//];

/** Error concreto para `ORIGEN_NO_CONFIABLE` (hereda de ProhibidoError → 403). */
export class OrigenNoConfiableError extends ProhibidoError {
  readonly code = 'ORIGEN_NO_CONFIABLE' as const;

  constructor() {
    super('Origen no permitido.');
  }
}

@Injectable()
export class OriginCheckMiddleware implements NestMiddleware {
  private readonly log = new Logger(OriginCheckMiddleware.name);

  use(req: Request, res: Response, next: NextFunction): void {
    // 1) Solo comprobar mutaciones
    const metodo = req.method?.toUpperCase() ?? '';
    if (METODOS_SEGUROS.has(metodo)) {
      next();
      return;
    }

    // 2) Excluir rutas de webhooks y health-check
    const ruta = (req.originalUrl || req.url || '').split('?')[0] ?? '';
    if (RUTAS_EXCLUIDAS.some((re) => re.test(ruta))) {
      next();
      return;
    }

    // 3) Obtener Origin y lista de confianza
    const origen = req.headers.origin;
    const deConfianza = origenesDeConfianzaDeLaWeb(process.env);

    // 4) Si NO hay Origin (undefined) → permitir (server-to-server, scripts internos, etc.)
    // Nota: cadena vacía o 'null' se tratan como origen inválido y se validan abajo.
    if (origen === undefined) {
      next();
      return;
    }

    // 5) Si hay Origin → validar contra la lista de confianza
    const esDeConfianza = origenEsDeConfianza(origen, deConfianza);

    if (!esDeConfianza) {
      this.log.warn(`Origin no permitido: ${origen} (método: ${metodo}, ruta: ${ruta})`);
      // Nest lo traduce a 403 vía el filtro global DominioExcepcionFilter
      throw new OrigenNoConfiableError();
    }

    // 6) Origin de confianza → continuar
    next();
  }
}
