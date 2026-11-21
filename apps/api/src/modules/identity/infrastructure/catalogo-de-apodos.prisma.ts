/**
 * Lo que decide si la función de apodos puede estar encendida (ADR-0031 §4, precondición dura B3).
 *
 * `indiceDeApodosEsGlobal` mira el CATÁLOGO de Postgres (`pg_index`, `pg_class`, `pg_attribute`,
 * `pg_depend`: legibles por cualquier rol, sin privilegios de tabla) y compara por columnas
 * (`indkey`), no por el nombre del índice. `cuentaDeAgencias` lee `tenants` con el pool de la API:
 * es global y está en `excepciones_rls`, así que no necesita tenant (operación declarada).
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import {
  hayIndiceGlobalDeApodos,
  type IndiceUnicoDeAccesos,
  PuertoCatalogoDeApodos,
} from '../domain/puertos-de-apodos.js';
import { PrismaIdentidadService } from './prisma-identidad.service.js';

/**
 * Un índice único y válido por fila. `llaves` es `indkey` (columnas, 0 = expresión) y solo cuentan
 * las primeras `indnkeyatts` (las demás son de `INCLUDE`). La dependencia en `pg_depend` solo se
 * mira si el índice es parcial o de expresión: ahí el apodo puede estar dentro de la expresión o
 * del predicado y no en `indkey`.
 */
export const CONSULTA_DE_INDICES_DE_ACCESOS = `
WITH i AS (
  SELECT x.indexrelid, x.indrelid, x.indnkeyatts,
         (x.indpred IS NOT NULL) AS parcial,
         (x.indexprs IS NOT NULL) AS de_expresion,
         string_to_array(x.indkey::text, ' ')::int2[] AS llaves
    FROM pg_index x
    JOIN pg_class c ON c.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'accesos_identidad'
     AND x.indisunique AND x.indisvalid
), col AS (
  SELECT a.attrelid, a.attname::text AS nombre, a.attnum
    FROM pg_attribute a
   WHERE a.attrelid = 'public.accesos_identidad'::regclass
     AND a.attname IN ('apodo', 'tenant_acceso_id') AND NOT a.attisdropped
)
SELECT
  EXISTS (SELECT 1 FROM col WHERE col.nombre = 'apodo'
             AND col.attnum = ANY (i.llaves[1:i.indnkeyatts])) AS "apodoEnClave",
  EXISTS (SELECT 1 FROM col WHERE col.nombre = 'tenant_acceso_id'
             AND col.attnum = ANY (i.llaves[1:i.indnkeyatts])) AS "tenantEnClave",
  i.parcial AS "parcial",
  i.de_expresion AS "deExpresion",
  ((i.parcial OR i.de_expresion) AND EXISTS (
     SELECT 1 FROM pg_depend d JOIN col ON col.nombre = 'apodo' AND d.refobjsubid = col.attnum
      WHERE d.classid = 'pg_class'::regclass AND d.objid = i.indexrelid
        AND d.refobjid = i.indrelid)) AS "apodoEnExpresionOPredicado"
FROM i`;

@Injectable()
export class CatalogoDeApodosPrisma extends PuertoCatalogoDeApodos {
  private readonly log = new Logger(CatalogoDeApodosPrisma.name);

  constructor(
    @Inject(PrismaIdentidadService) private readonly identidad: PrismaIdentidadService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {
    super();
  }

  async indiceDeApodosEsGlobal(): Promise<boolean> {
    try {
      const filas = await this.identidad.$queryRawUnsafe<IndiceUnicoDeAccesos[]>(
        CONSULTA_DE_INDICES_DE_ACCESOS,
      );
      return hayIndiceGlobalDeApodos(filas);
    } catch (error) {
      // Falla cerrado: sin poder demostrar que el índice es por agencia, se trata como global.
      this.log.warn(
        `No se pudo leer el catálogo de índices de apodos; se trata como global (${error instanceof Error ? error.name : 'error'}).`,
      );
      return true;
    }
  }

  async cuentaDeAgencias(): Promise<number> {
    return this.prisma.sinTenantDeclarado('identity/contar-agencias-para-apodos', (tx) =>
      tx.tenant.count(),
    );
  }
}
