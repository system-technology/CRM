import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import BandejaConversacionPage from './[id]/page';
import { inboxApi } from '../../lib/inbox-api';
import * as authApi from '../../lib/auth-api';
import * as crmApi from '../../lib/crm-api';
import { obtenerMockFichaDeContacto } from '../../lib/mock-crm';
import { BandejaAtajosContext, fijarAtajosHabilitados } from '../../lib/atajos-teclado-bandeja';
import type { ConversacionDetalle, SesionActual } from '@viajapro/contracts';

const CONV_1_ID = '00000000-0000-4000-8000-000000000801';
const CONV_2_ID = '00000000-0000-4000-8000-000000000802';
const MI_USUARIO_ID = '01932000-0000-7000-8000-000000000011';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: CONV_1_ID }),
  usePathname: () => `/bandeja/${CONV_1_ID}`,
  useRouter: () => ({ push: mockPush }),
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
    permisos: ['bandeja.operar', 'crm.escribir', 'cotizacion.escribir'],
  },
};

const DETALLE_BASE: ConversacionDetalle = {
  id: CONV_1_ID,
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
  notas: [],
  mensajes: [
    {
      id: '00000000-0000-4000-8000-000000000999',
      conversacionId: CONV_1_ID,
      direccion: 'ENTRANTE',
      tipo: 'TEXTO',
      texto: 'Hola, quiero una cotización a Cartagena',
      adjuntos: [],
      estado: 'ENTREGADO',
      motivoFallo: null,
      autorId: null,
      autorNombre: null,
      ocurridoEn: new Date().toISOString(),
      cotizacionId: null,
    },
  ],
};

describe('Atajos de teclado en la bandeja (T-127)', () => {
  beforeEach(() => {
    localStorage.clear();
    fijarAtajosHabilitados(true);
    vi.restoreAllMocks();
    mockPush.mockReset();
    vi.spyOn(inboxApi, 'obtenerConversacionDetalle').mockResolvedValue(DETALLE_BASE);
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);
    vi.spyOn(crmApi, 'obtenerFichaDeContacto').mockResolvedValue(
      obtenerMockFichaDeContacto('cnt-801'),
    );
  });

  const renderConContexto = (overrideProps: Partial<any> = {}) => {
    const irASiguiente = vi.fn().mockImplementation(() => {
      mockPush(`/bandeja/${CONV_2_ID}`);
      return CONV_2_ID;
    });
    const irAAnterior = vi.fn().mockImplementation(() => {
      mockPush(`/bandeja/${CONV_1_ID}`);
      return CONV_1_ID;
    });
    const setModalAyudaAbierto = vi.fn();

    const contextValue = {
      conversaciones: [{ id: CONV_1_ID }, { id: CONV_2_ID }] as any,
      setConversaciones: vi.fn(),
      modalAyudaAbierto: false,
      setModalAyudaAbierto,
      irASiguiente,
      irAAnterior,
      atajosHabilitados: true,
      setAtajosHabilitados: vi.fn(),
      ...overrideProps,
    };

    const renderResult = render(
      <BandejaAtajosContext.Provider value={contextValue}>
        <BandejaConversacionPage />
      </BandejaAtajosContext.Provider>,
    );

    return { ...renderResult, irASiguiente, irAAnterior, setModalAyudaAbierto };
  };

  it('1. La tecla "j" navega a la siguiente conversación', async () => {
    const { irASiguiente } = renderConContexto();

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.keyDown(window, { key: 'j' });
    expect(irASiguiente).toHaveBeenCalledWith(CONV_1_ID);
    expect(mockPush).toHaveBeenCalledWith(`/bandeja/${CONV_2_ID}`);
  });

  it('2. La tecla "k" navega a la conversación anterior', async () => {
    const { irAAnterior } = renderConContexto();

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.keyDown(window, { key: 'k' });
    expect(irAAnterior).toHaveBeenCalledWith(CONV_1_ID);
  });

  it('3. La tecla "r" enfoca el compositor de texto del mensaje', async () => {
    renderConContexto();

    await act(async () => {
      await Promise.resolve();
    });

    const textarea = screen.getByPlaceholderText(/Escribe tu respuesta a cliente/i);
    expect(document.activeElement).not.toBe(textarea);

    fireEvent.keyDown(window, { key: 'r' });
    expect(document.activeElement).toBe(textarea);
  });

  it('4. La tecla "c" abre el modal «Enviar cotización»', async () => {
    renderConContexto();

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByRole('dialog', { name: /Enviar cotización/i })).toBeNull();

    fireEvent.keyDown(window, { key: 'c' });
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
    });
    expect(screen.getByText(/Enviar cotización por WhatsApp/i)).toBeDefined();
  });

  it('5. La tecla "s" abre el modal «Crear oportunidad / seguimiento»', async () => {
    renderConContexto();

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.keyDown(window, { key: 's' });
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
    });
    expect(screen.getByText(/Abrir Oportunidad en Pipeline/i)).toBeDefined();
  });

  it('6. La tecla "?" abre el modal de ayuda de atajos de teclado', async () => {
    const { setModalAyudaAbierto } = renderConContexto();

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.keyDown(window, { key: '?' });
    expect(setModalAyudaAbierto).toHaveBeenCalledWith(true);
  });

  it('7. NO se activan los atajos cuando el usuario está redactando dentro del textarea', async () => {
    const { irASiguiente, setModalAyudaAbierto } = renderConContexto();

    await act(async () => {
      await Promise.resolve();
    });

    const textarea = screen.getByPlaceholderText(/Escribe tu respuesta a cliente/i);
    textarea.focus();

    // Escribir 'j', 'r', 'c', 's', '?' en el textarea
    fireEvent.keyDown(textarea, { key: 'j' });
    expect(irASiguiente).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: 'c' });
    expect(screen.queryByRole('dialog', { name: /Enviar cotización/i })).toBeNull();

    fireEvent.keyDown(textarea, { key: '?' });
    expect(setModalAyudaAbierto).not.toHaveBeenCalled();
  });

  it('8. Si los atajos están deshabilitados en preferencias, no se ejecutan las acciones', async () => {
    const { irASiguiente } = renderConContexto({ atajosHabilitados: false });

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.keyDown(window, { key: 'j' });
    expect(irASiguiente).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'c' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
