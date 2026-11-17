import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BloqueZonaHoraria } from './bloque-zona-horaria';
import * as api from '../../lib/agencia-api';

const AJUSTES = {
  nombre: 'Agencia',
  paisIso: 'CO',
  monedaIso: 'COP',
  zonaHoraria: 'America/Bogota',
};

describe('BloqueZonaHoraria', () => {
  beforeEach(() => {
    vi.spyOn(api, 'obtenerAjustesDeAgencia').mockResolvedValue(AJUSTES);
  });
  afterEach(() => vi.restoreAllMocks());

  it('muestra esqueleto y luego la zona actual', async () => {
    render(<BloqueZonaHoraria />);
    expect(screen.getByTestId('cargando-zona-horaria')).toBeDefined();
    await waitFor(() =>
      expect(screen.getByTestId('zona-horaria-actual').textContent).toBe('America/Bogota'),
    );
    expect(screen.getByTestId<HTMLSelectElement>('selector-zona-horaria').value).toBe(
      'America/Bogota',
    );
  });

  it('guardar envía { zonaHoraria } y confirma', async () => {
    const patch = vi
      .spyOn(api, 'actualizarZonaHorariaApi')
      .mockResolvedValue({ ...AJUSTES, zonaHoraria: 'America/Lima' });
    render(<BloqueZonaHoraria />);
    await screen.findByTestId('selector-zona-horaria');
    fireEvent.change(screen.getByTestId('selector-zona-horaria'), {
      target: { value: 'America/Lima' },
    });
    fireEvent.click(screen.getByTestId('guardar-zona-horaria'));
    await screen.findByTestId('exito-zona-horaria');
    expect(patch).toHaveBeenCalledWith('America/Lima');
    expect(screen.getByTestId('zona-horaria-actual').textContent).toBe('America/Lima');
  });

  it('422 muestra mensaje legible', async () => {
    vi.spyOn(api, 'actualizarZonaHorariaApi').mockRejectedValue(
      new api.ErrorAjustesAgenciaApi('ZONA_HORARIA_INVALIDA', 'x', 422),
    );
    render(<BloqueZonaHoraria />);
    await screen.findByTestId('selector-zona-horaria');
    fireEvent.change(screen.getByTestId('selector-zona-horaria'), {
      target: { value: 'America/Lima' },
    });
    fireEvent.click(screen.getByTestId('guardar-zona-horaria'));
    const e = await screen.findByTestId('error-zona-horaria');
    expect(e.textContent).toContain('no existe');
  });

  it('403 dice que solo dueño o administrador', async () => {
    vi.spyOn(api, 'actualizarZonaHorariaApi').mockRejectedValue(
      new api.ErrorAjustesAgenciaApi('PERMISO_DENEGADO', 'x', 403),
    );
    render(<BloqueZonaHoraria />);
    await screen.findByTestId('selector-zona-horaria');
    fireEvent.change(screen.getByTestId('selector-zona-horaria'), {
      target: { value: 'America/Lima' },
    });
    fireEvent.click(screen.getByTestId('guardar-zona-horaria'));
    const e = await screen.findByTestId('error-zona-horaria');
    expect(e.textContent).toContain('Solo el dueño o un administrador puede cambiarla');
  });

  it('error de carga ofrece reintentar', async () => {
    vi.spyOn(api, 'obtenerAjustesDeAgencia').mockRejectedValueOnce(
      new api.ErrorAjustesAgenciaApi('ERROR_CONEXION', 'x'),
    );
    render(<BloqueZonaHoraria />);
    fireEvent.click(await screen.findByText('Reintentar'));
    await screen.findByTestId('zona-horaria-actual');
  });
});
