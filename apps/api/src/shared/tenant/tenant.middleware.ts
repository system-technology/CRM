/**
 * Establece el contexto de tenant para cada petición.
 *
 * Es middleware y no interceptor a propósito: corre antes que cualquier guardia, controlador o
 * manejador de excepciones, de modo que **ninguna ruta puede ejecutarse fuera de contexto**.
 * Un interceptor dejaría huecos.
 *
 * REGLA QUE NO SE NEGOCIA: el `tenantId` se deriva de la sesión. Nunca de la ruta, del cuerpo,
 * de la cadena de consulta ni de una cabecera que el cliente controle. Un `tenantId` que viaja
 * en la petición permite que un usuario autenticado lea los datos de otra agencia cambiando un
 * valor, y es un hallazgo crítico de auditoría.
 *
 * **Desde ADR-0011 la sesión es real.** El middleware le pregunta a `identity`, por el puerto
 * `ResolutorDeAcceso`, y esta responde con los pasos 3 y 4 del flujo ya cumplidos: sesión viva,
 * `tenant_activo_id` de la sesión revalidado bajo RLS contra `usuarios`, agencia no suspendida.
 *
 * **El atajo de desarrollo** (`x-dev-tenant-id`) sobrevive solo con `APP_ENV=local` y solo
 * cuando NO se presenta ninguna sesión: una sesión real siempre gana, y una agencia suspendida,
 * una baja o una cookie revocada no se saltan con una cabecera. En cualquier otro entorno la cabecera se ignora.
 */

import {
  Inject,
  Injectable,
  Logger,
  type NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PERMISOS } from '@viajapro/contracts';
import type { NextFunction, Request, Response } from 'express';
import { ResolutorDeAcceso, presentaCookieDeSesion } from '../puertos/puerto-de-acceso.js';
import { ContextoTenant, type ContextoPeticion } from './contexto-tenant.js';

/**
 * Rutas que legítimamente no tienen tenant.
 *
 * **Coincidencia EXACTA para la autenticación.** Antes era todo el prefijo `/api/v1/auth/`, y
 * cualquier ruta que se añadiera ahí quedaba sin tenant sin que nadie lo decidiera. Ahora cada
 * ruta sin tenant es una línea de esta lista, y lo que no esté falla cerrado (401).
 * Todas hacen su propia comprobación: iniciar sesión verifica la contraseña o el código, aceptar
 * una invitación consume su token, y las demás leen la cookie por `identity`.
 */
export const RUTAS_DE_AUTENTICACION_SIN_TENANT: ReadonlySet<string> = new Set([
  '/api/v1/auth/sign-in/email',
  '/api/v1/auth/sign-out',
  '/api/v1/auth/session',
  '/api/v1/auth/tenant-activo',
  '/api/v1/auth/otp/enviar',
  '/api/v1/auth/otp/iniciar-sesion',
  '/api/v1/auth/invitaciones/aceptar',
]);

const RUTAS_SIN_TENANT = [/^\/salud/, /^\/webhooks\//];

export function esRutaSinTenant(ruta: string): boolean {
  return (
    RUTAS_DE_AUTENTICACION_SIN_TENANT.has(ruta) || RUTAS_SIN_TENANT.some((re) => re.test(ruta))
  );
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly log = new Logger(TenantMiddleware.name);

  constructor(@Inject(ResolutorDeAcceso) private readonly acceso: ResolutorDeAcceso) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    // `originalUrl` y no `path`: cuando el middleware corre bajo un punto de montaje, Express
    // recorta `path`, y una ruta de la lista de exclusión dejaría de coincidir sin que nadie
    // lo note hasta que /salud empiece a pedir autenticación.
    const ruta = (req.originalUrl || req.url || '').split('?')[0] ?? '';

    if (esRutaSinTenant(ruta)) {
      next();
      return;
    }

    const resultado = await this.acceso.resolver({ cookie: req.headers.cookie ?? null });
    for (const c of resultado.cookies) res.append('Set-Cookie', c);

    const trazaId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();

    let contexto: ContextoPeticion;
    if (resultado.concedido) {
      contexto = {
        tenantId: resultado.acceso.tenantId,
        usuarioId: resultado.acceso.usuarioId,
        identidadId: resultado.acceso.identidadId,
        permisos: resultado.acceso.permisos,
        trazaId,
      };
    } else {
      // El atajo solo es para quien NO presenta sesión. Una cookie de sesión que ya no vale
      // (revocada, caducada, de una agencia suspendida) es un 401, no un permiso para probar
      // con una cabecera.
      const dev =
        resultado.motivo === 'SIN_SESION' && !presentaCookieDeSesion(req.headers.cookie)
          ? this.atajoDeDesarrollo(req)
          : null;
      if (!dev) {
        throw new UnauthorizedException({
          error: { code: resultado.motivo, message: MENSAJES[resultado.motivo] },
        });
      }
      contexto = { ...dev, trazaId };
    }

    res.setHeader('x-request-id', contexto.trazaId);

    ContextoTenant.ejecutarCon(contexto, () => next());
  }

  /**
   * Solo con `APP_ENV=local`, y solo sin sesión. Se lee `process.env` en cada petición —no al
   * construir— para que una prueba pueda comprobar que en otro entorno se ignora.
   *
   * Concede todos los permisos: es una conveniencia para trabajar en el cotizador sin pasar por
   * el inicio de sesión, y nada de lo que se hace así tiene por qué parecerse a un rol real.
   */
  private atajoDeDesarrollo(req: Request): Omit<ContextoPeticion, 'trazaId'> | null {
    if (process.env['APP_ENV'] !== 'local') return null;
    const tenantId = req.headers['x-dev-tenant-id'];
    if (typeof tenantId !== 'string' || tenantId.length === 0) return null;
    const usuarioId = req.headers['x-dev-usuario-id'];
    this.log.debug('Atajo de desarrollo: tenant por cabecera (APP_ENV=local, sin sesión).');
    return {
      tenantId,
      usuarioId: typeof usuarioId === 'string' ? usuarioId : null,
      identidadId: null,
      permisos: new Set(PERMISOS),
    };
  }
}

const MENSAJES = {
  SIN_SESION: 'Se requiere autenticación.',
  SIN_AGENCIA_ACTIVA: 'Elige una agencia para continuar.',
  ACCESO_REVOCADO: 'Ya no tienes acceso a esta agencia. Inicia sesión de nuevo.',
  AGENCIA_SUSPENDIDA: 'La agencia está suspendida.',
} as const;
