import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BloqueEtapasPipeline } from './bloque-etapas-pipeline';
import * as crmApi from '../../lib/crm-api';
import type { EtapaDefinida } from '@viajapro/contracts';

const ETAPAS_MOCK: EtapaDefinida[] = [
  {
    id: '01a114b2-5314-75b1-91ad-3be0518a6a01',
    clave: 'NUEVO_LEAD',
    nombre: 'Nuevo prospecto',
    orden: 1,
    probabilidad: 10,
    esGanada: false,
    esPerdida: false,
  },
  {
    id: '01a114b2-5314-75b1-91ad-3be0518a6a02',
    clave: 'EN_COTIZACION',
    nombre: 'Cotización enviada',
    orden: 2,
    probabilidad: 40,
    esGanada: false,
    esPerdida: false,
  },
  {
    id: '01a114b2-5314-75b1-91ad-3be0518a6a03',
    clave: 'GANADA',
    nombre: 'Venta cerrada',
    orden: 3,
    probabilidad: 100,
    esGanada: true,
    esPerdida: false,
  },
];

describe('BloqueEtapasPipeline (T-025)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Carga y renderiza el listado de etapas ordenadas desde la API', async () => {
    vi.spyOn(crmApi, 'listarEtapasPipelineApi').mockResolvedValue(ETAPAS_MOCK);

    await act(async () => {
      render(<BloqueEtapasPipeline />);
      await Promise.resolve();
    });

    expect(screen.getByText('Etapas del Pipeline Comercial')).toBeDefined();
    expect(screen.getByDisplayValue('Nuevo prospecto')).toBeDefined();
    expect(screen.getByDisplayValue('Cotización enviada')).toBeDefined();
    expect(screen.getByDisplayValue('Venta cerrada')).toBeDefined();
    expect(screen.getByText('Ganada')).toBeDefined();
  });

  it('2. Permite reordenar etapas hacia arriba y abajo actualizando el orden', async () => {
    vi.spyOn(crmApi, 'listarEtapasPipelineApi').mockResolvedValue(ETAPAS_MOCK);

    await act(async () => {
      render(<BloqueEtapasPipeline />);
      await Promise.resolve();
    });

    const botonBajarPrimero = screen.getByLabelText(/Mover etapa "Nuevo prospecto" hacia abajo/i);
    expect(botonBajarPrimero).toBeDefined();

    fireEvent.click(botonBajarPrimero);

    // Tras bajar la primera etapa, Cotización enviada pasa a ser la primera
    const inputs = screen.getAllByRole('textbox');
    expect((inputs[0] as HTMLInputElement).value).toBe('Cotización enviada');
    expect((inputs[1] as HTMLInputElement).value).toBe('Nuevo prospecto');
  });

  it('3. Permite editar el nombre y calibrar la probabilidad de una etapa', async () => {
    vi.spyOn(crmApi, 'listarEtapasPipelineApi').mockResolvedValue(ETAPAS_MOCK);

    await act(async () => {
      render(<BloqueEtapasPipeline />);
      await Promise.resolve();
    });

    const inputNombre = screen.getByDisplayValue('Nuevo prospecto');
    fireEvent.change(inputNombre, { target: { value: 'Primer Contacto WhatsApp' } });
    expect(screen.getByDisplayValue('Primer Contacto WhatsApp')).toBeDefined();

    const inputProbabilidad = screen.getByLabelText(
      /Probabilidad de cierre para Primer Contacto WhatsApp/i,
    );
    fireEvent.change(inputProbabilidad, { target: { value: '25' } });
    expect((inputProbabilidad as HTMLInputElement).value).toBe('25');
  });

  it('4. Envía las etapas actualizadas a actualizarEtapasPipelineApi al guardar', async () => {
    vi.spyOn(crmApi, 'listarEtapasPipelineApi').mockResolvedValue(ETAPAS_MOCK);
    const spyActualizar = vi
      .spyOn(crmApi, 'actualizarEtapasPipelineApi')
      .mockResolvedValue(ETAPAS_MOCK);

    await act(async () => {
      render(<BloqueEtapasPipeline />);
      await Promise.resolve();
    });

    const botonGuardar = screen.getByRole('button', { name: /Guardar etapas/i });
    await act(async () => {
      fireEvent.click(botonGuardar);
      await Promise.resolve();
    });

    expect(spyActualizar).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Etapas del pipeline guardadas correctamente.')).toBeDefined();
  });
});
