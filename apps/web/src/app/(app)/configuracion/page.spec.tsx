import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConfiguracionPage from './page';
import * as auth from '../../../lib/auth-api';
import type { Permiso } from '@viajapro/contracts';

let busqueda = '';
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/configuracion',
  useRouter: () => ({ push: vi.fn(), replace, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(busqueda),
}));

vi.mock('../../../lib/auth-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/auth-api')>();
  return { ...actual, obtenerSesionActualApi: vi.fn() };
});

// Los bloques hacen sus propias peticiones: aquí solo importa qué pestaña se pinta.
vi.mock('../../../components/configuracion/bloque-equipo', () => ({
  BloqueEquipo: () => <p>bloque-equipo</p>,
}));
vi.mock('../../../components/configuracion/bloque-conexion-whatsapp', () => ({
  BloqueConexionWhatsapp: () => <p>bloque-whatsapp</p>,
}));
vi.mock('../../../components/configuracion/bloque-politica-precio', () => ({
  BloquePoliticaPrecio: () => <p>bloque-precios</p>,
}));
vi.mock('../../../components/configuracion/bloque-etiquetas', () => ({
  BloqueEtiquetas: () => <p>bloque-etiquetas</p>,
}));

function conPermisos(permisos: Permiso[]) {
  vi.mocked(auth.obtenerSesionActualApi).mockResolvedValue({
    ...auth.MOCK_SESION_UNICA_AGENCIA,
    acceso: { ...auth.MOCK_SESION_UNICA_AGENCIA.acceso!, permisos },
  });
}

describe('Configuración: pestañas en ?pestana= (T-318)', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    busqueda = '';
    conPermisos([]);
  });

  it('sin parámetro abre la primera pestaña', async () => {
    render(<ConfiguracionPage />);
    expect(await screen.findByTestId('tab-contenido-equipo')).toBeDefined();
  });

  it('?pestana=whatsapp abre esa pestaña al montar', async () => {
    busqueda = 'pestana=whatsapp';
    render(<ConfiguracionPage />);
    expect(await screen.findByTestId('tab-contenido-whatsapp')).toBeDefined();
    expect(screen.queryByTestId('tab-contenido-equipo')).toBeNull();
  });

  it('?pestana inválida cae a la primera', async () => {
    busqueda = 'pestana=__proto__';
    render(<ConfiguracionPage />);
    expect(await screen.findByTestId('tab-contenido-equipo')).toBeDefined();
  });

  it('?pestana=precios sin permiso de neto y margen cae a la primera', async () => {
    busqueda = 'pestana=precios';
    render(<ConfiguracionPage />);
    expect(await screen.findByTestId('tab-contenido-equipo')).toBeDefined();
    await waitFor(() => expect(auth.obtenerSesionActualApi).toHaveBeenCalled());
    expect(screen.queryByText('bloque-precios')).toBeNull();
  });

  it('elegir una pestaña escribe la URL con replace; la primera la deja limpia', async () => {
    render(<ConfiguracionPage />);
    await screen.findByTestId('tab-contenido-equipo');
    fireEvent.click(screen.getByTestId('tab-btn-catalogo'));
    expect(replace).toHaveBeenLastCalledWith('/configuracion?pestana=catalogo', {
      scroll: false,
    });
    // T-631: fuera el Title Case de las etiquetas de pestaña.
    fireEvent.click(screen.getByRole('button', { name: /Miembros y roles/ }));
    expect(replace).toHaveBeenLastCalledWith('/configuracion', { scroll: false });
  });

  it('la pestaña «Etiquetas» solo existe con etiquetas.administrar (T-326)', async () => {
    render(<ConfiguracionPage />);
    await screen.findByTestId('tab-contenido-equipo');
    await waitFor(() => expect(auth.obtenerSesionActualApi).toHaveBeenCalled());
    expect(screen.queryByTestId('tab-btn-etiquetas')).toBeNull();

    cleanup();
    conPermisos(['etiquetas.administrar']);
    render(<ConfiguracionPage />);
    const pestana = await screen.findByTestId('tab-btn-etiquetas');
    fireEvent.click(pestana);
    expect(replace).toHaveBeenLastCalledWith('/configuracion?pestana=etiquetas', {
      scroll: false,
    });
  });

  it('?pestana=etiquetas con el permiso abre la gestión', async () => {
    conPermisos(['etiquetas.administrar']);
    busqueda = 'pestana=etiquetas';
    render(<ConfiguracionPage />);
    expect(await screen.findByTestId('tab-contenido-etiquetas')).toBeDefined();
    // El bloque se carga con import dinámico: aparece un instante después que su contenedor.
    expect(await screen.findByText('bloque-etiquetas')).toBeDefined();
  });

  it('?pestana=etiquetas sin el permiso cae a la primera y no muestra la gestión', async () => {
    busqueda = 'pestana=etiquetas';
    render(<ConfiguracionPage />);
    expect(await screen.findByTestId('tab-contenido-equipo')).toBeDefined();
    await waitFor(() => expect(auth.obtenerSesionActualApi).toHaveBeenCalled());
    expect(screen.queryByText('bloque-etiquetas')).toBeNull();
  });
});
