import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ModalEditarContacto } from './modal-editar-contacto';
import * as crmApi from '../../lib/crm-api';
import type { Contacto } from '@viajapro/contracts';

const contactoBase: Contacto = {
  id: '00000000-0002-4000-8000-000000000001',
  nombre: 'Ana María Martínez',
  telefono: '+573001234567',
  correo: 'ana.martinez@ejemplo.com',
  etiquetas: ['VIP', 'Caribe'],
  preferencias: 'Habitación con vista al mar',
  consentimientos: ['TRANSACCIONAL', 'PROMOCIONAL'],
  creadoEn: '2026-01-15T10:00:00.000Z',
  ultimoContactoEn: '2026-10-10T14:30:00.000Z',
};

describe('ModalEditarContacto (T-076)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('precarga los valores actuales del contacto en el formulario', () => {
    render(
      <ModalEditarContacto
        contacto={contactoBase}
        onCerrar={vi.fn()}
        onContactoActualizado={vi.fn()}
      />,
    );

    expect(screen.getByText('Editar Información del Contacto')).toBeDefined();
    expect(screen.getByTestId<HTMLInputElement>('input-nombre-contacto').value).toBe(
      'Ana María Martínez',
    );
    expect(screen.getByTestId<HTMLInputElement>('input-telefono-contacto').value).toBe(
      '+573001234567',
    );
    expect(screen.getByTestId<HTMLInputElement>('input-correo-contacto').value).toBe(
      'ana.martinez@ejemplo.com',
    );
    expect(screen.getByTestId<HTMLInputElement>('input-etiquetas-contacto').value).toBe(
      'VIP, Caribe',
    );
    expect(screen.getByTestId<HTMLTextAreaElement>('input-preferencias-contacto').value).toBe(
      'Habitación con vista al mar',
    );
  });

  it('guarda los cambios editados y llama a onContactoActualizado', async () => {
    const contactoEditado: Contacto = {
      ...contactoBase,
      nombre: 'Ana María Martínez de la Rosa',
      etiquetas: ['VIP', 'Caribe', 'Frecuente'],
      preferencias: 'Habitación alta y cama king',
    };

    const spyEditar = vi.spyOn(crmApi, 'editarContactoApi').mockResolvedValue(contactoEditado);
    const onContactoActualizado = vi.fn();
    const onCerrar = vi.fn();

    render(
      <ModalEditarContacto
        contacto={contactoBase}
        onCerrar={onCerrar}
        onContactoActualizado={onContactoActualizado}
      />,
    );

    fireEvent.change(screen.getByTestId('input-nombre-contacto'), {
      target: { value: 'Ana María Martínez de la Rosa' },
    });
    fireEvent.change(screen.getByTestId('input-etiquetas-contacto'), {
      target: { value: 'VIP, Caribe, Frecuente' },
    });
    fireEvent.change(screen.getByTestId('input-preferencias-contacto'), {
      target: { value: 'Habitación alta y cama king' },
    });

    fireEvent.click(screen.getByTestId('boton-guardar-contacto'));

    await waitFor(() => {
      expect(spyEditar).toHaveBeenCalledWith(contactoBase.id, {
        nombre: 'Ana María Martínez de la Rosa',
        telefono: '+573001234567',
        correo: 'ana.martinez@ejemplo.com',
        etiquetas: ['VIP', 'Caribe', 'Frecuente'],
        preferencias: 'Habitación alta y cama king',
      });
      expect(onContactoActualizado).toHaveBeenCalledWith(contactoEditado);
      expect(onCerrar).toHaveBeenCalled();
    });
  });

  it('cumple con área táctil accesible para 375 px móvil', () => {
    render(
      <ModalEditarContacto
        contacto={contactoBase}
        onCerrar={vi.fn()}
        onContactoActualizado={vi.fn()}
      />,
    );

    const botonGuardar = screen.getByTestId('boton-guardar-contacto');
    expect(botonGuardar.className).toContain('min-h-[44px]');
  });
});
