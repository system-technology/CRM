import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Contacto } from '@viajapro/contracts';
import { ModalGuardarCotizacion } from './modal-guardar-cotizacion';

const contacto = (id: string, nombre: string, telefonoE164: string): Contacto =>
  ({ id, nombre, telefonoE164 }) as unknown as Contacto;

const CONTACTOS = [
  contacto('00000000-0000-7000-8000-000000000001', 'Laura Giraldo', '+573001234567'),
  contacto('00000000-0000-7000-8000-000000000002', 'Viajero Nuevo', '+573009998877'),
];

function renderizar(alConfirmar = vi.fn(), contactos: Contacto[] = CONTACTOS) {
  const props = {
    abierto: true,
    alCerrar: vi.fn(),
    alConfirmar,
    guardando: false,
    error: null,
    tituloSugerido: 'Cotización Medellín (2026-10-02)',
    contactosDisponibles: contactos,
    paqueteNombre: 'Medellín',
    fechaSalida: '2026-10-02',
    adultos: 2,
    ninos: 0,
    infantes: 0,
    totalEstimadoFormateado: '$ 978.000',
  };
  const vista = render(<ModalGuardarCotizacion {...props} />);
  return { ...vista, props };
}

describe('ModalGuardarCotizacion: guarda lo que la asesora escribió (T-196)', () => {
  it('cambiar el contacto no restablece el título escrito', async () => {
    const alConfirmar = vi.fn().mockResolvedValue(undefined);
    const { container } = renderizar(alConfirmar);

    const titulo = container.querySelector<HTMLInputElement>('#input-titulo-cotizacion')!;
    fireEvent.change(titulo, { target: { value: 'Cotización para Viajero Nuevo' } });
    const selector = container.querySelector<HTMLSelectElement>('#select-contacto-cotizacion')!;
    fireEvent.change(selector, { target: { value: CONTACTOS[1]!.id } });

    expect(titulo.value).toBe('Cotización para Viajero Nuevo');
    fireEvent.click(screen.getByRole('button', { name: /Confirmar y guardar la cotización/ }));
    await vi.waitFor(() => expect(alConfirmar).toHaveBeenCalled());
    expect(alConfirmar.mock.calls[0]![0]).toMatchObject({
      titulo: 'Cotización para Viajero Nuevo',
      contactoId: CONTACTOS[1]!.id,
    });
  });

  it('una lista de contactos nueva (otra identidad) no pisa la elección ni el título', () => {
    const { container, rerender, props } = renderizar();
    const titulo = container.querySelector<HTMLInputElement>('#input-titulo-cotizacion')!;
    fireEvent.change(titulo, { target: { value: 'Mi título' } });
    const selector = container.querySelector<HTMLSelectElement>('#select-contacto-cotizacion')!;
    fireEvent.change(selector, { target: { value: CONTACTOS[1]!.id } });

    rerender(<ModalGuardarCotizacion {...props} contactosDisponibles={[...CONTACTOS]} />);

    expect(titulo.value).toBe('Mi título');
    expect(selector.value).toBe(CONTACTOS[1]!.id);
  });

  it('al reabrir vuelve al título sugerido', () => {
    const { container, rerender, props } = renderizar();
    fireEvent.change(container.querySelector('#input-titulo-cotizacion')!, {
      target: { value: 'Borrador' },
    });
    rerender(<ModalGuardarCotizacion {...props} abierto={false} />);
    rerender(<ModalGuardarCotizacion {...props} abierto={true} />);
    expect(container.querySelector<HTMLInputElement>('#input-titulo-cotizacion')!.value).toBe(
      'Cotización Medellín (2026-10-02)',
    );
  });
});
