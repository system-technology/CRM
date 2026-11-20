import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { esRutaPublica } from '../lib/rutas-publicas';

/**
 * Inventario de rutas (ADR-0032 §2): el árbol de archivos y `rutas-publicas.ts` tienen que decir lo
 * mismo. `GuardaSesion` deniega por defecto, así que una página privada fuera de `(app)/` se vería
 * sin marco, y una pública dentro de `(app)/` se vería con el marco de una sesión que no existe.
 */
const RAIZ_APP = dirname(fileURLToPath(import.meta.url));
const GRUPOS_PRIVADOS = ['(app)', '(impresion)'];

function listarPaginas(dir: string): string[] {
  const encontradas: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) encontradas.push(...listarPaginas(ruta));
    else if (nombre === 'page.tsx') encontradas.push(ruta);
  }
  return encontradas;
}

/** `(app)/cotizaciones/[id]/page.tsx` -> `/cotizaciones/[id]`; los grupos no cuentan en la URL. */
function urlDePagina(archivo: string): string {
  const segmentos = relative(RAIZ_APP, dirname(archivo))
    .split(sep)
    .filter((s) => s !== '' && !/^\(.*\)$/.test(s));
  return '/' + segmentos.join('/');
}

function esPrivadaPorUbicacion(archivo: string): boolean {
  const primero = relative(RAIZ_APP, archivo).split(sep)[0] ?? '';
  return GRUPOS_PRIVADOS.includes(primero);
}

const paginas = listarPaginas(RAIZ_APP);

describe('inventario de rutas del App Router', () => {
  it('encuentra las páginas (la prueba no pasa en vacío)', () => {
    expect(paginas.length).toBeGreaterThan(20);
    expect(paginas.map(urlDePagina)).toContain('/');
    expect(paginas.map(urlDePagina)).toContain('/ingresar');
  });

  it('toda página fuera de (app)/ e (impresion)/ es pública', () => {
    const fuera = paginas.filter((p) => !esPrivadaPorUbicacion(p));
    const privadasFuera = fuera.map(urlDePagina).filter((u) => !esRutaPublica(u));
    expect(privadasFuera).toEqual([]);
  });

  it('ninguna página dentro de (app)/ o (impresion)/ es pública', () => {
    const dentro = paginas.filter(esPrivadaPorUbicacion);
    expect(dentro.length).toBeGreaterThan(10);
    const publicasDentro = dentro.map(urlDePagina).filter((u) => esRutaPublica(u));
    expect(publicasDentro).toEqual([]);
  });

  it('la vista imprimible vive en (impresion)/, sin marco', () => {
    const imprimir = paginas.filter((p) => urlDePagina(p) === '/cotizaciones/[id]/imprimir');
    expect(imprimir).toHaveLength(1);
    expect(relative(RAIZ_APP, imprimir[0] ?? '').split(sep)[0]).toBe('(impresion)');
  });

  it('ninguna página importa BarraModulos: el marco lo monta (app)/layout.tsx', () => {
    const infractoras = paginas.filter((p) => /barra-modulos/.test(readFileSync(p, 'utf8')));
    expect(infractoras.map((p) => relative(RAIZ_APP, p))).toEqual([]);
  });
});
