import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MOCK_DETALLES_ARCHIVOS } from '../../lib/mock-archivos';
import { ModalBusquedaGlobal } from './modal-busqueda-global';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

const listarArchivos = vi.fn();
vi.mock('../../lib/archivos-api', () => ({
  listarArchivos: (...a: unknown[]): unknown => listarArchivos(...a),
}));

let puedeVer = true;
vi.mock('../../lib/permisos', async (original) => ({
  ...(await original<typeof import('../../lib/permisos')>()),
  usePermisos: () => ({
    sesion: null,
    cargando: false,
    tienePermiso: () => puedeVer,
  }),
}));

describe('ModalBusquedaGlobal — archivos de viaje de la misma fuente que /viajes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    puedeVer = true;
  });

  it('busca «1043» y abre /viajes?id= con el id que devolvió la fuente de la pantalla', async () => {
    listarArchivos.mockResolvedValue(MOCK_DETALLES_ARCHIVOS);
    render(<ModalBusquedaGlobal abierto={true} alCerrar={vi.fn()} />);
    expect(listarArchivos).toHaveBeenCalledWith('TODOS');

    const input = screen.getByPlaceholderText(/Buscar contactos, chats/i);
    fireEvent.change(input, { target: { value: '1043' } });

    const opcion = await screen.findByText(/File 1043/);
    const fila = opcion.closest('[role="option"]')!;
    expect(fila.textContent).toContain('San Andrés');
    fireEvent.click(fila);
    const esperado = MOCK_DETALLES_ARCHIVOS.find((a) => a.numero === 1043)!.id;
    expect(mockPush).toHaveBeenCalledWith(`/viajes?id=${esperado}`);
  });

  it('si la fuente falla lo dice, ofrece reintentar y el resto de la paleta sigue sirviendo', async () => {
    listarArchivos.mockRejectedValueOnce(new Error('boom'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ModalBusquedaGlobal abierto={true} alCerrar={vi.fn()} />);

    const aviso = await screen.findByTestId('paleta-archivos-error');
    expect(aviso.textContent).toContain('No se pudieron cargar los archivos de viaje');
    // Los comandos de módulo siguen disponibles.
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);

    listarArchivos.mockResolvedValue(MOCK_DETALLES_ARCHIVOS);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.queryByTestId('paleta-archivos-error')).toBeNull());
    expect(listarArchivos).toHaveBeenCalledTimes(2);
    expect(error).not.toHaveBeenCalled();
  });

  it('sin el permiso de ver archivos ni los pide ni avisa de error', () => {
    puedeVer = false;
    render(<ModalBusquedaGlobal abierto={true} alCerrar={vi.fn()} />);
    expect(listarArchivos).not.toHaveBeenCalled();
    expect(screen.queryByTestId('paleta-archivos-error')).toBeNull();
  });

  it('una categoría sin coincidencias lo dice en vez de quedar en blanco', async () => {
    listarArchivos.mockResolvedValue([]);
    render(<ModalBusquedaGlobal abierto={true} alCerrar={vi.fn()} />);
    fireEvent.click(screen.getByTestId('filtro-categoria-viajes'));
    const input = screen.getByPlaceholderText(/Buscar contactos, chats/i);
    fireEvent.change(input, { target: { value: '9999' } });
    await waitFor(() => expect(screen.getByText(/No se encontraron resultados/)).toBeDefined());
  });
});
