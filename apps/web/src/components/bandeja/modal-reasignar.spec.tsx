import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

let listar: () => Promise<unknown> = () => Promise.resolve([]);
const llamadas = vi.fn();
vi.mock('../../lib/miembros-asignables-api', () => ({
  listarMiembrosAsignablesApi: () => {
    llamadas();
    return listar();
  },
}));

import { ModalReasignar } from './modal-reasignar';

const ID_A = '01932000-0000-7000-8000-0000000000a1';
const ID_B = '01932000-0000-7000-8000-0000000000a2';

const montar = (onReasignar = vi.fn().mockResolvedValue(undefined), abierto = true) =>
  render(
    <ModalReasignar
      abierto={abierto}
      conversacionId="c1"
      asignadoActualId={null}
      onCerrar={vi.fn()}
      onReasignar={onReasignar}
    />,
  );

describe('ModalReasignar (ADR-0022)', () => {
  beforeEach(() => llamadas.mockReset());
  afterEach(() => cleanup());

  it('muestra los miembros que devuelve el endpoint, sin subtítulo de rol', async () => {
    listar = () =>
      Promise.resolve([
        { id: ID_A, nombre: 'Laura Gómez' },
        { id: ID_B, nombre: 'Andrés Ríos' },
      ]);
    montar();
    expect(await screen.findByText('Laura Gómez')).toBeTruthy();
    expect(screen.getByText('Andrés Ríos')).toBeTruthy();
    expect(screen.queryByText('Asesor de viajes')).toBeNull();
  });

  it('confirmar envía el id del miembro elegido', async () => {
    listar = () => Promise.resolve([{ id: ID_A, nombre: 'Laura Gómez' }]);
    const onReasignar = vi.fn().mockResolvedValue(undefined);
    montar(onReasignar);
    fireEvent.click(await screen.findByText('Laura Gómez'));
    fireEvent.click(screen.getByTestId('boton-confirmar-reasignacion'));
    await waitFor(() => expect(onReasignar).toHaveBeenCalled());
    expect(onReasignar).toHaveBeenCalledWith(ID_A);
  });

  it('si la lista falla muestra el error y deja soltar a la cola común', async () => {
    listar = () =>
      new Promise((_, rechazar) => {
        setTimeout(() => rechazar(new Error('No tienes permiso para ver a quién asignar.')), 0);
      });
    montar();
    expect((await screen.findByRole('alert')).textContent).toContain('No tienes permiso');
    expect(screen.getByText('Sin asignar (Cola común)')).toBeTruthy();
  });

  it('cerrado no pide la lista', () => {
    montar(undefined, false);
    expect(llamadas).not.toHaveBeenCalled();
  });
});
