import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { ContactoDeLista, FichaDeContacto } from '@viajapro/contracts';
import { FichaDetalleContacto } from './ficha-detalle-contacto';
import * as crmApi from '../../lib/crm-api';

const contacto: ContactoDeLista = {
  id: '00000000-0000-4000-8000-0000000000c1',
  nombre: 'Laura Gómez',
  telefono: '+573109876543',
  correo: null,
  etiquetas: [],
  consentimientos: [],
  creadoEn: '2026-11-01T10:00:00.000Z',
  ultimoContactoEn: null,
};

describe('FichaDetalleContacto: preferencias desde la ficha', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('muestra carga y luego las preferencias de la ficha', async () => {
    vi.spyOn(crmApi, 'obtenerFichaDeContacto').mockResolvedValue({
      contacto: { ...contacto, preferencias: 'Prefiere ventana y hoteles todo incluido' },
    } as unknown as FichaDeContacto);
    render(<FichaDetalleContacto contacto={contacto} onCerrar={vi.fn()} />);
    expect(screen.getByTestId('preferencias-cargando')).toBeDefined();
    await waitFor(() => expect(screen.getByText(/todo incluido/)).toBeDefined());
    expect(screen.queryByTestId('preferencias-cargando')).toBeNull();
  });

  it('muestra error accionable y permite reintentar', async () => {
    const espia = vi
      .spyOn(crmApi, 'obtenerFichaDeContacto')
      .mockRejectedValueOnce(new Error('red'))
      .mockResolvedValueOnce({
        contacto: { ...contacto, preferencias: null },
      } as unknown as FichaDeContacto);
    render(<FichaDetalleContacto contacto={contacto} onCerrar={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('preferencias-error')).toBeDefined());
    fireEvent.click(screen.getByText('Reintentar'));
    await waitFor(() => expect(screen.getByText(/Sin preferencias registradas/)).toBeDefined());
    expect(espia).toHaveBeenCalledTimes(2);
  });
});
