import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import BienvenidaPage from './page';
import * as permisosLib from '../../lib/permisos';
import type { SesionActual } from '@viajapro/contracts';

vi.mock('next/navigation', () => ({
  usePathname: () => '/bienvenida',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

const SESION_MOCK: SesionActual = {
  identidad: {
    id: '01932000-0000-7000-8000-000000000001',
    correo: 'dueno@cartagenatours.com',
    nombre: 'Mateo Osorio',
  },
  agencias: [
    {
      id: '01932000-0000-7000-8000-00000000000b',
      nombre: 'Cartagena Tours Express',
      slug: 'cartagena-tours-express',
    },
  ],
  tenantActivoId: '01932000-0000-7000-8000-00000000000b',
  acceso: {
    usuarioId: '01932000-0000-7000-8000-000000000001',
    rol: 'Dueño de Agencia',
    permisos: ['cotizacion.ver_neto_y_margen', 'catalogo.administrar'],
  },
};

describe('BienvenidaPage — Pantalla de Onboarding de Nueva Agencia (T-105)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
    vi.spyOn(permisosLib, 'usePermisos').mockReturnValue({
      sesion: SESION_MOCK,
      cargando: false,
      puedeVerNetoYMargen: true,
      puedeVerTodasConversaciones: true,
      tienePermiso: () => true,
    });
  });

  it('1. Renderiza la cabecera con el nombre de la agencia y el distintivo demo', () => {
    render(<BienvenidaPage />);

    expect(screen.getByText('Asistente de Inicio de Agencia')).toBeDefined();
    expect(screen.getAllByText('Cartagena Tours Express')[0]).toBeDefined();
    expect(screen.getByTitle('Volver al inicio')).toBeDefined();
  });

  it('2. Renderiza el AsistenteOnboarding con sus 4 pasos estructurados', () => {
    render(<BienvenidaPage />);

    expect(screen.getByTestId('asistente-onboarding')).toBeDefined();
    expect(screen.getByText('T-105')).toBeDefined();
    expect(screen.getByTestId('btn-paso-marca')).toBeDefined();
    expect(screen.getByTestId('btn-paso-catalogo')).toBeDefined();
    expect(screen.getByTestId('btn-paso-equipo')).toBeDefined();
    expect(screen.getByTestId('btn-paso-whatsapp')).toBeDefined();
  });

  it('3. Los botones de acción cuentan con área táctil accesible min-h-[44px]', () => {
    render(<BienvenidaPage />);

    const volverInicio = screen.getByTitle('Volver al inicio');
    expect(volverInicio.className).toContain('min-h-[44px]');

    const btnPasoMarca = screen.getByTestId('btn-paso-marca');
    expect(btnPasoMarca.className).toContain('min-h-[44px]');
  });
});
