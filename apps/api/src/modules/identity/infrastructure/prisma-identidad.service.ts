/**
 * La conexión PROPIA de identidad: el rol `viajapro_identidad` sobre `DATABASE_IDENTIDAD_URL`.
 * ADR-0011, decisión subordinada 6.
 *
 * **Por qué no comparte pool con `PrismaService`.** Las tablas `identidades`, `credenciales`,
 * `sesiones` y `verificaciones` son globales —no llevan tenant, así que RLS no las protege— y
 * guardan los hashes de contraseña y las sesiones vivas de todas las agencias. Lo único que las
 * protege es el rol: solo `viajapro_identidad` puede tocarlas, y `viajapro_app`, con el que corre
 * el código de negocio, no tiene ningún privilegio sobre ellas. A la inversa, este rol no tiene
 * NINGÚN privilegio sobre las tablas de negocio. Dos pools, dos mundos, y ninguno ve el del otro.
 *
 * **Guardia de arranque (R2).** Como los demás procesos, aborta si el rol con el que entró no es
 * el que esperaba, si es superusuario o si tiene BYPASSRLS. Y además, aborta si ese rol puede leer
 * alguna tabla de negocio: la separación de arriba es una propiedad de los privilegios, y se
 * comprueba, no se supone. Sin respaldo de cadena: si falta `DATABASE_IDENTIDAD_URL`, no se
 * arranca.
 */
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  type RolDeConexion,
  TABLAS_DE_NEGOCIO_VEDADAS_A_IDENTIDAD,
  resolverCadena,
  verificarIdentidad,
  verificarSinPrivilegiosDeNegocio,
} from '../../../shared/prisma/guardia-de-rol.js';

const ROL_ESPERADO: RolDeConexion = 'viajapro_identidad';

@Injectable()
export class PrismaIdentidadService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PrismaIdentidadService.name);

  constructor() {
    super({
      datasources: { db: { url: resolverCadena(process.env, 'DATABASE_IDENTIDAD_URL') } },
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();

    const [rol] = await this.$queryRaw<
      Array<{ usuario: string; superusuario: boolean; saltaRls: boolean }>
    >`
      SELECT current_user AS usuario,
             COALESCE((SELECT rolsuper     FROM pg_roles WHERE rolname = current_user), false) AS "superusuario",
             COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user), false) AS "saltaRls"
    `;
    if (!rol) throw new Error('No se pudo determinar el rol de conexión de identidad.');

    const motivo = verificarIdentidad(
      { usuario: rol.usuario, esSuperusuario: rol.superusuario, saltaRls: rol.saltaRls },
      ROL_ESPERADO,
    );
    if (motivo) throw new Error(motivo);

    const legibles = await this.$queryRaw<Array<{ tabla: string }>>`
      SELECT t AS tabla
        FROM unnest(${[...TABLAS_DE_NEGOCIO_VEDADAS_A_IDENTIDAD]}::text[]) AS t
       WHERE has_table_privilege(current_user, format('public.%I', t), 'SELECT')
    `;
    const exceso = verificarSinPrivilegiosDeNegocio(legibles.map((f) => f.tabla));
    if (exceso) throw new Error(exceso);

    this.log.log(`Conectado como '${rol.usuario}', verificado contra '${ROL_ESPERADO}'.`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
