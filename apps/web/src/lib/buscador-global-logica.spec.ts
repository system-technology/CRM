import { describe, expect, it } from 'vitest';
import {
  normalizarTexto,
  construirIndiceGlobal,
  buscarEnIndiceGlobal,
} from './buscador-global-logica';

describe('Pruebas Unitarias del Buscador Global Omnicanal (buscador-global-logica.ts)', () => {
  describe('normalizarTexto', () => {
    it('elimina tildes y convierte a minúsculas', () => {
      expect(normalizarTexto('Cancún Todo Incluído')).toBe('cancun todo incluido');
      expect(normalizarTexto('  BOGOTÁ, D.C.  ')).toBe('bogota, d.c.');
    });
  });

  describe('construirIndiceGlobal', () => {
    it('genera el índice con todas las categorías requeridas', () => {
      const indice = construirIndiceGlobal();
      expect(indice.length).toBeGreaterThan(15);

      const categorias = new Set(indice.map((i) => i.categoria));
      expect(categorias.has('acciones')).toBe(true);
      expect(categorias.has('conversaciones')).toBe(true);
      expect(categorias.has('contactos')).toBe(true);
      expect(categorias.has('oportunidades')).toBe(true);
      expect(categorias.has('viajes')).toBe(true);
      expect(categorias.has('catalogo')).toBe(true);
    });
  });

  describe('buscarEnIndiceGlobal', () => {
    it('devuelve acciones sugeridas cuando la consulta está vacía', () => {
      const resultados = buscarEnIndiceGlobal('');
      expect(resultados.acciones.length).toBeGreaterThan(0);
      expect(resultados.conversaciones).toHaveLength(0);
    });

    it('encuentra paquetes turísticos por destino o mayorista', () => {
      const resultados = buscarEnIndiceGlobal('Cancún');
      expect(resultados.catalogo.length).toBeGreaterThan(0);
      const cancun = resultados.catalogo.find(
        (p) =>
          p.titulo.toLowerCase().includes('cancun') || p.titulo.toLowerCase().includes('cancún'),
      );
      expect(cancun).toBeDefined();
    });

    it('encuentra archivos de viaje por código o destino', () => {
      const resultados = buscarEnIndiceGlobal('EXP-2026');
      expect(resultados.viajes.length).toBeGreaterThan(0);
      expect(resultados.viajes[0]?.titulo).toContain('EXP-2026');
    });

    it('encuentra contactos por nombre o teléfono', () => {
      const resultados = buscarEnIndiceGlobal('Juan');
      expect(resultados.contactos.length).toBeGreaterThan(0);
      expect(resultados.contactos[0]?.titulo).toContain('Juan');
    });

    it('encuentra conversaciones por contenido del mensaje o contacto', () => {
      const resultados = buscarEnIndiceGlobal('paquete');
      const totalEncontrados =
        resultados.conversaciones.length +
        resultados.oportunidades.length +
        resultados.catalogo.length;
      expect(totalEncontrados).toBeGreaterThan(0);
    });

    it('respeta el límite por categoría', () => {
      const resultados = buscarEnIndiceGlobal('de', undefined, 2);
      for (const cat of Object.keys(resultados) as (keyof typeof resultados)[]) {
        expect(resultados[cat].length).toBeLessThanOrEqual(2);
      }
    });
  });
});
