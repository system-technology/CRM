import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import BandejaConversacionPage from './[id]/page';
import { inboxApi } from '../../lib/inbox-api';
import * as authApi from '../../lib/auth-api';
import * as crmApi from '../../lib/crm-api';
import { obtenerMockFichaDeContacto } from '../../lib/mock-crm';
import type { ConversacionDetalle, SesionActual } from '@viajapro/contracts';

const CONV_ID = '00000000-0000-4000-8000-000000000802';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: CONV_ID }),
  usePathname: () => `/bandeja/${CONV_ID}`,
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function sesion(usuarioId: string | null): SesionActual {
  return {
    identidad: { id: '01932000-0000-7000-8000-000000000001', correo: 'a@v.com', nombre: 'Carlos' },
    agencias: [{ id: '01932000-0000-7000-8000-00000000000a', nombre: 'Viajes', slug: 'viajes' }],
    tenantActivoId: '01932000-0000-7000-8000-00000000000a',
    acceso: usuarioId
      ? { usuarioId, rol: 'Asesor', permisos: ['conversaciones.ver_todas', 'bandeja.operar'] }
      : undefined,
  } as SesionActual;
}

const DETALLE: ConversacionDetalle = {
  id: CONV_ID,
  contactoId: 'cnt-802',
  contactoNombre: 'Viajero',
  contactoTelefono: '+573000000802',
  estado: 'ABIERTA',
  ventana: {
    abierta: true,
    expiraEn: new Date(Date.now() + 86400000).toISOString(),
    minutosRestantes: 1440,
  },
  asignadoAId: null,
  asignadoANombre: null,
  ultimoMensajeTexto: 'Hola',
  ultimoMensajeEn: new Date().toISOString(),
  ultimoMensajeDireccion: 'ENTRANTE',
  mensajesSinLeer: 0,
  slaVenceEn: null,
  etiquetas: [],
  mensajes: [],
  notas: [],
};

async function montar() {
  await act(async () => {
    render(<BandejaConversacionPage />);
    await new Promise((r) => setTimeout(r, 20));
  });
}

describe('Bandeja: errores de asignación (T-185)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(crmApi, 'obtenerFichaDeContacto').mockResolvedValue(
      obtenerMockFichaDeContacto('00000000-0001-4000-8000-000000000001'),
    );
    vi.spyOn(inboxApi, 'obtenerConversacionDetalle').mockResolvedValue(DETALLE);
  });

  it('sin usuarioId no se puede tomar: no hay botón activo ni llamada con id inventado', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(sesion(null));
    const spy = vi.spyOn(inboxApi, 'asignarConversacion');
    await montar();
    const boton = screen.queryByTestId('boton-tomar');
    if (boton) fireEvent.click(boton);
    await act(() => Promise.resolve());
    expect(spy).not.toHaveBeenCalled();
  });

  it('si tomar falla, el asesor ve el error', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(
      sesion('01932000-0000-7000-8000-000000000011'),
    );
    vi.spyOn(inboxApi, 'asignarConversacion').mockImplementation(() =>
      Promise.reject(new Error('boom')),
    );
    await montar();
    fireEvent.click(screen.getByRole('button', { name: /tomar/i }));
    await act(() => Promise.resolve());
    expect(screen.getByText(/No se pudo tomar la conversación/i)).toBeDefined();
  });
});
