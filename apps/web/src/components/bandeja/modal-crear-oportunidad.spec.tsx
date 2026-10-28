import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ModalCrearOportunidad } from './modal-crear-oportunidad';
import * as crmApi from '../../lib/crm-api';
import type { Oportunidad } from '@viajapro/contracts';

describe('ModalCrearOportunidad (T-076)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza los campos requeridos y sugeridos con título predeterminado', () => {
    render(
      <ModalCrearOportunidad
        conversacionId="conv-123"
        contactoNombre="Valentina Ríos"
        onCerrar={vi.fn()}
        onOportunidadCreada={vi.fn()}
      />,
    );

    expect(screen.getByText('Abrir Oportunidad en Pipeline')).toBeDefined();
    const inputTitulo = screen.getByTestId<HTMLInputElement>('input-titulo-oportunidad');
    expect(inputTitulo.value).toBe('Viaje para Valentina Ríos');

    expect(screen.getByTestId('input-destino-oportunidad')).toBeDefined();
    expect(screen.getByTestId('input-valor-oportunidad')).toBeDefined();
    expect(screen.getByTestId('input-fecha-salida')).toBeDefined();
    expect(screen.getByTestId('boton-guardar-oportunidad')).toBeDefined();
  });

  it('permite rellenar datos y abrir la oportunidad en la etapa inicial', async () => {
    const mockOportunidad: Oportunidad = {
      id: '00000000-0003-4000-8000-000000000001',
      contactoId: '00000000-0002-4000-8000-000000000001',
      contactoNombre: 'Valentina Ríos',
      titulo: 'Luna de miel Punta Cana',
      destino: 'Punta Cana',
      paqueteId: null,
      fechaSalida: '2026-11-15',
      etapa: {
        id: '01a114b2-5314-75b1-91ad-3be0518a6a01',
        clave: 'NUEVO_LEAD',
        nombre: 'Nuevo Lead',
        orden: 1,
        probabilidad: 10,
        esGanada: false,
        esPerdida: false,
      },
      valorEstimado: {
        unidades: '850000000',
        moneda: 'COP',
      },
      probabilidad: 10,
      asesorId: '00000000-0000-4000-a000-000000000001',
      asesorNombre: 'Carlos Asesor',
      proximaTarea: null,
      motivoPerdida: null,
      notaPerdida: null,
      creadaEn: new Date().toISOString(),
      ultimoContactoEn: new Date().toISOString(),
    };

    const spyCrear = vi
      .spyOn(crmApi, 'crearOportunidadDeConversacionApi')
      .mockResolvedValue(mockOportunidad);

    const onOportunidadCreada = vi.fn();
    const onCerrar = vi.fn();

    render(
      <ModalCrearOportunidad
        conversacionId="conv-123"
        contactoNombre="Valentina Ríos"
        onCerrar={onCerrar}
        onOportunidadCreada={onOportunidadCreada}
      />,
    );

    fireEvent.change(screen.getByTestId('input-titulo-oportunidad'), {
      target: { value: 'Luna de miel Punta Cana' },
    });
    fireEvent.change(screen.getByTestId('input-destino-oportunidad'), {
      target: { value: 'Punta Cana' },
    });
    fireEvent.change(screen.getByTestId('input-valor-oportunidad'), {
      target: { value: '8500000' },
    });
    fireEvent.change(screen.getByTestId('input-fecha-salida'), {
      target: { value: '2026-11-15' },
    });

    fireEvent.click(screen.getByTestId('boton-guardar-oportunidad'));

    await waitFor(() => {
      expect(spyCrear).toHaveBeenCalledWith('conv-123', {
        titulo: 'Luna de miel Punta Cana',
        destino: 'Punta Cana',
        fechaSalida: '2026-11-15',
        valorEstimado: {
          unidades: '850000000',
          moneda: 'COP',
        },
      });
      expect(onOportunidadCreada).toHaveBeenCalledWith(mockOportunidad);
      expect(onCerrar).toHaveBeenCalled();
    });
  });

  it('cumple con área táctil accesible para 375 px móvil', () => {
    render(
      <ModalCrearOportunidad
        conversacionId="conv-123"
        contactoNombre="Valentina Ríos"
        onCerrar={vi.fn()}
        onOportunidadCreada={vi.fn()}
      />,
    );

    const botonGuardar = screen.getByTestId('boton-guardar-oportunidad');
    expect(botonGuardar.className).toContain('min-h-[44px]');
  });
});
