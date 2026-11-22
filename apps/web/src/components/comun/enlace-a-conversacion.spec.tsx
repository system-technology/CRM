import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { empujar, consultarBandeja } = vi.hoisted(() => ({
  empujar: vi.fn(),
  consultarBandeja: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: empujar }) }));
vi.mock('../../lib/inbox-api', () => ({ inboxApi: { consultarBandeja } }));

import { EnlaceAConversacion } from './enlace-a-conversacion';

const conv = (id: string, contactoId: string, ultimoMensajeEn: string) => ({
  id,
  contactoId,
  ultimoMensajeEn,
});

describe('EnlaceAConversacion', () => {
  beforeEach(() => {
    empujar.mockReset();
    consultarBandeja.mockReset();
  });
  afterEach(cleanup);

  it('al tocar lleva a /bandeja/<id> de ESE contacto, no a la lista', async () => {
    consultarBandeja.mockResolvedValue({
      datos: [
        conv('otra', 'c-2', '2026-11-22T10:00:00Z'),
        conv('la-suya', 'c-1', '2026-11-20T10:00:00Z'),
      ],
    });
    render(
      <EnlaceAConversacion contactoId="c-1" termino="Juan Pérez" aria-label="Abrir chat">
        chat
      </EnlaceAConversacion>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Abrir chat' }));
    await waitFor(() => expect(empujar).toHaveBeenCalledWith('/bandeja/la-suya'));
    expect(consultarBandeja).toHaveBeenCalledWith({
      filtro: 'TODAS',
      buscar: 'Juan Pérez',
      limite: 10,
    });
  });

  it('si no hay conversación de ese contacto, cae a la bandeja sin inventar un id', async () => {
    consultarBandeja.mockResolvedValue({ datos: [conv('otra', 'c-2', '2026-11-22T10:00:00Z')] });
    render(
      <EnlaceAConversacion contactoId="c-1" termino="x">
        chat
      </EnlaceAConversacion>,
    );
    fireEvent.click(screen.getByRole('link'));
    await waitFor(() => expect(empujar).toHaveBeenCalledWith('/bandeja'));
  });

  it('si la búsqueda falla, no deja al asesor sin salida', async () => {
    consultarBandeja.mockRejectedValue(new Error('sin red'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(
      <EnlaceAConversacion contactoId="c-1" termino="x">
        chat
      </EnlaceAConversacion>,
    );
    fireEvent.click(screen.getByRole('link'));
    await waitFor(() => expect(empujar).toHaveBeenCalledWith('/bandeja'));
  });

  it('con Ctrl+clic deja actuar al navegador (nueva pestaña) y no busca', () => {
    render(
      <EnlaceAConversacion contactoId="c-1" termino="x">
        chat
      </EnlaceAConversacion>,
    );
    fireEvent.click(screen.getByRole('link'), { ctrlKey: true });
    expect(consultarBandeja).not.toHaveBeenCalled();
    expect(empujar).not.toHaveBeenCalled();
  });
});
