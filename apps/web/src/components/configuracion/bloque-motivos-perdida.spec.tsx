import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { MotivoDePerdida } from '@viajapro/contracts';
import { BloqueMotivosPerdida } from './bloque-motivos-perdida';
import * as crmApi from '../../lib/crm-api';

let puedeEscribirCrm = true;
vi.mock('../../lib/permisos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/permisos')>();
  return { ...actual, usePermisos: () => ({ puedeEscribirCrm }) };
});

const M = (n: number, extra: Partial<MotivoDePerdida> = {}): MotivoDePerdida => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  clave: null,
  etiqueta: `Motivo ${n}`,
  orden: n,
  activo: true,
  exigeNota: false,
  ...extra,
});

const LISTA = [
  M(1, { clave: 'PRECIO', etiqueta: 'Precio' }),
  M(2, { etiqueta: 'Prefirió otro destino' }),
  M(3, { etiqueta: 'Viejo', activo: false }),
];

const aplicar = (id: string, c: Record<string, unknown>): MotivoDePerdida => {
  const base = LISTA.find((m) => m.id === id) as MotivoDePerdida;
  const definidos = Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined));
  return { ...base, ...definidos };
};

describe('BloqueMotivosPerdida (T-229)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    puedeEscribirCrm = true;
    vi.spyOn(crmApi, 'estaUsandoApiReal').mockReturnValue(true);
  });

  it('muestra esqueleto y luego solo los activos; el filtro revela inactivos', async () => {
    vi.spyOn(crmApi, 'listarMotivosDePerdidaApi').mockResolvedValue(LISTA);
    render(<BloqueMotivosPerdida />);
    expect(screen.getByTestId('motivos-cargando')).toBeDefined();
    await screen.findByText('Precio');
    expect(screen.getByText('Prefirió otro destino')).toBeDefined();
    expect(screen.queryByText('Viejo')).toBeNull();
    expect(screen.getByText(/Sistema · PRECIO/)).toBeDefined();
    fireEvent.click(screen.getByLabelText('Mostrar inactivos'));
    expect(screen.getByText('Viejo')).toBeDefined();
  });

  it('estado vacío y error con reintento', async () => {
    const listar = vi
      .spyOn(crmApi, 'listarMotivosDePerdidaApi')
      .mockRejectedValueOnce(new crmApi.CrmApiError('X', 'No hay conexión con el servidor', 0))
      .mockResolvedValueOnce([]);
    render(<BloqueMotivosPerdida />);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByTestId('motivos-vacio');
    expect(listar).toHaveBeenCalledTimes(2);
  });

  it('crea un motivo con exige nota y muestra el 409 de etiqueta repetida', async () => {
    vi.spyOn(crmApi, 'listarMotivosDePerdidaApi').mockResolvedValue(LISTA);
    const crear = vi
      .spyOn(crmApi, 'crearMotivoDePerdidaApi')
      .mockRejectedValueOnce(new crmApi.CrmApiError('ETIQUETA_REPETIDA', 'duplicado', 409))
      .mockResolvedValueOnce(M(4, { etiqueta: 'Nuevo', exigeNota: true, orden: 4 }));
    render(<BloqueMotivosPerdida />);
    await screen.findByText('Precio');
    fireEvent.change(screen.getByLabelText('Etiqueta del nuevo motivo'), {
      target: { value: 'Nuevo' },
    });
    const form = screen.getByLabelText('Etiqueta del nuevo motivo').closest('form')!;
    fireEvent.click(within(form).getByLabelText('Exige nota'));
    fireEvent.click(screen.getByRole('button', { name: /Crear motivo/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Ya existe un motivo/);
    fireEvent.click(screen.getByRole('button', { name: /Crear motivo/ }));
    await screen.findByText('Nuevo');
    expect(crear).toHaveBeenLastCalledWith({ etiqueta: 'Nuevo', exigeNota: true });
  });

  it('renombra, desactiva y marca exige nota por PATCH', async () => {
    vi.spyOn(crmApi, 'listarMotivosDePerdidaApi').mockResolvedValue(LISTA);
    const patch = vi
      .spyOn(crmApi, 'actualizarMotivoDePerdidaApi')
      .mockImplementation((id, c) => Promise.resolve(aplicar(id, c)));
    render(<BloqueMotivosPerdida />);
    await screen.findByText('Precio');

    fireEvent.click(screen.getByLabelText('Renombrar motivo «Precio»'));
    fireEvent.change(screen.getByLabelText('Nueva etiqueta para «Precio»'), {
      target: { value: 'Precio alto' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Precio alto');
    expect(patch).toHaveBeenCalledWith(LISTA[0]!.id, { etiqueta: 'Precio alto' });

    fireEvent.click(screen.getByLabelText('Exige nota: Prefirió otro destino'));
    await waitFor(() => expect(patch).toHaveBeenCalledWith(LISTA[1]!.id, { exigeNota: true }));

    fireEvent.click(screen.getByLabelText('Desactivar motivo «Prefirió otro destino»'));
    await waitFor(() => expect(patch).toHaveBeenCalledWith(LISTA[1]!.id, { activo: false }));
    await waitFor(() => expect(screen.queryByText('Prefirió otro destino')).toBeNull());
  });

  it('subir/bajar intercambia el orden; sin permiso todo queda deshabilitado', async () => {
    vi.spyOn(crmApi, 'listarMotivosDePerdidaApi').mockResolvedValue(LISTA);
    const patch = vi
      .spyOn(crmApi, 'actualizarMotivoDePerdidaApi')
      .mockImplementation((id, c) => Promise.resolve(aplicar(id, c)));
    const { unmount } = render(<BloqueMotivosPerdida />);
    await screen.findByText('Precio');
    fireEvent.click(screen.getByLabelText('Bajar motivo «Precio»'));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    expect(patch).toHaveBeenCalledWith(LISTA[0]!.id, { orden: 2 });
    expect(patch).toHaveBeenCalledWith(LISTA[1]!.id, { orden: 1 });
    const items = await screen.findAllByRole('listitem');
    await waitFor(() =>
      expect(within(screen.getAllByRole('listitem')[0]!).getByText('Prefirió otro destino')),
    );
    expect(items.length).toBe(2);
    unmount();

    puedeEscribirCrm = false;
    render(<BloqueMotivosPerdida />);
    await screen.findByText('Precio');
    expect(screen.getByLabelText<HTMLButtonElement>('Desactivar motivo «Precio»').disabled).toBe(
      true,
    );
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Crear motivo/ }).disabled).toBe(
      true,
    );
  });
});
