import { Controller, Get, Inject, HttpStatus, Optional, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Logger } from '@nestjs/common';
import { PrismaService } from './shared/prisma/prisma.service.js';
import { LectorDelLatido } from './shared/salud/latido-del-trabajador.js';

@Controller('salud')
export class SaludController {
  private readonly logger = new Logger(SaludController.name);

  // `@Inject` explicito, y no es ceremonia: el transpilador de desarrollo (`tsx`) NO emite los
  // metadatos de decorador que Nest necesita para resolver el tipo. Sin esto, Nest construye la
  // clase CON CERO DEPENDENCIAS y sin quejarse, y el fallo sale como `undefined` en la primera
  // peticion real. Compila, arranca, y revienta al usarse. Ver cola 11c de `ESTADO.md`.
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    // Opcional: sin lector (pruebas, modo unico, sin Redis) el latido no se informa ni se exige.
    @Optional() @Inject(LectorDelLatido) private readonly latido?: LectorDelLatido,
  ) {}

  /** Para el balanceador: ¿el proceso está vivo? */
  @Get()
  vivo() {
    return { estado: 'ok', en: new Date().toISOString() };
  }

  /**
   * ¿Puede atender de verdad?
   *
   * Comprueba la base de datos Y que el rol de conexión no pueda saltarse RLS. Lo segundo
   * no es paranoia: si alguien cambiara DATABASE_APP_URL al rol propietario, la API
   * seguiría respondiendo con normalidad mientras el aislamiento entre agencias sería
   * ficticio. Preferimos que el despliegue se marque como no listo.
   */
  @Get('listo')
  async listo(@Res({ passthrough: true }) res: Response) {
    try {
      const [rol] = await this.prisma.$queryRaw<Array<{ usuario: string; bypassa: boolean }>>`
        SELECT current_user AS usuario,
               (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypassa
      `;

      const aislamientoOk = rol != null && !rol.bypassa;

      if (!aislamientoOk) {
        res.status(HttpStatus.SERVICE_UNAVAILABLE);
        return {
          estado: 'degradado',
          baseDeDatos: 'ok',
          rol: rol?.usuario ?? null,
          aislamiento: 'EL ROL PUEDE SALTARSE RLS',
        };
      }

      // El trabajador viejo NO tumba la API (HTTP 200): Render usa esta ruta como sonda de la API
      // y un trabajador caido no debe impedir desplegarla ni sacarla de rotacion. Se informa en
      // el cuerpo (`estado: 'degradado'`) para la sonda de staging y para la vigilancia externa.
      const trabajador = this.latido ? await this.latido.leer() : null;
      res.status(HttpStatus.OK);
      return {
        estado: trabajador && trabajador.estado !== 'ok' ? 'degradado' : 'ok',
        baseDeDatos: 'ok',
        rol: rol?.usuario ?? null,
        aislamiento: 'forzado',
        ...(trabajador ? { trabajador } : {}),
      };
    } catch (error) {
      this.logger.error('Health check falló', error);
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        estado: 'degradado',
        baseDeDatos: 'caida',
        rol: null,
        aislamiento: 'sin verificar',
      };
    }
  }
}
