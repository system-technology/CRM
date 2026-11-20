import { Inject, Injectable, Logger } from '@nestjs/common';
import { ContadorDeFallosDeCodigo } from '../application/limitador-de-envios.js';
import { PrismaIdentidadService } from './prisma-identidad.service.js';

/** Filas vencidas que se borran por cada fallo registrado: acota el crecimiento sin barrer todo. */
const VENCIDAS_POR_BARRIDO = 100;

/**
 * Contador de fallos del código en Postgres, sin migración: una fila de `verificaciones` (tabla
 * global del rol `viajapro_identidad`, R2) por cada fallo, con `identificador` = la clave HMAC
 * (`viajapro:otp-fallos:...` o `viajapro:ingreso-fallos:...`, nunca el correo ni el apodo en claro), `valor` = '1' y `expira_en` = ahora + la
 * ventana. Bloqueado = filas vigentes >= máximo. No choca con las filas de Better Auth, cuyo
 * identificador es `sign-in-otp-<correo>`.
 *
 * Sobrevive a reinicios y a varias réplicas; el INSERT precede al conteo, así que peticiones
 * simultáneas se cuentan todas. Consultar (`quedaCupo`) falla cerrado si la base falla; registrar
 * un fallo no depende de la limpieza de vencidas.
 */
@Injectable()
export class ContadorDeFallosPostgres extends ContadorDeFallosDeCodigo {
  private readonly log = new Logger(ContadorDeFallosPostgres.name);

  constructor(@Inject(PrismaIdentidadService) private readonly prisma: PrismaIdentidadService) {
    super();
  }

  async consumir(
    clave: string,
    maximo: number,
    ventanaSegundos: number,
    prefijoDelBarrido: string,
  ): Promise<boolean> {
    // Primero contar: el fallo ya ocurrió (Better Auth comparó el código) y no puede quedar sin
    // registrar porque falle la limpieza.
    await this.prisma.$executeRaw`
      INSERT INTO verificaciones (id, identificador, valor, expira_en, creado_en, actualizado_en)
      VALUES (gen_random_uuid(), ${clave}, '1', now() + make_interval(secs => ${ventanaSegundos}), now(), now())`;
    // Barrido oportunista de filas vencidas de este prefijo (con LIMIT). Si falla, no impide contar.
    // El prefijo lo pone cada tope (constantes sin `%` ni `_`), nunca una entrada externa.
    const patron = `${prefijoDelBarrido}%`;
    try {
      await this.prisma.$executeRaw`
        DELETE FROM verificaciones
         WHERE id IN (SELECT id FROM verificaciones
                       WHERE identificador LIKE ${patron} AND expira_en <= now()
                       LIMIT ${VENCIDAS_POR_BARRIDO})`;
    } catch (error) {
      this.log.warn(
        `No se pudo barrer los fallos vencidos del código (${error instanceof Error ? error.name : 'error'}).`,
      );
    }
    return (await this.contar(clave)) <= maximo;
  }

  async quedaCupo(clave: string, maximo: number): Promise<boolean> {
    return (await this.contar(clave)) < maximo;
  }

  private async contar(clave: string): Promise<number> {
    const [fila] = await this.prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM verificaciones
       WHERE identificador = ${clave} AND expira_en > now()`;
    if (!fila) throw new Error('Postgres no devolvió el conteo de fallos del código.');
    return fila.n;
  }
}
