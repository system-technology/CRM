/**
 * Establece el contexto de tenant para cada petición.
 *
 * Es middleware y no interceptor a propósito: corre antes que cualquier guardia, controlador o
 * manejador de excepciones, de modo que **ninguna ruta puede ejecutarse fuera de contexto**.
 * Un interceptor dejaría huecos.
 *
 * REGLA QUE NO SE NEGOCIA: el `tenantId` se deriva del token de sesión. Nunca de la ruta, del
 * cuerpo, de la cadena de consulta ni de una cabecera que el cliente controle. Un `tenantId`
 * que viaja en la petición permite que un usuario autenticado lea los datos de otra agencia
 * cambiando un valor, y es un hallazgo crítico de auditoría.
 */

import { Injectable, Logger, type NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ContextoTenant, type ContextoPeticion } from './contexto-tenant.js';

/** Rutas que legítimamente no tienen tenant: salud, webhooks, autenticación. */
const RUTAS_SIN_TENANT = [/^\/salud/, /^\/webhooks\//, /^\/api\/v1\/auth\//];

/**
 * Sesión resuelta a partir del token.
 *
 * Mientras no exista el módulo de autenticación, se resuelve desde una cabecera de desarrollo
 * y SOLO cuando `APP_ENV` es local. En cualquier otro entorno, la ausencia de autenticación
 * es un 401: es preferible que la API no funcione a que funcione sin saber quién llama.
 */
interface Sesion {
  tenantId: string;
  usuarioId: string | null;
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly log = new Logger(TenantMiddleware.name);

  use(req: Request, res: Response, next: NextFunction): void {
    // `originalUrl` y no `path`: cuando el middleware corre bajo un punto de montaje, Express
    // recorta `path`, y una ruta de la lista de exclusión dejaría de coincidir sin que nadie
    // lo note hasta que /salud empiece a pedir autenticación.
    const ruta = (req.originalUrl || req.url || '').split('?')[0] ?? '';

    if (RUTAS_SIN_TENANT.some((re) => re.test(ruta))) {
      next();
      return;
    }

    const sesion = this.resolverSesion(req);
    if (!sesion) {
      throw new UnauthorizedException({
        error: { code: 'SIN_SESION', message: 'Se requiere autenticación.' },
      });
    }

    const contexto: ContextoPeticion = {
      tenantId: sesion.tenantId,
      usuarioId: sesion.usuarioId,
      trazaId: (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
    };

    res.setHeader('x-request-id', contexto.trazaId);

    ContextoTenant.ejecutarCon(contexto, () => next());
  }

  private resolverSesion(req: Request): Sesion | null {
    // TODO(auth): sustituir por la verificación del JWT cuando exista el módulo `identity`.
    // Hasta entonces, solo en local y por cabecera explícita.
    if (process.env['APP_ENV'] === 'local') {
      const tenantId = req.headers['x-dev-tenant-id'];
      if (typeof tenantId === 'string' && tenantId.length > 0) {
        const usuarioId = req.headers['x-dev-usuario-id'];
        return { tenantId, usuarioId: typeof usuarioId === 'string' ? usuarioId : null };
      }
      return null;
    }

    // Fuera de local no hay atajo. Cuando exista el módulo de autenticación, aquí se
    // verifica el token; mientras tanto, la API simplemente no atiende.
    this.log.error(
      'No hay módulo de autenticación y APP_ENV no es "local": toda petición se rechaza.',
    );
    return null;
  }
}
