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

  it('1. Muestra el indicador de «reconectando...» cuando el socket entra en reconexión', async () => {
    await act(async () => {
      render(<ListaConversaciones />);
      await new Promise((r) => setTimeout(r, 20));
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

  it('2. Retira la conversación de la lista al recibir evento CONVERSACION_RETIRADA', async () => {
    await act(async () => {
      render(<ListaConversaciones />);
      await new Promise((r) => setTimeout(r, 20));
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

  it('3. Al reconectar, la lista vuelve a pedir la primera página por REST y el hueco se cierra (0c.38)', async () => {
    const consultarBandejaSpy = vi
      .spyOn(inboxApi, 'consultarBandeja')
      .mockResolvedValue(PAGINA_MOCK);

    await act(async () => {
      render(<ListaConversaciones />);
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(consultarBandejaSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Carlos Cliente')).toBeDefined();
    expect(screen.getByText('Mariana Viajera')).toBeDefined();
    expect(screen.queryByText('Pedro Pasajero')).toBeNull();

    // Nueva respuesta que simula conversaciones llegadas durante el corte
    const PAGINA_RECONECTADA: PaginaBandeja = {
      datos: [
        {
          id: '00000000-0000-4000-8000-000000000703',
          contactoId: 'cnt-703',
          contactoNombre: 'Pedro Pasajero',
          contactoTelefono: '+573000000703',
          estado: 'ABIERTA',
          ventana: { abierta: true, expiraEn: null, minutosRestantes: 1440 },
          asignadoAId: null,
          asignadoANombre: null,
          ultimoMensajeTexto: 'Mensaje llegado durante corte',
          ultimoMensajeEn: new Date().toISOString(),
          ultimoMensajeDireccion: 'ENTRANTE',
          mensajesSinLeer: 1,
          slaVenceEn: null,
          etiquetas: [],
        },
        ...PAGINA_MOCK.datos,
      ],
      pageInfo: { nextCursor: null, hasMore: false },
    };
    consultarBandejaSpy.mockResolvedValue(PAGINA_RECONECTADA);

    // Simular reconexión del socket
    await act(async () => {
      inboxSocketManager.notificarReconexion();
      await new Promise((r) => setTimeout(r, 20));
    });

    // Se consultó nuevamente la API por REST
    expect(consultarBandejaSpy).toHaveBeenCalledTimes(2);
    // Y el hueco se cerró: Pedro Pasajero ahora aparece en la lista
    expect(screen.getByText('Pedro Pasajero')).toBeDefined();
  });

  it('4. En estado desconectado muestra aviso visible y la lista conserva lo cargado sin pintar datos simulados (0c.38, 0c.34)', async () => {
    await act(async () => {
      render(<ListaConversaciones />);
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(screen.queryByTestId('indicador-desconectado')).toBeNull();
    expect(screen.getByText('Carlos Cliente')).toBeDefined();
    expect(screen.getByText('Mariana Viajera')).toBeDefined();

    // Cambiar estado a 'desconectado'
    act(() => {
      inboxSocketManager.notificarCambioEstado('desconectado');
    });

    // Indicador y mensaje visible presentes
    const indicador = screen.getByTestId('indicador-desconectado');
    expect(indicador).toBeDefined();
    expect(
      screen.getByText(
        /Sin conexión en tiempo real; los mensajes nuevos no llegarán solos. Reintentando.../i,
      ),
    ).toBeDefined();

    // Invariante 0c.34: conserva lo cargado en memoria, no sustituye por datos mock
    expect(screen.getByText('Carlos Cliente')).toBeDefined();
    expect(screen.getByText('Mariana Viajera')).toBeDefined();
  });

  it('5. Un evento que no valida el contrato Zod no cambia la lista y se registra en consola con warn (0c.38, R3)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await act(async () => {
      render(<ListaConversaciones />);
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(screen.getByText('Carlos Cliente')).toBeDefined();
    expect(screen.getByText('Mariana Viajera')).toBeDefined();

    // Emitir payload no conforme al contrato Zod EventoBandeja
    act(() => {
      inboxSocketManager.notificarEvento({
        tipo: 'EVENTO_INVALIDO_INEXISTENTE',
        conversacionId: '00000000-0000-4000-8000-000000000701',
      });
    });

    // Se registró advertencia en consola
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '[InboxSocketManager] Evento descartado por no cumplir contrato Zod:',
      ),
      expect.anything(),
    );

    // La lista de conversaciones se preservó sin alteraciones
    expect(screen.getByText('Carlos Cliente')).toBeDefined();
    expect(screen.getByText('Mariana Viajera')).toBeDefined();
  });
});
