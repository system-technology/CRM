/**
 * Las cuatro rutas de autenticación (ADR-0011, rebanada 2). Contratos en
 * `packages/contracts/src/identidad.ts`.
 *
 *   POST /api/v1/auth/sign-in/email   iniciar sesión
 *   POST /api/v1/auth/sign-out        cerrar sesión
 *   GET  /api/v1/auth/session         sesión actual
 *   POST /api/v1/auth/tenant-activo   cambiar de agencia activa
 *
 * **Better Auth no está montado como ruta abierta.** Estas rutas lo invocan por dentro: iniciar y
 * cerrar sesión pasan por `auth.handler` —así se conservan su límite de intentos y su comprobación
 * de `Origin`—, y el resto de su superficie (listar sesiones, cambiar correo, restablecer
 * contraseña…) no es alcanzable desde fuera. Es también lo que permite que **el token de sesión
 * no salga nunca en el cuerpo de una respuesta**: la respuesta de Better Auth lo trae y aquí se
 * descarta; solo viaja en la cookie `HttpOnly`.
 *
 * Las cuatro están en `RUTAS_DE_AUTENTICACION_SIN_TENANT` por coincidencia exacta.
 */
import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import {
  CambiarAgenciaActiva as CambiarAgenciaActivaContrato,
  IniciarSesion,
  SesionActual,
} from '@viajapro/contracts';
import type { Request as PeticionExpress, Response as RespuestaExpress } from 'express';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import { errorDeAcceso } from '../application/errores.js';
import { CambiarAgenciaActiva } from '../application/cambiar-agencia-activa.use-case.js';
import { ObtenerSesionActual } from '../application/sesion-actual.use-case.js';
import { AUTH, origenesDeConfianza } from '../infrastructure/auth.provider.js';
import { type AuthDeViajaPro, RUTA_BASE_DE_AUTENTICACION } from '../infrastructure/crear-auth.js';
import { origenEsDeConfianza } from './origen.js';

/** Las cabeceras que Better Auth necesita ver: origen, cookie, agente y dirección del cliente. */
const CABECERAS_REENVIADAS = ['origin', 'cookie', 'user-agent'];

@Controller('api/v1/auth')
export class AuthController {
  constructor(
    @Inject(AUTH) private readonly auth: AuthDeViajaPro,
    @Inject(ObtenerSesionActual) private readonly sesionActual: ObtenerSesionActual,
    @Inject(CambiarAgenciaActiva) private readonly cambiarAgencia: CambiarAgenciaActiva,
  ) {}

  @Post('sign-in/email')
  @HttpCode(200)
  async iniciarSesion(
    @Body(new ZodValidationPipe(IniciarSesion)) body: IniciarSesion,
    @Req() req: PeticionExpress,
    @Res({ passthrough: true }) res: RespuestaExpress,
  ): Promise<SesionActual> {
    // Un navegador siempre manda `Origin` en un POST. Si viene y no es la web, se rechaza
    // aunque aún no haya cookie: Better Auth solo lo exige a quien ya trae una.
    const origen = req.headers.origin;
    if (origen !== undefined && !origenEsDeConfianza(origen, origenesDeConfianza(process.env))) {
      throw errorDeAcceso('ORIGEN_NO_CONFIABLE');
    }
    const respuesta = await this.llamarABetterAuth(req, '/sign-in/email', {
      email: body.correo,
      password: body.contrasena,
    });
    this.rechazarSiFallo(respuesta);

    // La cookie de la sesión recién creada, para resolverla con el mismo caso de uso que
    // cualquier otra petición (y que así revalide la agencia activa, si ya hay una).
    const cookiesNuevas = respuesta.headers.getSetCookie();
    const { sesion } = await this.sesionActual.ejecutar(cabeceraDeCookies(cookiesNuevas));

    for (const c of cookiesNuevas) res.append('Set-Cookie', c);
    return SesionActual.parse(sesion);
  }

