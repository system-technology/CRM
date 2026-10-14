import { Controller, Get, Inject } from '@nestjs/common';
import { PrismaService } from './shared/prisma/prisma.service.js';

@Controller('salud')
export class SaludController {
  // `@Inject` explicito, y no es ceremonia: el transpilador de desarrollo (`tsx`) NO emite los
  // metadatos de decorador que Nest necesita para resolver el tipo. Sin esto, Nest construye la
  // clase CON CERO DEPENDENCIAS y sin quejarse, y el fallo sale como `undefined` en la primera
  // peticion real. Compila, arranca, y revienta al usarse. Ver cola 11c de `ESTADO.md`.
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
  async listo() {
    const [rol] = await this.prisma.$queryRaw<Array<{ usuario: string; bypassa: boolean }>>`
      SELECT current_user AS usuario,
             (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypassa
    `;
    const aislamientoOk = rol != null && !rol.bypassa;
    return {
      estado: aislamientoOk ? 'ok' : 'degradado',
      baseDeDatos: 'ok',
      rol: rol?.usuario ?? null,
      aislamiento: aislamientoOk ? 'forzado' : 'EL ROL PUEDE SALTARSE RLS',
    };
  }
}
