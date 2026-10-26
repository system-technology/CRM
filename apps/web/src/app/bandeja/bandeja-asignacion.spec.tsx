import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import BandejaConversacionPage from './[id]/page';
import { inboxApi } from '../../lib/inbox-api';
import * as authApi from '../../lib/auth-api';
import * as crmApi from '../../lib/crm-api';
import { obtenerMockFichaDeContacto } from '../../lib/mock-crm';
import { inboxSocketManager } from '../../lib/inbox-socket';
import type { ConversacionDetalle, SesionActual } from '@viajapro/contracts';

const CONV_ID = '00000000-0000-4000-8000-000000000801';
const MI_USUARIO_ID = '01932000-0000-7000-8000-000000000011';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: CONV_ID }),
  usePathname: () => `/bandeja/${CONV_ID}`,
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const SESION_ASESOR: SesionActual = {
  identidad: {
    id: '01932000-0000-7000-8000-000000000001',
    correo: 'asesor@viajapro.com',
    nombre: 'Carlos Asesor',
  },
  agencias: [
    {
      id: '01932000-0000-7000-8000-00000000000a',
      nombre: 'Viajes El Sol',
      slug: 'viajes-el-sol',
    },
  ],
  tenantActivoId: '01932000-0000-7000-8000-00000000000a',
  acceso: {
    usuarioId: MI_USUARIO_ID,
    rol: 'Asesor Comercial',
    permisos: [],
  },
};

const DETALLE_BASE: ConversacionDetalle = {
  id: CONV_ID,
  contactoId: 'cnt-801',
  contactoNombre: 'Viajero Demo',
  contactoTelefono: '+573000000801',
  estado: 'ABIERTA',
  ventana: {
    abierta: true,
    expiraEn: new Date(Date.now() + 86400000).toISOString(),
    minutosRestantes: 1440,
  },
  asignadoAId: null,
  asignadoANombre: null,
  ultimoMensajeTexto: 'Mensaje inicial',
  ultimoMensajeEn: new Date().toISOString(),
  ultimoMensajeDireccion: 'ENTRANTE',
  mensajesSinLeer: 0,
  slaVenceEn: null,
  etiquetas: [],
  mensajes: [],
  notas: [],
};

