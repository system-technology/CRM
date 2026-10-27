/**
 * Límite de tasa general de la API (T-002). Dos barreras con el mismo núcleo:
 *
 * 1. `LimiteDeTasaPorIpMiddleware`, ANTES de `TenantMiddleware`: cuenta por IP y corta antes de
 *    tocar la base (resolver la sesión consulta Postgres).
 * 2. `LimiteDeTasaPorTenantMiddleware`, DESPUÉS: cuenta por agencia con el `tenantId` que
 *    resolvió la sesión. Nunca se lee de una cabecera, la ruta ni el cuerpo. Una agencia no
 *    puede agotar el cupo de otra porque la clave lleva su identificador.
 *
 * La IP es `req.ip`: Express solo mira `x-forwarded-for` si `API_TRUST_PROXY` lo autoriza
 * (`main.ts`); sin eso es la dirección del socket y la cabecera no sirve para esquivar.
 *
 * Exentos: `/salud` (las sondas no deben caer) y `/webhooks/` (Meta reintenta y firma cada
 * petición; limitarlos pierde mensajes). Si el almacén falla, se deja pasar y se registra el
 * error: una caída de Redis no debe tumbar la API entera.
 */
import { Inject, Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ContextoTenant } from '../../tenant/contexto-tenant.js';
import type { AlmacenDeContadores, LecturaDeContador } from './almacen.js';
import type { PoliticaDeLimiteDeTasa } from './politica.js';

export const POLITICA_DE_LIMITE_DE_TASA = Symbol('POLITICA_DE_LIMITE_DE_TASA');
export const ALMACEN_DE_LIMITE_DE_TASA = Symbol('ALMACEN_DE_LIMITE_DE_TASA');

const RUTAS_EXENTAS = [/^\/salud/, /^\/webhooks\//];

export function rutaExentaDeLimiteDeTasa(ruta: string): boolean {
  return RUTAS_EXENTAS.some((re) => re.test(ruta));
}

abstract class LimiteDeTasaBase implements NestMiddleware {
  protected readonly log = new Logger(this.constructor.name);

  constructor(
    protected readonly politica: PoliticaDeLimiteDeTasa,
    protected readonly almacen: AlmacenDeContadores,
  ) {}

  protected abstract clave(req: Request): string | null;
  protected abstract maximo(): number;

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!this.politica.activo) return next();
    const ruta = (req.originalUrl || req.url || '').split('?')[0] ?? '';
    if (rutaExentaDeLimiteDeTasa(ruta)) return next();
    const clave = this.clave(req);
    if (clave === null) return next();

    let lectura: LecturaDeContador;
    try {
      lectura = await this.almacen.consumir(clave, this.politica.ventanaSegundos);
    } catch (error) {
      this.log.error(
        `Almacén del límite de tasa no disponible; se deja pasar: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return next();
    }
    if (lectura.cuenta > this.maximo()) {
      res.setHeader('Retry-After', String(lectura.segundosRestantes));
      res.status(429).json({
        error: {
          code: 'LIMITE_DE_TASA',
          message: 'Demasiadas peticiones. Reintenta en unos segundos.',
        },
      });
      return;
    }
    next();
  }
}

@Injectable()
export class LimiteDeTasaPorIpMiddleware extends LimiteDeTasaBase {
  constructor(
    @Inject(POLITICA_DE_LIMITE_DE_TASA) politica: PoliticaDeLimiteDeTasa,
    @Inject(ALMACEN_DE_LIMITE_DE_TASA) almacen: AlmacenDeContadores,
  ) {
    super(politica, almacen);
  }
  protected clave(req: Request): string {
    return `viajapro:tasa:ip:${req.ip ?? 'desconocida'}`;
  }
  protected maximo(): number {
    return this.politica.porIp;
  }
}

@Injectable()
export class LimiteDeTasaPorTenantMiddleware extends LimiteDeTasaBase {
  constructor(
    @Inject(POLITICA_DE_LIMITE_DE_TASA) politica: PoliticaDeLimiteDeTasa,
    @Inject(ALMACEN_DE_LIMITE_DE_TASA) almacen: AlmacenDeContadores,
  ) {
    super(politica, almacen);
  }
  /** Sin contexto (rutas de autenticación sin tenant) no hay agencia que medir: solo cuenta la IP. */
  protected clave(): string | null {
    const contexto = ContextoTenant.obtenerONulo();
    return contexto ? `viajapro:tasa:tenant:${contexto.tenantId}` : null;
  }
  protected maximo(): number {
    return this.politica.porTenant;
  }
}
