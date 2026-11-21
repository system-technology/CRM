import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import BandejaConversacionPage from './[id]/page';
import { inboxApi } from '../../../lib/inbox-api';
import * as authApi from '../../../lib/auth-api';
import * as crmApi from '../../../lib/crm-api';
import * as cotizacionesApi from '../../../lib/cotizaciones-api';
import { obtenerMockFichaDeContacto } from '../../../lib/mock-crm';
import type {
  ConversacionDetalle,
  FilaDeCotizacion,
  PaginaDeCotizaciones,
  SesionActual,
} from '@viajapro/contracts';

const CONV_ID = '00000000-0000-4000-8000-000000000801';
const COTIZACION_ID = '01932000-0000-7000-8000-0000000000aa';
const MI_USUARIO_ID = '01932000-0000-7000-8000-000000000011';

const navegacion = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '00000000-0000-4000-8000-000000000801' }),
  usePathname: () => '/bandeja/00000000-0000-4000-8000-000000000801',
  useRouter: () => ({ push: vi.fn(), replace: navegacion.replace }),
  useSearchParams: () => navegacion.params,
}));

const SESION_ASESOR: SesionActual = {
  identidad: {
    id: '01932000-0000-7000-8000-000000000001',
    correo: 'asesor@viajapro.com',
    nombre: 'Carlos Asesor',
  },
  agencias: [
    { id: '01932000-0000-7000-8000-00000000000a', nombre: 'Viajes El Sol', slug: 'viajes-el-sol' },
  ],
  tenantActivoId: '01932000-0000-7000-8000-00000000000a',
  acceso: {
    usuarioId: MI_USUARIO_ID,
    rol: 'Asesor Comercial',
    permisos: ['conversaciones.ver_todas', 'bandeja.operar'],
  },
};

const DETALLE: ConversacionDetalle = {
  id: CONV_ID,
  contactoId: '00000000-0001-4000-8000-000000000001',
  contactoNombre: 'María Gómez',
  contactoTelefono: '+573000000801',
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

const FILA: FilaDeCotizacion = {
  id: COTIZACION_ID,
  contactoId: DETALLE.contactoId,
  oportunidadId: null,
  titulo: 'Cotización San Andrés — Pareja',
  estado: 'BORRADOR',
  versionEnviada: null,
  enviadaEn: null,
  creadaEn: '2026-11-20T10:00:00.000Z',
  ultimaVersionEn: '2026-11-20T10:00:00.000Z',
  numeroDeVersiones: 1,
  paqueteNombre: 'San Andrés',
  fechaSalida: '2027-02-10',
  venta: { unidades: '10800000', moneda: 'COP' },
};

describe('Bandeja — «Cotizar» con contexto y llegada desde el detalle de la cotización (T-321)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    navegacion.params = new URLSearchParams();
    navegacion.replace.mockClear();
    window.localStorage.clear();
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);
    vi.spyOn(crmApi, 'obtenerFichaDeContacto').mockResolvedValue(
      obtenerMockFichaDeContacto('00000000-0001-4000-8000-000000000001'),
    );
    vi.spyOn(inboxApi, 'obtenerConversacionDetalle').mockResolvedValue(DETALLE);
    const pagina: PaginaDeCotizaciones = {
      datos: [FILA],
      pageInfo: { hasMore: false, nextCursor: null },
    };
    vi.spyOn(cotizacionesApi, 'listarCotizacionesApi').mockResolvedValue(pagina);
    vi.spyOn(cotizacionesApi, 'obtenerCotizacionGuardadaApi').mockRejectedValue(
      new Error('sin detalle'),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('el compositor tiene «Cotizar» a un toque, con el contacto y esta conversación', async () => {
    await act(async () => {
      render(<BandejaConversacionPage />);
      await new Promise((r) => setTimeout(r, 20));
    });

    const cotizar = screen.getByTestId('boton-cotizar-desde-chat');
    expect(cotizar.textContent).toContain('Cotizar');
    const url = new URL(cotizar.getAttribute('href') ?? '', 'http://localhost');
    expect(url.pathname).toBe('/cotizador');
    expect(url.searchParams.get('contactoId')).toBe(DETALLE.contactoId);
    expect(url.searchParams.get('conversacion')).toBe(CONV_ID);
    expect(cotizar.className).toContain('min-h-[44px]');
  });

  it('con la ventana de 24 h cerrada también se puede cotizar desde el chat', async () => {
    vi.spyOn(inboxApi, 'obtenerConversacionDetalle').mockResolvedValue({
      ...DETALLE,
      ventana: { abierta: false, expiraEn: '2026-01-01T00:00:00.000Z', minutosRestantes: 0 },
    });
    await act(async () => {
      render(<BandejaConversacionPage />);
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByTestId('compositor-ventana-cerrada')).toBeDefined();
    const cotizar = screen.getByTestId('boton-cotizar-desde-chat');
    expect(cotizar.getAttribute('href')).toContain(`conversacion=${CONV_ID}`);
    expect(cotizar.className).toContain('min-h-[44px]');
  });

  it('«Enviar cotización» y el resto del compositor miden 44 px o más en el celular', async () => {
    await act(async () => {
      render(<BandejaConversacionPage />);
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByTestId('boton-abrir-enviar-cotizacion').className).toContain('min-h-[44px]');
  });

  it('con ?enviarCotizacion= abre el MISMO diálogo de envío por el canal con esa cotización elegida', async () => {
    navegacion.params = new URLSearchParams({ enviarCotizacion: COTIZACION_ID });

    await act(async () => {
      render(<BandejaConversacionPage />);
      await new Promise((r) => setTimeout(r, 20));
    });

    const dialogo = await screen.findByRole('dialog', { name: 'Enviar cotización por WhatsApp' });
    const selector = await waitFor(() => {
      const el = dialogo.querySelector<HTMLSelectElement>(
        '[data-testid="selector-cotizacion-conversacion"]',
      );
      expect(el).not.toBeNull();
      return el!;
    });
    expect(selector.value).toBe(COTIZACION_ID);
    // Se consume una vez: la URL queda limpia para que recargar no lo reabra.
    expect(navegacion.replace).toHaveBeenCalledWith(`/bandeja/${CONV_ID}`, { scroll: false });
  });

  it('sin el parámetro no abre ningún diálogo de envío', async () => {
    await act(async () => {
      render(<BandejaConversacionPage />);
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.queryByRole('dialog', { name: 'Enviar cotización por WhatsApp' })).toBeNull();
    expect(navegacion.replace).not.toHaveBeenCalled();
  });

  it('un ?enviarCotizacion= que no es de este contacto no abre nada', async () => {
    navegacion.params = new URLSearchParams({
      enviarCotizacion: '01932000-0000-7000-8000-0000000000ff',
    });
    await act(async () => {
      render(<BandejaConversacionPage />);
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.queryByRole('dialog', { name: 'Enviar cotización por WhatsApp' })).toBeNull();
  });
});
