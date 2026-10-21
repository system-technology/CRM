import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ListaConversaciones } from './lista-conversaciones';
import { inboxSocketManager } from '../../lib/inbox-socket';
import { inboxApi } from '../../lib/inbox-api';
import type { PaginaBandeja } from '@viajapro/contracts';

vi.mock('next/navigation', () => ({
  usePathname: () => '/bandeja',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const PAGINA_MOCK: PaginaBandeja = {
  datos: [
    {
      id: '00000000-0000-4000-8000-000000000701',
      contactoId: 'cnt-701',
      contactoNombre: 'Carlos Cliente',
      contactoTelefono: '+573000000701',
      estado: 'ABIERTA',
      ventana: { abierta: true, expiraEn: null, minutosRestantes: 1440 },
      asignadoAId: null,
      asignadoANombre: null,
      ultimoMensajeTexto: 'Hola quiero información',
      ultimoMensajeEn: new Date().toISOString(),
      ultimoMensajeDireccion: 'ENTRANTE',
      mensajesSinLeer: 1,
      slaVenceEn: null,
      etiquetas: [],
    },
    {
      id: '00000000-0000-4000-8000-000000000702',
      contactoId: 'cnt-702',
      contactoNombre: 'Mariana Viajera',
      contactoTelefono: '+573000000702',
      estado: 'ABIERTA',
      ventana: { abierta: true, expiraEn: null, minutosRestantes: 1440 },
      asignadoAId: null,
      asignadoANombre: null,
      ultimoMensajeTexto: 'Confirmación recibida',
      ultimoMensajeEn: new Date().toISOString(),
      ultimoMensajeDireccion: 'ENTRANTE',
      mensajesSinLeer: 0,
      slaVenceEn: null,
      etiquetas: [],
    },
  ],
  pageInfo: {
    nextCursor: null,
    hasMore: false,
  },
};

describe('ListaConversaciones — Integración en tiempo real (0c.35)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(inboxApi, 'consultarBandeja').mockResolvedValue(PAGINA_MOCK);
  });

  it('1. Muestra el indicador de «reconectando...» cuando el socket entra en reconexión', () => {
    act(() => {
      render(<ListaConversaciones />);
    });

    // Inicialmente no está reconectando
    expect(screen.queryByTestId('indicador-reconectando')).toBeNull();

    // Cambiar estado a 'reconectando'
    act(() => {
      inboxSocketManager.notificarCambioEstado('reconectando');
    });

    expect(screen.getByTestId('indicador-reconectando')).toBeDefined();
    expect(screen.getByText(/Reconectando tiempo real.../i)).toBeDefined();

    // Volver a 'conectado'
    act(() => {
      inboxSocketManager.notificarCambioEstado('conectado');
    });

    expect(screen.queryByTestId('indicador-reconectando')).toBeNull();
  });

  it('2. Retira la conversación de la lista al recibir evento CONVERSACION_RETIRADA', () => {
    act(() => {
      render(<ListaConversaciones />);
    });

    expect(screen.getByText('Carlos Cliente')).toBeDefined();
    expect(screen.getByText('Mariana Viajera')).toBeDefined();

    // Emitir retiro de la conversación de Carlos
    act(() => {
      inboxSocketManager.notificarEvento({
        tipo: 'CONVERSACION_RETIRADA',
        conversacionId: '00000000-0000-4000-8000-000000000701',
      });
    });

    // Carlos Cliente ya no debe figurar en el DOM
    expect(screen.queryByText('Carlos Cliente')).toBeNull();
    // Mariana Viajera sigue presente
    expect(screen.getByText('Mariana Viajera')).toBeDefined();
  });
});
