import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReportesPage from './page';
import * as authApi from '../../lib/auth-api';
import type { SesionActual } from '@viajapro/contracts';

vi.mock('next/navigation', () => ({
  usePathname: () => '/reportes',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

const SESION_ASESOR: SesionActual = {
  identidad: {
    id: '01932000-0000-7000-8000-000000000001',
    correo: 'asesor@viajapro.com',
    nombre: 'Asesor Comercial',
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

const SESION_DUENO: SesionActual = {
  identidad: {
    id: '01932000-0000-7000-8000-000000000002',
    correo: 'dueno@viajapro.com',
    nombre: 'Dueña Agencia',
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
    usuarioId: '01932000-0000-7000-8000-000000000022',
    rol: 'Dueño',
    permisos: [
      'cotizacion.ver_neto_y_margen',
      'usuarios.administrar',
      'roles.administrar',
      'conversaciones.ver_todas',
    ],
  },
};

describe('ReportesPage - Ocultamiento de Costo Neto y Margen sin permiso (0c.27)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('NO renderiza Costo Neto Mayoristas ni Margen Comercial en el DOM cuando la sesión carece de permiso', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);

    render(<ReportesPage />);

    expect(screen.getByText(/Reportes y Rendimiento Comercial/i)).toBeDefined();

    // Solo muestra la vista operativa de asesor
    const vistaAsesor = await screen.findByText(/Vista Asesor/i);
    expect(vistaAsesor).toBeDefined();
    expect(screen.queryByRole('button', { name: /Vista Dueño/i })).toBeNull();

    // R10 / 0c.27: El bloque de costos netos y márgenes no existe en el DOM
    expect(screen.queryByTestId('seccion-margen-confidencial')).toBeNull();
    expect(screen.queryByText(/Costo Neto Mayoristas:/i)).toBeNull();
    expect(screen.queryByText(/Margen Comercial/i)).toBeNull();
    expect(screen.queryByText(/Utilidad Bruta y Margen Real/i)).toBeNull();
  });

  it('SÍ renderiza Costo Neto Mayoristas y Margen Comercial en el DOM cuando la sesión tiene permiso', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_DUENO);

    render(<ReportesPage />);

    // El botón del conmutador de dueño está disponible
    const btnDueno = await screen.findByRole('button', { name: /Vista Dueño/i });
    expect(btnDueno).toBeDefined();

    // En la vista de dueño, el bloque confidencial está presente con sus datos
    const seccionConfidencial = await screen.findByTestId('seccion-margen-confidencial');
    expect(seccionConfidencial).toBeDefined();
    expect(screen.getByText(/Costo Neto Mayoristas:/i)).toBeDefined();
    expect(screen.getByText(/Margen Comercial/i)).toBeDefined();
    expect(screen.getByText(/Utilidad Bruta y Margen Real/i)).toBeDefined();
  });

  it('permite alternar a vista asesor ocultando el margen aunque el dueño tenga permiso', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_DUENO);

    render(<ReportesPage />);

    const btnAsesor = await screen.findByRole('button', { name: /Vista Asesor/i });
    fireEvent.click(btnAsesor);

    // Al conmutar voluntariamente a vista asesor, la sección se oculta
    expect(screen.queryByTestId('seccion-margen-confidencial')).toBeNull();
    expect(screen.queryByText(/Costo Neto Mayoristas:/i)).toBeNull();
  });
});
