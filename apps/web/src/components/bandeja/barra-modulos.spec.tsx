import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { BarraModulos, calcularIniciales } from './barra-modulos';
import * as authApi from '../../lib/auth-api';
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

  describe('Renderizado y Navegación de Módulos', () => {
    it('renderiza la barra lateral con enlaces a los módulos principales', () => {
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);

      const sidebar = screen.getByRole('complementary', { name: /Barra de módulos lateral/i });
      expect(sidebar).toBeDefined();
      expect(within(sidebar).getByRole('link', { name: /Bandeja de WhatsApp/i })).toBeDefined();
      expect(within(sidebar).getByRole('link', { name: /Pipeline/i })).toBeDefined();
      expect(within(sidebar).getByRole('link', { name: /Cotizador de Paquetes/i })).toBeDefined();
      expect(within(sidebar).getByRole('link', { name: /Archivos de Viaje/i })).toBeDefined();
    });

    it('renderiza la barra de navegación inferior móvil con touch targets >= 44px', () => {
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);

      const navMovil = screen.getByRole('navigation', { name: /Navegación móvil inferior/i });
      expect(navMovil).toBeDefined();

      const botonPerfilMovil = screen.getByTestId('boton-perfil-movil');
      expect(botonPerfilMovil).toBeDefined();
      expect(botonPerfilMovil.className).toContain('min-h-[44px]');
      expect(botonPerfilMovil.className).toContain('min-w-[44px]');
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
      expect(within(sidebar).getByText('Bandeja de WhatsApp')).toBeDefined();
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

    it('abre el diálogo de sesión al pulsar el botón de perfil móvil', () => {
      render(<BarraModulos sesionInicial={SESION_ASESOR} />);
      const perfilMovilBtn = screen.getByTestId('boton-perfil-movil');

      fireEvent.click(perfilMovilBtn);

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
});
