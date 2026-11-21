import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import React from 'react';
import { BarraModulos, calcularIniciales } from './barra-modulos';
import * as authApi from '../../lib/auth-api';
import * as crmApi from '../../lib/crm-api';
import { pedirAperturaDeBusquedaGlobal } from '../../lib/busqueda-global-evento';
import type { SesionActual } from '@viajapro/contracts';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/bandeja',
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const SESION_ASESOR: SesionActual = {
  identidad: {
    id: '01932000-0000-7000-8000-000000000001',
    correo: 'asesor@viajapro.com',
    nombre: 'Carlos Asesor',
  },
  agencias: [
    {
      id: '01932000-0000-7000-8000-00000000000a',
      nombre: 'Viajes El Sol',
      slug: 'viajes-el-sol',
    },
  ],
  tenantActivoId: '01932000-0000-7000-8000-00000000000a',
  acceso: {
    usuarioId: '01932000-0000-7000-8000-000000000011',
    rol: 'Asesor Comercial',
    permisos: ['conversaciones.ver_todas'],
  },
};

const SESION_MULTI_AGENCIA: SesionActual = {
  identidad: {
    id: '01932000-0000-7000-8000-000000000002',
    correo: 'duena@viajapro.com',
    nombre: 'Ana Directora',
  },
  agencias: [
    {
      id: '01932000-0000-7000-8000-00000000000a',
      nombre: 'Viajes El Sol',
      slug: 'viajes-el-sol',
    },
    {
      id: '01932000-0000-7000-8000-00000000000b',
      nombre: 'Turismo Caribe SAS',
      slug: 'turismo-caribe',
    },
  ],
  tenantActivoId: '01932000-0000-7000-8000-00000000000a',
  acceso: {
    usuarioId: '01932000-0000-7000-8000-000000000022',
    rol: 'Dueño',
    permisos: ['cotizacion.ver_neto_y_margen', 'conversaciones.ver_todas'],
  },
};

