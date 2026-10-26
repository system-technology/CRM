import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FichaDetallePaquete } from './ficha-detalle-paquete';
import { MOCK_PAQUETES_CATALOGO } from '../../lib/mock-catalogo';
import * as authApi from '../../lib/auth-api';
import type { SesionActual } from '@viajapro/contracts';

const paquetePrueba = MOCK_PAQUETES_CATALOGO[0]!;

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

describe('FichaDetallePaquete - Control de permiso de neto y margen (0c.27)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('NO muestra importes netos en el DOM cuando el usuario no tiene permiso (prop explícita)', () => {
    render(
      <FichaDetallePaquete
        paquete={paquetePrueba}
        alCerrar={() => {}}
        puedeVerNetoYMargen={false}
      />,
    );

    // Muestra los precios de venta al público
    expect(screen.getByRole('heading', { name: /San Andrés/i })).toBeDefined();
    expect(screen.getByText(/Matriz de Tarifas/i)).toBeDefined();

    // R10 / 0c.27: Ningún texto "Neto:" en el DOM
    const elementosNeto = screen.queryAllByText(/neto:/i);
    expect(elementosNeto).toHaveLength(0);
  });

  it('SÍ muestra los importes netos en el DOM cuando el usuario tiene permiso (prop explícita)', () => {
    render(
      <FichaDetallePaquete
        paquete={paquetePrueba}
        alCerrar={() => {}}
        puedeVerNetoYMargen={true}
      />,
    );

    expect(screen.getByRole('heading', { name: /San Andrés/i })).toBeDefined();

    // Con permiso sí se renderiza el costo neto confidencial
    const elementosNeto = screen.getAllByText(/neto:/i);
    expect(elementosNeto.length).toBeGreaterThan(0);
  });

  it('consulta sesión y oculta neto automáticamente si la API devuelve rol de asesor sin permiso', () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);

    render(<FichaDetallePaquete paquete={paquetePrueba} alCerrar={() => {}} />);

    const elementosNeto = screen.queryAllByText(/neto:/i);
    expect(elementosNeto).toHaveLength(0);
  });

  it('consulta sesión y muestra neto si la API devuelve sesión con cotizacion.ver_neto_y_margen', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_DUENO);

    render(<FichaDetallePaquete paquete={paquetePrueba} alCerrar={() => {}} />);

    // Esperar a que el hook cargue la sesión
    const elementosNeto = await screen.findAllByText(/neto:/i);
    expect(elementosNeto.length).toBeGreaterThan(0);
  });
});
