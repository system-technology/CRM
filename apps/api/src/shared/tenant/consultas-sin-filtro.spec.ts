import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Guardia de arquitectura (T-013, R1: defensa en profundidad).
 *
 * RLS es la barrera de fondo, pero una lectura de una tabla con `tenant_id` que no lleva `where`
 * depende SOLO de ella: si un dia se conecta el rol equivocado o se rompe la politica, devuelve
 * filas de otra agencia en silencio. Esta prueba falla si el codigo de produccion llama a
 * `findFirst`, `findMany`, `count`... sobre un modelo con `tenant_id` sin `where` (o sin argumentos).
 *
 * No exige `tenantId` en cada `where` (seria ruido: `where: { id }` ya es un filtro explicito y la
 * clave UUID no se adivina entre agencias): exige que la consulta NO sea «todo lo que RLS deje ver».
 */

const METODOS_DE_LECTURA = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

const RAIZ_API = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const SCHEMA = resolve(RAIZ_API, '../../packages/database/prisma/schema.prisma');

/** Delegados de Prisma (`politicaDePrecio`) de los modelos que tienen la columna `tenant_id`. */
export function delegadosConTenant(schema: string): Set<string> {
  const delegados = new Set<string>();
  for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, nombre, cuerpo] = m;
    if (nombre && cuerpo && /@map\("tenant_id"\)/.test(cuerpo)) {
      delegados.add(nombre.charAt(0).toLowerCase() + nombre.slice(1));
    }
  }
  return delegados;
}

export interface Hallazgo {
  linea: number;
  consulta: string;
}

export function consultasSinWhere(codigo: string, delegados: Set<string>): Hallazgo[] {
  const fuente = ts.createSourceFile('x.ts', codigo, ts.ScriptTarget.Latest, true);
  const hallazgos: Hallazgo[] = [];
  const visitar = (nodo: ts.Node): void => {
    if (
      ts.isCallExpression(nodo) &&
      ts.isPropertyAccessExpression(nodo.expression) &&
      METODOS_DE_LECTURA.has(nodo.expression.name.text) &&
      ts.isPropertyAccessExpression(nodo.expression.expression) &&
      delegados.has(nodo.expression.expression.name.text)
    ) {
      const arg = nodo.arguments[0];
      let sinWhere = false;
      if (!arg) sinWhere = true;
      else if (ts.isObjectLiteralExpression(arg)) {
        const tieneSpread = arg.properties.some((p) => ts.isSpreadAssignment(p));
        const tieneWhere = arg.properties.some(
          (p) => p.name !== undefined && ts.isIdentifier(p.name) && p.name.text === 'where',
        );
        sinWhere = !tieneWhere && !tieneSpread;
      }
      if (sinWhere) {
        hallazgos.push({
          linea: fuente.getLineAndCharacterOfPosition(nodo.getStart()).line + 1,
          consulta: nodo.expression.getText(fuente),
        });
      }
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(fuente);
  return hallazgos;
}

function archivosDeProduccion(dir: string): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivosDeProduccion(ruta));
    else if (nombre.endsWith('.ts') && !/\.(e2e-)?spec\.ts$/.test(nombre)) salida.push(ruta);
  }
  return salida;
}

describe('consultas sobre tablas con tenant_id (R1, defensa en profundidad)', () => {
  const delegados = delegadosConTenant(readFileSync(SCHEMA, 'utf8'));

  it('el esquema expone delegados con tenant (la guardia no esta vacia)', () => {
    expect(delegados.has('politicaDePrecio')).toBe(true);
    expect(delegados.has('conversacion')).toBe(true);
    expect(delegados.has('tenant')).toBe(false);
  });

  it('detecta findFirst() sin where sobre politicaDePrecio', () => {
    const h = consultasSinWhere(`await tx.politicaDePrecio.findFirst();`, delegados);
    expect(h).toEqual([{ linea: 1, consulta: 'tx.politicaDePrecio.findFirst' }]);
  });

  it('detecta un objeto de opciones sin where', () => {
    const h = consultasSinWhere(
      `await tx.etapaPipeline.findMany({ orderBy: { orden: 'asc' } });`,
      delegados,
    );
    expect(h).toHaveLength(1);
  });

  it('acepta consultas con where y tablas globales', () => {
    const codigo = `
      await tx.politicaDePrecio.findFirst({ where: { tenantId } });
      await tx.tenant.findMany({ select: { id: true } });
      await tx.politicaDePrecio.findUnique({ where: { tenantId } });`;
    expect(consultasSinWhere(codigo, delegados)).toEqual([]);
  });

  it('ninguna lectura de produccion sobre una tabla con tenant carece de where', () => {
    const encontrados = archivosDeProduccion(join(RAIZ_API, 'src')).flatMap((archivo) =>
      consultasSinWhere(readFileSync(archivo, 'utf8'), delegados).map(
        (h) => `${relative(RAIZ_API, archivo)}:${h.linea} ${h.consulta}()`,
      ),
    );
    expect(encontrados).toEqual([]);
  });
});
