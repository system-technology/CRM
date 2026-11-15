import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { MotivoDePerdida, Oportunidad } from '@viajapro/contracts';
import { ModalMotivoPerdida } from './modal-motivo-perdida';
import * as crmApi from '../../lib/crm-api';
import { obtenerMockTableroPipeline } from '../../lib/mock-pipeline';

const OP: Oportunidad = obtenerMockTableroPipeline().columnas[0]!.oportunidades[0]!;

const ID_PROPIO = '00000000-0000-4000-8000-0000000000a1';
const ID_NOTA = '00000000-0000-4000-8000-0000000000a2';
const REALES: MotivoDePerdida[] = [
  {
    id: '00000000-0000-4000-8000-0000000000a0',
    clave: 'PRECIO',
    etiqueta: 'Precio',
    orden: 0,
    activo: true,
    exigeNota: false,
  },
  {
    id: ID_PROPIO,
    clave: null,
    etiqueta: 'Otro destino',
    orden: 1,
    activo: true,
    exigeNota: false,
  },
  {
    id: ID_NOTA,
    clave: 'NO_RESPONDE',
    etiqueta: 'Sin respuesta',
    orden: 2,
    activo: true,
    exigeNota: true,
  },
];

describe('ModalMotivoPerdida (T-229)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('modo mock: lista por defecto y envía motivoPerdidaId con el enum', () => {
    vi.spyOn(crmApi, 'estaUsandoApiReal').mockReturnValue(false);
    const onConfirmar = vi.fn();
    render(<ModalMotivoPerdida oportunidad={OP} onConfirmar={onConfirmar} onCancelar={vi.fn()} />);
    expect(screen.getAllByRole('radio')).toHaveLength(7);
    fireEvent.click(screen.getByLabelText(/Cliente dejó de responder/));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar pérdida/ }));
    expect(onConfirmar).toHaveBeenCalledWith(
      'NO_RESPONDE',
      null,
      expect.stringMatching(/^00000000-0029-/),
    );
  });

  it('API real: muestra esqueleto, solo los activos, y un motivo propio viaja como OTRO con su id', async () => {
    vi.spyOn(crmApi, 'estaUsandoApiReal').mockReturnValue(true);
    vi.spyOn(crmApi, 'listarMotivosDePerdidaApi').mockResolvedValue([
      ...REALES,
      {
        ...REALES[0]!,
        id: '00000000-0000-4000-8000-0000000000a9',
        etiqueta: 'Inactivo',
        activo: false,
      },
    ]);
    const onConfirmar = vi.fn();
    render(<ModalMotivoPerdida oportunidad={OP} onConfirmar={onConfirmar} onCancelar={vi.fn()} />);
    expect(screen.getByTestId('motivos-cargando')).toBeDefined();
    await screen.findByLabelText('Precio');
    expect(screen.queryByLabelText('Inactivo')).toBeNull();

    // El motivo propio deriva en OTRO: el contrato exige nota.
    fireEvent.click(screen.getByLabelText('Otro destino'));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar pérdida/ }));
    expect(onConfirmar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Explica el motivo/), {
      target: { value: 'Se fue a Cancún' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar pérdida/ }));
    expect(onConfirmar).toHaveBeenCalledWith('OTRO', 'Se fue a Cancún', ID_PROPIO);
  });

  it('un motivo que exige nota la pide antes de enviar', async () => {
    vi.spyOn(crmApi, 'estaUsandoApiReal').mockReturnValue(true);
    vi.spyOn(crmApi, 'listarMotivosDePerdidaApi').mockResolvedValue(REALES);
    const onConfirmar = vi.fn();
    render(<ModalMotivoPerdida oportunidad={OP} onConfirmar={onConfirmar} onCancelar={vi.fn()} />);
    await screen.findByLabelText('Sin respuesta');
    fireEvent.click(screen.getByLabelText('Sin respuesta'));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar pérdida/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/exige una nota/);
    expect(onConfirmar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Explica el motivo/), { target: { value: '  Nada  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar pérdida/ }));
    expect(onConfirmar).toHaveBeenCalledWith('NO_RESPONDE', 'Nada', ID_NOTA);
  });

  it('error de carga con reintento', async () => {
    vi.spyOn(crmApi, 'estaUsandoApiReal').mockReturnValue(true);
    const listar = vi
      .spyOn(crmApi, 'listarMotivosDePerdidaApi')
      .mockRejectedValueOnce(new crmApi.CrmApiError('X', 'sin conexión', 0))
      .mockResolvedValueOnce(REALES);
    render(<ModalMotivoPerdida oportunidad={OP} onConfirmar={vi.fn()} onCancelar={vi.fn()} />);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByLabelText('Precio')).toBeDefined());
    expect(listar).toHaveBeenCalledTimes(2);
  });
});