describe('BarraModulos y Selector de Sesión (ADR-0011)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);
    vi.spyOn(authApi, 'cambiarAgenciaActivaApi').mockResolvedValue(SESION_MULTI_AGENCIA);
    vi.spyOn(authApi, 'cerrarSesionApi').mockResolvedValue(undefined);
  });

  describe('calcularIniciales', () => {
    it('obtiene iniciales de nombre compuesto', () => {
      expect(calcularIniciales('Carlos Asesor')).toBe('CA');
      expect(calcularIniciales('Ana Directora Multiagencia')).toBe('AD');
    });

    it('obtiene iniciales de un solo nombre', () => {
      expect(calcularIniciales('Pedro')).toBe('PE');
    });

    it('deriva iniciales del correo si no hay nombre', () => {
      expect(calcularIniciales(null, 'asesor@viajapro.com')).toBe('AS');
      expect(calcularIniciales('', 'operaciones@viajapro.com')).toBe('OP');
    });

    it('devuelve VP como fallback seguro', () => {
      expect(calcularIniciales(null, null)).toBe('VP');
      expect(calcularIniciales('', '')).toBe('VP');
    });
  });

  describe('Hoy y Seguimientos con contador (T-317)', () => {
    const pendiente = (id: string) => ({
      id,
      descripcion: 'x',
      venceEn: '2026-10-27T16:00:00.000Z',
      completadoEn: null,
      asesorId: null,
      asesorNombre: null,
      contactoId: null,
      contactoNombre: null,
      oportunidadId: null,
      oportunidadTitulo: null,
      conversacionId: null,
    });

    it('muestra Hoy primero y Seguimientos, con la cifra en el nombre accesible', async () => {
      vi.spyOn(crmApi, 'obtenerPendientesDelDiaApi').mockResolvedValue({
        fecha: '2026-10-27',
        vencidos: [pendiente('01932000-0000-7000-8000-000000000071')],
        deHoy: [
          pendiente('01932000-0000-7000-8000-000000000072'),
          pendiente('01932000-0000-7000-8000-000000000073'),
        ],
      } as never);
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);
      const sidebar = screen.getByTestId('sidebar-escritorio');
      expect(await within(sidebar).findByRole('link', { name: 'Hoy, 3 pendientes' })).toBeDefined();
      expect(within(sidebar).getByRole('link', { name: 'Seguimientos, 1 vencido' })).toBeDefined();
      const nombres = within(sidebar)
        .getAllByRole('link')
        .map((a) => a.getAttribute('aria-label'))
        .filter(Boolean);
      expect(nombres[0]).toBe('Hoy, 3 pendientes');
      expect(nombres[1]).toBe('Conversaciones');
      expect(nombres.indexOf('Seguimientos, 1 vencido')).toBeGreaterThan(
        nombres.indexOf('Archivos de viaje'),
      );
      expect(nombres.indexOf('Seguimientos, 1 vencido')).toBeLessThan(nombres.indexOf('Contactos'));
    });

    it('con cero pendientes no pinta contador y el nombre es solo la etiqueta', () => {
      vi.spyOn(crmApi, 'obtenerPendientesDelDiaApi').mockResolvedValue({
        fecha: '2026-10-27',
        vencidos: [],
        deHoy: [],
      });
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);
      const sidebar = screen.getByTestId('sidebar-escritorio');
      expect(within(sidebar).getByRole('link', { name: 'Hoy' })).toBeDefined();
      expect(within(sidebar).getByRole('link', { name: 'Seguimientos' })).toBeDefined();
      expect(within(sidebar).queryByTestId('contador-menu-hoy')).toBeNull();
      expect(within(sidebar).queryByTestId('contador-menu-seguimientos')).toBeNull();
    });
  });

  describe('Renderizado y Navegación de Módulos', () => {
    it('renderiza la barra lateral con enlaces a los módulos principales', () => {
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);

      const sidebar = screen.getByRole('complementary', { name: /Barra de módulos lateral/i });
      expect(sidebar).toBeDefined();
      expect(within(sidebar).getByRole('link', { name: 'Conversaciones' })).toBeDefined();
      expect(within(sidebar).getByRole('link', { name: 'Oportunidades' })).toBeDefined();
      expect(within(sidebar).getByRole('link', { name: 'Cotizaciones' })).toBeDefined();
      expect(within(sidebar).getByRole('link', { name: 'Archivos de viaje' })).toBeDefined();
    });

    it('la barra inferior móvil es Hoy · Conversaciones · Cotizar · Archivos · Más (T-320)', () => {
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);

      const navMovil = screen.getByRole('navigation', { name: /Navegación móvil inferior/i });
      const nombres = [
        ...within(navMovil).getAllByRole('link'),
        ...within(navMovil).getAllByRole('button'),
      ].map((e) => e.getAttribute('aria-label'));
      expect(nombres).toEqual(['Hoy', 'Conversaciones', 'Cotizar', 'Archivos de viaje', 'Más']);
      // Buscar ya no ocupa pestaña (la lupa vive en la cabecera del marco).
      expect(within(navMovil).queryByText('Buscar')).toBeNull();
      expect(within(navMovil).queryByText('Perfil')).toBeNull();
    });

    it('«Más» abre la hoja con el resto de módulos, y esta se cierra con Esc', () => {
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);
      expect(screen.queryByTestId('hoja-mas')).toBeNull();

      fireEvent.click(screen.getByTestId('barra-boton-mas'));
      const hoja = screen.getByRole('dialog', { name: 'Más opciones' });
      // Esta sesión no tiene permisos de administración: Configuración se oculta (solo oculta).
      expect(
        within(hoja)
          .getAllByRole('link')
          .map((e) => e.getAttribute('aria-label') ?? e.textContent?.trim()),
      ).toEqual([
        'Oportunidades',
        'Cotizaciones',
        'Seguimientos',
        'Contactos',
        'Catálogo',
        'Reportes',
        'Privacidad',
        'Términos',
        'Cookies',
      ]);

      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
      expect(screen.queryByTestId('hoja-mas')).toBeNull();
    });

    it('la campana de la hoja «Más» abre el panel de notificaciones', () => {
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);
      fireEvent.click(screen.getByTestId('barra-boton-mas'));
      fireEvent.click(screen.getByTestId('mas-notificaciones'));
      expect(screen.queryByTestId('hoja-mas')).toBeNull();
      expect(screen.getByRole('dialog', { name: /notificaciones/i })).toBeDefined();
    });

    it('el evento de la lupa móvil abre la misma paleta de búsqueda', () => {
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);
      expect(screen.queryByRole('dialog', { name: /búsqueda|buscar/i })).toBeNull();
      act(() => {
        pedirAperturaDeBusquedaGlobal();
      });
      expect(screen.getByRole('dialog', { name: /búsqueda|buscar/i })).toBeDefined();
    });

    it('permite expandir y contraer la barra lateral de escritorio con botón toggle (T-034)', () => {
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);

      const sidebar = screen.getByTestId('sidebar-escritorio');
      expect(sidebar.getAttribute('data-expandida')).toBe('false');

      const botonToggle = screen.getByTestId('boton-toggle-sidebar');
      expect(botonToggle.getAttribute('aria-expanded')).toBe('false');

      // Expandir
      fireEvent.click(botonToggle);
      expect(sidebar.getAttribute('data-expandida')).toBe('true');
      expect(botonToggle.getAttribute('aria-expanded')).toBe('true');
      expect(localStorage.getItem('viajapro_sidebar_expandida')).toBe('true');

      // Contraer
      fireEvent.click(botonToggle);
      expect(sidebar.getAttribute('data-expandida')).toBe('false');
      expect(botonToggle.getAttribute('aria-expanded')).toBe('false');
      expect(localStorage.getItem('viajapro_sidebar_expandida')).toBe('false');
    });

    it('muestra los títulos de los módulos y el nombre del asesor al estar expandida (T-034)', () => {
      localStorage.setItem('viajapro_sidebar_expandida', 'true');
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);

      const sidebar = screen.getByTestId('sidebar-escritorio');
      expect(sidebar.getAttribute('data-expandida')).toBe('true');
      expect(within(sidebar).getByText('Conversaciones')).toBeDefined();
      expect(within(sidebar).getByText('Carlos Asesor')).toBeDefined();
      expect(within(sidebar).getByText('Viajes El Sol')).toBeDefined();

      localStorage.removeItem('viajapro_sidebar_expandida');
    });
  });

  describe('Interacción con Menú de Sesión y Perfil', () => {
    it('muestra las iniciales en el botón de avatar', () => {
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);
      const avatarBtn = screen.getByTestId('boton-avatar-sesion');
      expect(avatarBtn.textContent).toContain('CA');
      expect(avatarBtn.getAttribute('aria-expanded')).toBe('false');
    });

    it('abre el diálogo de sesión al pulsar el avatar de escritorio', () => {
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);
      const avatarBtn = screen.getByTestId('boton-avatar-sesion');

      fireEvent.click(avatarBtn);

      const dialogo = screen.getByTestId('dialogo-perfil-sesion');
      expect(dialogo).toBeDefined();
      expect(screen.getByTestId('nombre-usuario-sesion').textContent).toContain('Carlos Asesor');
      expect(screen.getByTestId('correo-usuario-sesion').textContent).toContain(
        'asesor@viajapro.com',
      );
      expect(screen.getByTestId('rol-usuario-sesion').textContent).toContain('Asesor Comercial');
      expect(screen.getByTestId('indicador-agencia-unica').textContent).toContain('Viajes El Sol');
    });

    it('abre el diálogo de sesión desde la entrada de perfil de la hoja «Más»', () => {
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);
      fireEvent.click(screen.getByTestId('barra-boton-mas'));
      const perfilMovilBtn = screen.getByTestId('boton-perfil-movil');
      expect(perfilMovilBtn.className).toContain('min-h-[48px]');

      fireEvent.click(perfilMovilBtn);

      expect(screen.queryByTestId('hoja-mas')).toBeNull();
      expect(screen.getByTestId('dialogo-perfil-sesion')).toBeDefined();
    });

    it('cierra el diálogo al pulsar el telón de fondo', () => {
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);
      fireEvent.click(screen.getByTestId('boton-avatar-sesion'));
      expect(screen.getByTestId('dialogo-perfil-sesion')).toBeDefined();

      const telon = screen.getByTestId('telon-perfil-sesion');
      fireEvent.click(telon);

      expect(screen.queryByTestId('dialogo-perfil-sesion')).toBeNull();
    });

    it('cierra el diálogo al pulsar la tecla Escape', () => {
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);
      fireEvent.click(screen.getByTestId('boton-avatar-sesion'));
      expect(screen.getByTestId('dialogo-perfil-sesion')).toBeDefined();

      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

      expect(screen.queryByTestId('dialogo-perfil-sesion')).toBeNull();
    });

    it('permite cambiar de agencia activa en cuenta multiagencia', async () => {
      render(<BarraModulos sesionInicial={SESION_MULTI_AGENCIA} />);
      fireEvent.click(screen.getByTestId('boton-avatar-sesion'));

      expect(screen.getByTestId('selector-agencias-sesion')).toBeDefined();
      const opcionCaribe = screen.getByTestId(
        'opcion-agencia-01932000-0000-7000-8000-00000000000b',
      );
      expect(opcionCaribe).toBeDefined();

      fireEvent.click(opcionCaribe);

      await waitFor(() => {
        expect(authApi.cambiarAgenciaActivaApi).toHaveBeenCalledWith(
          '01932000-0000-7000-8000-00000000000b',
        );
      });
    });

    it('permite cerrar sesión y redirige a /ingresar', async () => {
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);
      fireEvent.click(screen.getByTestId('boton-avatar-sesion'));

      const botonCerrar = screen.getByTestId('boton-cerrar-sesion');
      expect(botonCerrar).toBeDefined();

      fireEvent.click(botonCerrar);

      await waitFor(() => {
        expect(authApi.cerrarSesionApi).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith('/ingresar');
      });
    });
  });
  describe('Modo Real por defecto y Modo Demostración explícito (Bloque 1)', () => {
    it('muestra el indicador de API conectada en modo real', () => {
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);
      expect(screen.getByTestId('indicador-api-conectada')).toBeDefined();
    });

    it('permite alternar el modo demostración desde el diálogo de perfil', () => {
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);
      const btnAvatar = screen.getByTestId('boton-avatar-sesion');
      fireEvent.click(btnAvatar);

      const toggleDemo = screen.getByTestId('boton-alternar-demo');
      expect(toggleDemo).toBeDefined();
      expect(toggleDemo.getAttribute('aria-checked')).toBe('false');

      fireEvent.click(toggleDemo);
      expect(toggleDemo.getAttribute('aria-checked')).toBe('true');
    });
  });

  describe('Notificaciones Web y Socket en Tiempo Real (T-110)', () => {
    it('abre el panel de notificaciones al hacer clic en la campana de escritorio', () => {
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);

      const botonCampana = screen.getByRole('button', {
        name: /Alertas operativas|Notificaciones/i,
      });
      fireEvent.click(botonCampana);

      expect(screen.getByRole('dialog', { name: /Panel de Notificaciones/i })).toBeDefined();
    });

    it('abre el panel de notificaciones desde el diálogo de perfil', () => {
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);

      fireEvent.click(screen.getByTestId('boton-avatar-sesion'));
      const botonNotifPerfil = screen.getByTestId('boton-abrir-notificaciones-perfil');
      expect(botonNotifPerfil).toBeDefined();

      fireEvent.click(botonNotifPerfil);
      expect(screen.getByRole('dialog', { name: /Panel de Notificaciones/i })).toBeDefined();
    });
  });

  describe('Modo Oscuro y Preferencia de Densidad (T-111)', () => {
    it('cicla los temas (light -> dark -> system) con el botón de alternar tema', () => {
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);

      const botonTema = screen.getByTestId('boton-alternar-tema-colapsado');
      expect(botonTema).toBeDefined();

      // De system -> pasa a light
      fireEvent.click(botonTema);
      expect(localStorage.getItem('viajapro_tema')).toBe('light');

      // De light -> pasa a dark
      fireEvent.click(botonTema);
      expect(localStorage.getItem('viajapro_tema')).toBe('dark');

      // De dark -> pasa a system
      fireEvent.click(botonTema);
      expect(localStorage.getItem('viajapro_tema')).toBe('system');
    });

    it('renderiza SelectorTemaDensidad dentro del diálogo de perfil y permite cambiar densidad', () => {
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);

      fireEvent.click(screen.getByTestId('boton-avatar-sesion'));
      expect(screen.getByTestId('dialogo-perfil-sesion')).toBeDefined();

      // Debe contener las opciones de tema
      expect(screen.getByRole('radio', { name: /Claro/i })).toBeDefined();
      expect(screen.getByRole('radio', { name: /Oscuro/i })).toBeDefined();
      expect(screen.getByRole('radio', { name: /Sistema/i })).toBeDefined();

      // Debe contener las opciones de densidad
      const radioCompacta = screen.getByRole('radio', { name: /Compacta/i });
      expect(radioCompacta).toBeDefined();

      fireEvent.click(radioCompacta);
      expect(localStorage.getItem('viajapro_densidad')).toBe('compacta');
    });
  });
});
