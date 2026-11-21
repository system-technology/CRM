import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';

const navegacion = vi.hoisted(() => ({
  params: new URLSearchParams(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navegacion.push, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => navegacion.params,
  usePathname: () => '/cotizador',
}));

vi.mock('../../../lib/catalogo-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/catalogo-api')>();
  return {
    ...actual,
    estaUsandoCatalogoReal: vi.fn(() => false),
    listarSalidasApi: vi.fn().mockResolvedValue([]),
    obtenerOpcionesDeSalidaApi: vi.fn().mockResolvedValue([]),
  };
});

const CONTACTO_ID = '00000000-0002-4000-8000-000000000004';

vi.mock('../../../lib/crm-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/crm-api')>();
  return {
    ...actual,
    obtenerFichaDeContacto: vi.fn(),
    listarContactos: vi.fn().mockResolvedValue({
      datos: [
        {
          id: '00000000-0002-4000-8000-000000000004',
          nombre: 'Felipe Morales',
          telefono: '+573001234567',
          correo: null,
          etiquetas: [],
          consentimientos: ['TRANSACCIONAL'],
          creadoEn: '2026-10-01T00:00:00.000Z',
          ultimoContactoEn: null,
        },
      ],
      pageInfo: { nextCursor: null, hasMore: false },
    }),
  };
});

import { listarContactos, obtenerFichaDeContacto } from '../../../lib/crm-api';
import CotizadorPage from './page';

describe('Cotizador con contexto del chat y un solo total (T-321)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    navegacion.params = new URLSearchParams({ contactoId: CONTACTO_ID, conversacion: 'conv-77' });
  });

  it('dice para quién cotiza y desde qué chat, con «Volver al chat»', async () => {
    render(<CotizadorPage />);

    await waitFor(() => {
      expect(screen.getByTestId('contexto-texto').textContent).toBe(
        'Cotizando para Felipe Morales · desde la conversación',
      );
    });
    expect(screen.getByTestId('volver-al-chat').getAttribute('href')).toBe('/bandeja/conv-77');
  });

  it('si el contacto no viene en la primera página del listado, pide su ficha y lo deja elegible', async () => {
    vi.mocked(listarContactos).mockResolvedValueOnce({
      datos: [],
      pageInfo: { nextCursor: null, hasMore: true },
    });
    vi.mocked(obtenerFichaDeContacto).mockResolvedValue({
      contacto: {
        id: CONTACTO_ID,
        nombre: 'Andrea Gómez',
        telefono: '+573001112233',
        correo: null,
        etiquetas: [],
        preferencias: 'no debe salir de la ficha',
        consentimientos: ['TRANSACCIONAL'],
        creadoEn: '2026-10-01T00:00:00.000Z',
        ultimoContactoEn: null,
      },
      oportunidadActual: null,
      cotizaciones: [],
      archivosDeViajeIds: [],
      notasInternas: [],
    });

    render(<CotizadorPage />);

    await waitFor(() => {
      expect(screen.getByTestId('contexto-texto').textContent).toBe(
        'Cotizando para Andrea Gómez · desde la conversación',
      );
    });
    expect(obtenerFichaDeContacto).toHaveBeenCalledWith(CONTACTO_ID);
    // Y al guardar, ese contacto está elegido (la lista no lo traía).
    const guardar = await screen.findByRole('button', { name: 'Guardar cotización' });
    await waitFor(() => expect((guardar as HTMLButtonElement).disabled).toBe(false));
    act(() => {
      fireEvent.click(guardar);
    });
    const dialogo = await screen.findByRole('dialog', { name: 'Guardar Cotización Oficial' });
    await waitFor(() => {
      expect(within(dialogo).getByLabelText<HTMLSelectElement>(/Contacto del viajero/).value).toBe(
        CONTACTO_ID,
      );
    });
  });

  it('con el contacto en el listado no pide su ficha (una lectura auditada menos)', async () => {
    render(<CotizadorPage />);
    await waitFor(() => {
      expect(screen.getByTestId('contexto-texto').textContent).toContain('Felipe Morales');
    });
    expect(obtenerFichaDeContacto).not.toHaveBeenCalled();
  });

  it('sin contexto en la URL no pinta la banda', async () => {
    navegacion.params = new URLSearchParams();
    render(<CotizadorPage />);
    await screen.findByLabelText(/paquete turístico/i);
    expect(screen.queryByTestId('banda-de-contexto')).toBeNull();
  });

  it('el total y «Guardar» viven en una barra fija; el total es el mismo que el del resultado', async () => {
    render(<CotizadorPage />);
    const barra = await screen.findByTestId('barra-de-accion-cotizador');
    await waitFor(() => {
      expect(screen.getByTestId('total-barra-de-accion')).toBeDefined();
    });

    const totalBarra = screen.getByTestId('total-barra-de-accion').textContent;
    const totalTabla = screen.getByTestId('desglose-demo-total').textContent;
    expect(totalBarra).toBe(totalTabla);

    // Un solo «Guardar cotización»: sin botones duplicados dentro del resultado.
    expect(screen.getAllByRole('button', { name: /^guardar cotización/i })).toHaveLength(1);
    expect(within(barra).getByRole('button', { name: 'Guardar cotización' })).toBeDefined();

    // Al ajustar la ocupación el total cambia en los dos sitios a la vez.
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /aumentar adultos/i }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('total-barra-de-accion').textContent).not.toBe(totalBarra);
    });
    expect(screen.getByTestId('total-barra-de-accion').textContent).toBe(
      screen.getByTestId('desglose-demo-total').textContent,
    );
  });

  it('los rangos de edad no dejan fuera a nadie: adultos desde 12 años', async () => {
    render(<CotizadorPage />);
    await screen.findByText('Adultos');
    expect(screen.getByText('12 años o más')).toBeDefined();
    expect(screen.getByText('2 a 11 años')).toBeDefined();
    expect(screen.getByText('Menores de 2 años')).toBeDefined();
    expect(screen.queryByText(/Mayor a 12/i)).toBeNull();
  });

  it('al guardar desde un chat, el detalle conserva la conversación para enviarla ahí', async () => {
    render(<CotizadorPage />);
    const guardar = await screen.findByRole('button', { name: 'Guardar cotización' });
    await waitFor(() => expect((guardar as HTMLButtonElement).disabled).toBe(false));

    act(() => {
      fireEvent.click(guardar);
    });
    const dialogo = await screen.findByRole('dialog', { name: 'Guardar Cotización Oficial' });
    act(() => {
      fireEvent.click(
        within(dialogo).getByRole('button', { name: /Confirmar y Guardar Cotización/ }),
      );
    });

    await waitFor(() => expect(navegacion.push).toHaveBeenCalledTimes(1));
    expect(navegacion.push.mock.calls[0]?.[0]).toMatch(
      /^\/cotizaciones\/[0-9a-f-]{36}\?conversacion=conv-77$/,
    );
  });
});
