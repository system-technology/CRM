import { afterEach, describe, expect, it, vi } from 'vitest';
import { NAVEGACION, ACCIONES } from './navegacion';
import { listarArchivos, obtenerArchivo } from './archivos-api';
import { obtenerFichaDeContacto } from './crm-api';
import { obtenerCotizacionGuardadaApi } from './cotizaciones-api';
import { obtenerConversacionDetalleMock } from './mock-inbox';
import {
  normalizarTexto,
  construirIndiceGlobal,
  buscarEnIndiceGlobal,
} from './buscador-global-logica';

const archivosDeLaPantalla = () => listarArchivos('TODOS');

describe('Pruebas Unitarias del Buscador Global Omnicanal (buscador-global-logica.ts)', () => {
  describe('normalizarTexto', () => {
    it('elimina tildes y convierte a minúsculas', () => {
      expect(normalizarTexto('Cancún Todo Incluído')).toBe('cancun todo incluido');
      expect(normalizarTexto('  BOGOTÁ, D.C.  ')).toBe('bogota, d.c.');
    });
  });

  describe('construirIndiceGlobal', () => {
    it('genera el índice con todas las categorías requeridas', async () => {
      const indice = construirIndiceGlobal(undefined, await archivosDeLaPantalla());
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

  describe('comandos derivados de NAVEGACION', () => {
    it('hay un comando por entrada de la tabla, con su etiqueta, más las acciones', () => {
      const comandos = construirIndiceGlobal().filter((i) => i.categoria === 'acciones');
      for (const m of NAVEGACION) {
        expect(comandos.some((c) => c.titulo === m.etiqueta && c.href === m.ruta)).toBe(true);
      }
      for (const a of ACCIONES) {
        expect(comandos.some((c) => c.titulo === a.etiqueta && c.href === a.ruta)).toBe(true);
      }
    });

    it('escribir la etiqueta de cada módulo de la tabla devuelve ese módulo', () => {
      for (const m of NAVEGACION) {
        const { acciones } = buscarEnIndiceGlobal(m.etiqueta);
        expect(
          acciones.some((c) => c.titulo === m.etiqueta && c.href === m.ruta),
          m.etiqueta,
        ).toBe(true);
      }
    });

    it('el módulo cuyo nombre se escribe va primero, antes que otro que solo lo menciona', () => {
      // La descripción de «Hoy» menciona «seguimientos»: Enter debe llevar a Seguimientos.
      expect(buscarEnIndiceGlobal('seguimientos').acciones[0]?.href).toBe('/seguimientos');
      expect(buscarEnIndiceGlobal('cotizaciones').acciones[0]?.href).toBe('/cotizaciones');
    });

    it('«hoy», «cotizaciones» y «seguimientos» devuelven su módulo', () => {
      const hoy = buscarEnIndiceGlobal('hoy');
      expect(hoy.acciones.some((i) => i.titulo === 'Hoy' && i.href === '/')).toBe(true);
      const cot = buscarEnIndiceGlobal('cotizaciones');
      expect(
        cot.acciones.some((i) => i.titulo === 'Cotizaciones' && i.href === '/cotizaciones'),
      ).toBe(true);
      const seg = buscarEnIndiceGlobal('seguimientos');
      expect(
        seg.acciones.some((i) => i.titulo === 'Seguimientos' && i.href === '/seguimientos'),
      ).toBe(true);
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

    it('sin archivos de la pantalla no inventa archivos de viaje', () => {
      expect(buscarEnIndiceGlobal('1043').viajes).toHaveLength(0);
    });

    it('«1043» y un destino devuelven un archivo que la pantalla de /viajes resuelve', async () => {
      const archivos = await archivosDeLaPantalla();
      for (const consulta of ['1043', 'San Andrés']) {
        const { viajes } = buscarEnIndiceGlobal(
          consulta,
          undefined,
          4,
          'todos',
          undefined,
          archivos,
        );
        expect(viajes.length, consulta).toBeGreaterThan(0);
        for (const v of viajes) {
          const id = new URL(v.href, 'http://x').searchParams.get('id') ?? '';
          const abierto = await obtenerArchivo(id);
          expect(abierto.id).toBe(id);
        }
      }
      const porNumero = buscarEnIndiceGlobal('1043', undefined, 4, 'todos', undefined, archivos);
      const id = new URL(porNumero.viajes[0]!.href, 'http://x').searchParams.get('id') ?? '';
      // El file 1043 de la pantalla es el que se abre, no otro con el mismo número.
      expect((await obtenerArchivo(id)).numero).toBe(1043);
      expect(porNumero.viajes[0]?.titulo).toContain('File 1043');
    });

    it('cada archivo del índice lleva a /viajes?id= con un id que existe', async () => {
      const archivos = await archivosDeLaPantalla();
      const viajes = construirIndiceGlobal(undefined, archivos).filter(
        (i) => i.categoria === 'viajes',
      );
      expect(viajes).toHaveLength(archivos.length);
      for (const v of viajes) {
        const id = v.href.replace('/viajes?id=', '');
        await expect(obtenerArchivo(id)).resolves.toBeDefined();
      }
    });

    it('cada contacto, conversación y cotización indexados lleva a algo que la pantalla abre', async () => {
      const indice = construirIndiceGlobal();
      const de = (c: string) => indice.filter((i) => i.categoria === c);
      expect(de('contactos').length).toBeGreaterThan(0);
      for (const i of de('contactos')) {
        const ficha = await obtenerFichaDeContacto(i.href.replace('/contactos/', ''));
        expect(ficha.contacto.id).toBe(i.href.replace('/contactos/', ''));
      }
      expect(de('conversaciones').length).toBeGreaterThan(0);
      for (const i of de('conversaciones')) {
        const det = await obtenerConversacionDetalleMock(i.href.replace('/bandeja/', ''), 0);
        expect(det, i.href).not.toBeNull();
      }
      expect(de('cotizaciones').length).toBeGreaterThan(0);
      for (const i of de('cotizaciones')) {
        const cot = await obtenerCotizacionGuardadaApi(i.href.replace('/cotizaciones/', ''));
        expect(cot.id).toBe(i.href.replace('/cotizaciones/', ''));
      }
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
      expect(indiceAsesor.some((i) => i.id === 'nav-configuracion')).toBe(false);
      // Reportes es visible para todos los roles (D3): el alcance lo impone el servidor
      expect(indiceAsesor.some((i) => i.id === 'nav-reportes')).toBe(true);

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
      expect(indiceAdmin.some((i) => i.id === 'nav-configuracion')).toBe(true);
      expect(indiceAdmin.some((i) => i.id === 'nav-reportes')).toBe(true);
    });

    it('respeta el límite por categoría', () => {
      const resultados = buscarEnIndiceGlobal('de', undefined, 2);
      for (const cat of Object.keys(resultados) as (keyof typeof resultados)[]) {
        expect(resultados[cat].length).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('con las pantallas en modo real', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('no ofrece contactos, chats, cotizaciones, oportunidades ni paquetes de demostración', () => {
      vi.stubEnv('NEXT_PUBLIC_USE_REAL_CRM', 'true');
      vi.stubEnv('NEXT_PUBLIC_USE_REAL_INBOX', 'true');
      const indice = construirIndiceGlobal();
      const categorias = new Set(indice.map((i) => i.categoria));
      expect([...categorias]).toEqual(['acciones']);
    });
  });
});
