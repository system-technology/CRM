import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor, within } from '@testing-library/react';
import BandejaConversacionPage from './[id]/page';
import { inboxApi } from '../../lib/inbox-api';
import * as authApi from '../../lib/auth-api';
import * as crmApi from '../../lib/crm-api';
import { obtenerMockFichaDeContacto } from '../../lib/mock-crm';
import type { ConversacionDetalle, SesionActual } from '@viajapro/contracts';

const CONV_ID = '00000000-0000-4000-8000-000000000999';
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
  contactoId: 'cnt-999',
  contactoNombre: 'Viajero Errores',
  contactoTelefono: '+573000000999',
  estado: 'ABIERTA',
  ventana: {
    abierta: true,
    expiraEn: new Date(Date.now() + 86400000).toISOString(),
    minutosRestantes: 1440,
  },
  asignadoAId: MI_USUARIO_ID,
  asignadoANombre: 'Carlos Asesor',
  ultimoMensajeTexto: 'Hola',
  ultimoMensajeEn: new Date().toISOString(),
  ultimoMensajeDireccion: 'ENTRANTE',
  mensajesSinLeer: 0,
  slaVenceEn: null,
  etiquetas: [],
  mensajes: [],
  notas: [],
};

describe('BandejaConversacionPage — Errores de Envío en es-CO (T-117)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);
    vi.spyOn(crmApi, 'obtenerFichaDeContacto').mockResolvedValue(
      obtenerMockFichaDeContacto('00000000-0001-4000-8000-000000000001'),
    );
    vi.spyOn(inboxApi, 'obtenerConversacionDetalle').mockResolvedValue(DETALLE_BASE);
  });

  it('muestra mensaje amigable y acción ante VENTANA_CERRADA sin exponer código crudo', async () => {
    vi.spyOn(inboxApi, 'enviarTexto').mockRejectedValueOnce({
      code: 'VENTANA_CERRADA',
      message: 'Ventana cerrada',
    });

    await act(async () => {
      render(<BandejaConversacionPage />);
      await new Promise((r) => setTimeout(r, 20));
    });

    const textarea = screen.getByPlaceholderText(/Escribe tu respuesta a cliente/i);
    fireEvent.change(textarea, { target: { value: 'Hola viajero' } });

    const botonEnviar = screen.getByLabelText('Enviar mensaje');
    await act(async () => {
      fireEvent.click(botonEnviar);
      await new Promise((r) => setTimeout(r, 20));
    });

    await waitFor(() => {
      const alerta = screen.getByTestId('alerta-error-envio-compositor');
      expect(alerta).toBeDefined();
      expect(within(alerta).getByText('Ventana de 24 horas cerrada')).toBeDefined();
      expect(
        within(alerta).getByText(/La ventana de servicio de 24 horas está cerrada/),
      ).toBeDefined();
      expect(within(alerta).getByText(/Envía una plantilla aprobada/)).toBeDefined();
      expect(alerta.textContent).not.toContain('VENTANA_CERRADA');
    });

    // Permite abrir modal de plantillas desde la alerta
    const botonPlantillas = screen.getByRole('button', { name: /Abrir plantillas/i });
    expect(botonPlantillas).toBeDefined();
  });

  it('muestra mensaje claro ante CONSENTIMIENTO_REVOCADO sin exponer código crudo', async () => {
    vi.spyOn(inboxApi, 'enviarTexto').mockRejectedValueOnce({
      code: 'CONSENTIMIENTO_REVOCADO',
      message: 'Consentimiento revocado por el titular',
    });

    await act(async () => {
      render(<BandejaConversacionPage />);
      await new Promise((r) => setTimeout(r, 20));
    });

    const textarea = screen.getByPlaceholderText(/Escribe tu respuesta a cliente/i);
    fireEvent.change(textarea, { target: { value: 'Información del tour' } });

    const botonEnviar = screen.getByLabelText('Enviar mensaje');
    await act(async () => {
      fireEvent.click(botonEnviar);
      await new Promise((r) => setTimeout(r, 20));
    });

    await waitFor(() => {
      const alerta = screen.getByTestId('alerta-error-envio-compositor');
      expect(alerta).toBeDefined();
      expect(within(alerta).getByText('Autorización de datos revocada')).toBeDefined();
      expect(within(alerta).getByText(/Ley 1581/)).toBeDefined();
      expect(alerta.textContent).not.toContain('CONSENTIMIENTO_REVOCADO');
    });
  });

  it('muestra mensaje claro ante código desconocido sin exponer el código crudo', async () => {
    vi.spyOn(inboxApi, 'enviarTexto').mockRejectedValueOnce({
      code: 'ERROR_TECNICO_INTERNO_GRAVE_9999',
      message: 'Crash',
    });

    await act(async () => {
      render(<BandejaConversacionPage />);
      await new Promise((r) => setTimeout(r, 20));
    });

    const textarea = screen.getByPlaceholderText(/Escribe tu respuesta a cliente/i);
    fireEvent.change(textarea, { target: { value: 'Probando error desconocido' } });

    const botonEnviar = screen.getByLabelText('Enviar mensaje');
    await act(async () => {
      fireEvent.click(botonEnviar);
      await new Promise((r) => setTimeout(r, 20));
    });

    await waitFor(() => {
      const alerta = screen.getByTestId('alerta-error-envio-compositor');
      expect(alerta).toBeDefined();
      expect(within(alerta).getByText('Inconveniente al enviar el mensaje')).toBeDefined();
      expect(within(alerta).getByText(/Ocurrió un contratiempo/)).toBeDefined();
      expect(alerta.textContent).not.toContain('ERROR_TECNICO_INTERNO_GRAVE_9999');
    });

    // Permite descartar la alerta
    const botonCerrar = screen.getByRole('button', { name: /Cerrar aviso de error/i });
    act(() => {
      fireEvent.click(botonCerrar);
    });

    expect(screen.queryByTestId('alerta-error-envio-compositor')).toBeNull();
  });
});