describe('BandejaConversacionPage — Asignación y Retiro en Tiempo Real (0c.35)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);
    vi.spyOn(crmApi, 'obtenerFichaDeContacto').mockResolvedValue(
      obtenerMockFichaDeContacto('00000000-0001-4000-8000-000000000001'),
    );
  });

  it('1. En conversación sin asignar muestra botón «Tomar» y asigna al asesor activo', async () => {
    vi.spyOn(inboxApi, 'obtenerConversacionDetalle').mockResolvedValue({
      ...DETALLE_BASE,
      asignadoAId: null,
      asignadoANombre: null,
    });

    const spyAsignar = vi.spyOn(inboxApi, 'asignarConversacion').mockResolvedValue({
      ...DETALLE_BASE,
      asignadoAId: MI_USUARIO_ID,
      asignadoANombre: 'Carlos Asesor',
    });

    await act(async () => {
      render(<BandejaConversacionPage />);
      await new Promise((r) => setTimeout(r, 20));
    });

    const botonTomar = screen.getByTestId('boton-tomar');
    expect(botonTomar).toBeDefined();

    act(() => {
      fireEvent.click(botonTomar);
    });

    expect(spyAsignar).toHaveBeenCalledWith({
      conversacionId: CONV_ID,
      usuarioId: MI_USUARIO_ID,
    });
  });

  it('2. En conversación asignada al asesor activo muestra botones «Soltar» y «Reasignar»', async () => {
    vi.spyOn(inboxApi, 'obtenerConversacionDetalle').mockResolvedValue({
      ...DETALLE_BASE,
      asignadoAId: MI_USUARIO_ID,
      asignadoANombre: 'Carlos Asesor',
    });

    const spyAsignar = vi.spyOn(inboxApi, 'asignarConversacion').mockResolvedValue({
      ...DETALLE_BASE,
      asignadoAId: null,
      asignadoANombre: null,
    });

    await act(async () => {
      render(<BandejaConversacionPage />);
      await new Promise((r) => setTimeout(r, 20));
    });

    const botonSoltar = screen.getByTestId('boton-soltar');
    const botonReasignar = screen.getByTestId('boton-reasignar');

    expect(botonSoltar).toBeDefined();
    expect(botonReasignar).toBeDefined();

    act(() => {
      fireEvent.click(botonSoltar);
    });

    expect(spyAsignar).toHaveBeenCalledWith({
      conversacionId: CONV_ID,
      usuarioId: null,
    });
  });

  it('3. Al recibir CONVERSACION_RETIRADA, muestra aviso de retiro, bloquea envío y PRESERVA el borrador', async () => {
    vi.spyOn(inboxApi, 'obtenerConversacionDetalle').mockResolvedValue({
      ...DETALLE_BASE,
      asignadoAId: MI_USUARIO_ID,
      asignadoANombre: 'Carlos Asesor',
    });

    await act(async () => {
      render(<BandejaConversacionPage />);
      await new Promise((r) => setTimeout(r, 20));
    });

    // Simular que el asesor escribe un borrador
    const textarea = screen.getByPlaceholderText<HTMLTextAreaElement>(
      /Escribe tu respuesta a cliente/i,
    );
    act(() => {
      fireEvent.change(textarea, { target: { value: 'Borrador importante que no debe perderse' } });
    });

    expect(textarea.value).toBe('Borrador importante que no debe perderse');

    // Emitir retiro de conversación en tiempo real
    act(() => {
      inboxSocketManager.notificarEvento({
        tipo: 'CONVERSACION_RETIRADA',
        conversacionId: CONV_ID,
      });
    });

    // Debe aparecer el aviso de retiro
    const aviso = screen.getByTestId('aviso-conversacion-retirada');
    expect(aviso).toBeDefined();
    expect(screen.getByText('Esta conversación se asignó a otra persona')).toBeDefined();

    // El campo de texto se deshabilita para evitar envíos no autorizados
    expect(textarea.disabled).toBe(true);

    // INVARIANTE CRÍTICO: El borrador redactado NO se perdió
    expect(textarea.value).toBe('Borrador importante que no debe perderse');
  });

  it('4. CONVERSACION_RETIRADA de OTRA conversación no toca la conversación abierta ni muestra aviso de retiro (0c.38)', async () => {
    vi.spyOn(inboxApi, 'obtenerConversacionDetalle').mockResolvedValue({
      ...DETALLE_BASE,
      asignadoAId: MI_USUARIO_ID,
      asignadoANombre: 'Carlos Asesor',
    });

    await act(async () => {
      render(<BandejaConversacionPage />);
      await new Promise((r) => setTimeout(r, 20));
    });

    const textarea = screen.getByPlaceholderText<HTMLTextAreaElement>(
      /Escribe tu respuesta a cliente/i,
    );
    act(() => {
      fireEvent.change(textarea, { target: { value: 'Borrador activo en conversación actual' } });
    });

    expect(textarea.value).toBe('Borrador activo en conversación actual');

    // Emitir retiro de OTRA conversación en tiempo real (ID distinto a CONV_ID)
    const OTRA_CONV_ID = '00000000-0000-4000-8000-000000000999';
    act(() => {
      inboxSocketManager.notificarEvento({
        tipo: 'CONVERSACION_RETIRADA',
        conversacionId: OTRA_CONV_ID,
      });
    });

    // NO debe aparecer el aviso de retiro
    expect(screen.queryByTestId('aviso-conversacion-retirada')).toBeNull();
    expect(screen.queryByText('Esta conversación se asignó a otra persona')).toBeNull();

    // El campo de texto permanece habilitado y el borrador intacto
    expect(textarea.disabled).toBe(false);
    expect(textarea.value).toBe('Borrador activo en conversación actual');
  });
});