  @Post('sign-out')
  @HttpCode(204)
  async cerrarSesion(
    @Req() req: PeticionExpress,
    @Res({ passthrough: true }) res: RespuestaExpress,
  ): Promise<void> {
    const respuesta = await this.llamarABetterAuth(req, '/sign-out', {});
    // Un 403 es un `Origin` ajeno: eso sí se rechaza. Cualquier otro caso (por ejemplo, ya no
    // había sesión) deja al usuario fuera igual, que es lo que pidió.
    if (respuesta.status === 403) throw errorDeAcceso('ORIGEN_NO_CONFIABLE');
    for (const c of respuesta.headers.getSetCookie()) res.append('Set-Cookie', c);
  }

  @Get('session')
  async leerSesion(
    @Req() req: PeticionExpress,
    @Res({ passthrough: true }) res: RespuestaExpress,
  ): Promise<SesionActual> {
    const { sesion, cookies } = await this.sesionActual.ejecutar(req.headers.cookie ?? null);
    for (const c of cookies) res.append('Set-Cookie', c);
    // La cabecera `Cache-Control` evita que un proxy sirva la sesión de uno a otro.
    res.setHeader('Cache-Control', 'no-store');
    return SesionActual.parse(sesion);
  }

  @Post('tenant-activo')
  @HttpCode(200)
  async cambiarDeAgencia(
    @Body(new ZodValidationPipe(CambiarAgenciaActivaContrato))
    body: CambiarAgenciaActivaContrato,
    @Req() req: PeticionExpress,
  ): Promise<SesionActual> {
    if (!origenEsDeConfianza(req.headers.origin, origenesDeConfianza(process.env))) {
      throw errorDeAcceso('ORIGEN_NO_CONFIABLE');
    }
    const cookie = req.headers.cookie ?? null;
    await this.cambiarAgencia.ejecutar(cookie, body.tenantId);
    const { sesion } = await this.sesionActual.ejecutar(cookie);
    return SesionActual.parse(sesion);
  }

  // ---------------------------------------------------------------------------------------

  private async llamarABetterAuth(
    req: PeticionExpress,
    ruta: string,
    cuerpo: Record<string, unknown>,
  ): Promise<RespuestaWeb> {
    const cabeceras = new Headers({ 'content-type': 'application/json' });
    for (const nombre of CABECERAS_REENVIADAS) {
      const valor = req.headers[nombre];
      if (typeof valor === 'string') cabeceras.set(nombre, valor);
    }
    // La IP del límite de intentos es `req.ip`: la del socket, o la que deduce Express con los
    // saltos de proxy de confianza configurados (`API_TRUST_PROXY`). NUNCA se reenvía el
    // `x-forwarded-for` del cliente: rotándolo se esquivaría el límite.
    const ip = req.ip ?? req.socket.remoteAddress;
    if (ip) cabeceras.set('x-forwarded-for', ip);

    const base = new URL(`http://interno${RUTA_BASE_DE_AUTENTICACION}${ruta}`);
    return this.auth.handler(
      new Request(base, { method: 'POST', headers: cabeceras, body: JSON.stringify(cuerpo) }),
    );
  }

  private rechazarSiFallo(respuesta: RespuestaWeb): void {
    if (respuesta.ok) return;
    if (respuesta.status === 429) throw errorDeAcceso('DEMASIADOS_INTENTOS');
    if (respuesta.status === 403) throw errorDeAcceso('ORIGEN_NO_CONFIABLE');
    // Contraseña errónea, correo inexistente, identidad dada de baja… Mismo código para todo:
    // quien llama no debe poder distinguir si el correo existe.
    if (respuesta.status === 401 || respuesta.status === 400) {
      throw errorDeAcceso('CREDENCIALES_INVALIDAS');
    }
    throw new Error(`Better Auth respondió ${respuesta.status} al iniciar sesión.`);
  }
}

/** `Response` de la API web estándar, para no chocar con el de Express importado arriba. */
type RespuestaWeb = Response;

/** `Cookie:` a partir de los `Set-Cookie` de una respuesta: solo `nombre=valor`. */
function cabeceraDeCookies(setCookies: readonly string[]): string {
  return setCookies.map((c) => c.split(';')[0]).join('; ');
}
