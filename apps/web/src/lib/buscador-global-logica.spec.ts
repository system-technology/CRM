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
      expect(categorias.has('cotizaciones')).toBe(true);
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
      expect(resultados.cotizaciones).toHaveLength(0);
    });

    it('encuentra cotizaciones por título o destino de versión', () => {
      const resultados = buscarEnIndiceGlobal('San Andrés');
      expect(resultados.cotizaciones.length).toBeGreaterThan(0);
      expect(resultados.cotizaciones[0]?.titulo).toContain('San Andrés');
      expect(resultados.cotizaciones[0]?.href).toContain('/cotizaciones/');
    });

    it('filtra estrictamente por categoría cuando se especifica filtroCategoria', () => {
      const soloCotizaciones = buscarEnIndiceGlobal('San Andrés', undefined, 4, 'cotizaciones');
      expect(soloCotizaciones.cotizaciones.length).toBeGreaterThan(0);
      expect(soloCotizaciones.contactos).toHaveLength(0);
      expect(soloCotizaciones.acciones).toHaveLength(0);
    });

    it('devuelve elementos de la categoría seleccionada cuando la consulta está vacía pero hay filtro', () => {
      const catalogoVacio = buscarEnIndiceGlobal('', undefined, 4, 'catalogo');
      expect(catalogoVacio.catalogo.length).toBeGreaterThan(0);
      expect(catalogoVacio.acciones).toHaveLength(0);
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

    it('encuentra contactos por teléfono con formato o solo dígitos', () => {
      const resultadosDigitos = buscarEnIndiceGlobal('3000012345');
      expect(resultadosDigitos.contactos.length).toBeGreaterThan(0);
      expect(resultadosDigitos.contactos[0]?.subtitulo).toContain('3000012345');

      const resultadosEspaciados = buscarEnIndiceGlobal('+57 300 001 2345');
      expect(resultadosEspaciados.contactos.length).toBeGreaterThan(0);
      expect(resultadosEspaciados.contactos[0]?.titulo).toContain('Juan Pérez');
    });

    it('encuentra oportunidades por destino', () => {
      const resultados = buscarEnIndiceGlobal('San Andrés', undefined, 4, 'oportunidades');
      expect(resultados.oportunidades.length).toBeGreaterThan(0);
      expect(resultados.oportunidades[0]?.subtitulo).toContain('San Andrés');
    });

    it('respeta la visibilidad y permisos del rol (T-103)', () => {
      const sesionAsesor = {
        identidad: {
          id: '00000000-0000-4000-a000-000000000001',
          correo: 'asesor@viajapro.com',
          nombre: 'Carlos Asesor',
        },
        agencias: [],
        tenantActivoId: '00000000-0000-4000-8000-000000000001',
        acceso: {
          usuarioId: '00000000-0000-4000-a000-000000000001',
          rol: 'ASESOR',
          permisos: ['conversaciones.responder'],
        },
      } as const;

      const indiceAsesor = construirIndiceGlobal(
        sesionAsesor as unknown as import('@viajapro/contracts').SesionActual,
      );
      // No debe exponer configuración de agencia al asesor
      expect(indiceAsesor.some((i) => i.id === 'act-config')).toBe(false);
      // No debe exponer reportes restringidos al asesor sin permiso de margen
      expect(indiceAsesor.some((i) => i.id === 'act-reportes')).toBe(false);

      const sesionAdmin = {
        identidad: {
          id: '00000000-0000-4000-a000-000000000099',
          correo: 'admin@viajapro.com',
          nombre: 'Administrador',
        },
        agencias: [],
        tenantActivoId: '00000000-0000-4000-8000-000000000001',
        acceso: {
          usuarioId: '00000000-0000-4000-a000-000000000099',
          rol: 'ADMIN',
          permisos: [
            'usuarios.administrar',
            'roles.administrar',
            'catalogo.administrar',
            'cotizacion.ver_neto_y_margen',
            'conversaciones.ver_todas',
          ],
        },
      } as const;

      const indiceAdmin = construirIndiceGlobal(
        sesionAdmin as unknown as import('@viajapro/contracts').SesionActual,
      );
      expect(indiceAdmin.some((i) => i.id === 'act-config')).toBe(true);
      expect(indiceAdmin.some((i) => i.id === 'act-reportes')).toBe(true);
    });

    it('respeta el límite por categoría', () => {
      const resultados = buscarEnIndiceGlobal('de', undefined, 2);
      for (const cat of Object.keys(resultados) as (keyof typeof resultados)[]) {
        expect(resultados[cat].length).toBeLessThanOrEqual(2);
      }
    });
  });
});
