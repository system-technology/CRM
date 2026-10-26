import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BloquePoliticaPrecio } from './bloque-politica-precio';
import * as authApi from '../../lib/auth-api';
import type { SesionActual } from '@viajapro/contracts';

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

describe('BloquePoliticaPrecio - Control de permiso de neto y margen (0c.27)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('NO renderiza el formulario ni cifras de margen/neto cuando puedeVerNetoYMargen es false', () => {
    render(<BloquePoliticaPrecio puedeVerNetoYMargen={false} />);

    // Muestra el estado de acceso restringido
    expect(screen.getByTestId('bloque-politica-precio-restringido')).toBeDefined();
    expect(screen.getByText(/Acceso restringido/i)).toBeDefined();

    // R10 / 0c.27: Ningún formulario de porcentaje ni cálculos de margen en el DOM
    expect(screen.queryByText(/Cómo se forma el precio/i)).toBeNull();
    expect(screen.queryByText(/Margen comercial/i)).toBeNull();
    expect(screen.queryByText(/Neto + Margen comercial/i)).toBeNull();
  });

  it('SÍ renderiza la política y el ejemplo vivo cuando puedeVerNetoYMargen es true', () => {
    render(<BloquePoliticaPrecio puedeVerNetoYMargen={true} />);

    expect(screen.queryByTestId('bloque-politica-precio-restringido')).toBeNull();
    expect(screen.getByText(/Cómo se forma el precio/i)).toBeDefined();
    expect(screen.getByText((c) => c.includes('Neto + Margen comercial'))).toBeDefined();
    expect(screen.getByText(/Ejemplo Vivo/i)).toBeDefined();
  });

  it('oculta la configuración cuando la sesión cargada no tiene el permiso de margen', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);

    render(<BloquePoliticaPrecio />);

    const restringido = await screen.findByTestId('bloque-politica-precio-restringido');
    expect(restringido).toBeDefined();
    expect(screen.queryByText(/Cómo se forma el precio/i)).toBeNull();
  });

  it('muestra la configuración cuando la sesión cargada tiene cotizacion.ver_neto_y_margen', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_DUENO);

    render(<BloquePoliticaPrecio />);

    const titulo = await screen.findByText(/Cómo se forma el precio/i);
    expect(titulo).toBeDefined();
    expect(screen.queryByTestId('bloque-politica-precio-restringido')).toBeNull();
  });
});
