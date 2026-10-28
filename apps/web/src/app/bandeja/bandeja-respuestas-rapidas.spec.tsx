import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import BandejaConversacionPage from './[id]/page';
import { inboxApi } from '../../lib/inbox-api';
import * as authApi from '../../lib/auth-api';
import * as crmApi from '../../lib/crm-api';
import { obtenerMockFichaDeContacto } from '../../lib/mock-crm';
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
    permisos: ['conversaciones.ver_todas'],
  },
};

const DETALLE_CONVERSACION: ConversacionDetalle = {
  id: CONV_ID,
  contactoId: 'cnt-801',
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
  ultimoMensajeTexto: 'Hola, buenas tardes',
  ultimoMensajeEn: new Date().toISOString(),
  ultimoMensajeDireccion: 'ENTRANTE',
  mensajesSinLeer: 0,
  slaVenceEn: null,
  etiquetas: [],
  mensajes: [
    {
      id: 'msg-1',
      conversacionId: CONV_ID,
      direccion: 'ENTRANTE',
      texto: 'Hola, buenas tardes, quisiera información de viajes.',
      tipo: 'TEXTO',
      estado: 'LEIDO',
      ocurridoEn: new Date().toISOString(),
      adjuntos: [],
      autorId: null,
      autorNombre: null,
      motivoFallo: null,
      cotizacionId: null,
    },
  ],
  notas: [],
};

describe('BandejaConversacionPage — Respuestas Rápidas en el Compositor (T-104)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);
    vi.spyOn(crmApi, 'obtenerFichaDeContacto').mockResolvedValue(
      obtenerMockFichaDeContacto('00000000-0001-4000-8000-000000000001'),
    );
    vi.spyOn(inboxApi, 'obtenerConversacionDetalle').mockResolvedValue(DETALLE_CONVERSACION);
  });

  it('1. Renderiza botón de Respuestas Rápidas en la barra de herramientas del compositor', async () => {
    await act(async () => {
      render(<BandejaConversacionPage />);
      await new Promise((r) => setTimeout(r, 20));
    });

    const botonRR = screen.getByTestId('btn-respuestas-rapidas');
    expect(botonRR).toBeDefined();
    expect(botonRR.className).toContain('min-h-[40px]');
  });

  it('2. Abre y cierra el menú flotante al hacer clic en el botón de Respuestas Rápidas', async () => {
    await act(async () => {
      render(<BandejaConversacionPage />);
      await new Promise((r) => setTimeout(r, 20));
    });

    const botonRR = screen.getByTestId('btn-respuestas-rapidas');

    // Clic para abrir
    act(() => {
      fireEvent.click(botonRR);
    });

    expect(screen.getByRole('listbox', { name: /Respuestas rápidas disponibles/i })).toBeDefined();

    // Clic para cerrar
    act(() => {
      fireEvent.click(botonRR);
    });

    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('3. Al escribir «/» en el textarea despliega el menú flotante con atajos', async () => {
    await act(async () => {
      render(<BandejaConversacionPage />);
      await new Promise((r) => setTimeout(r, 20));
    });

    const textarea = screen.getByPlaceholderText<HTMLTextAreaElement>(
      /Escribe tu respuesta a cliente/i,
    );

    act(() => {
      fireEvent.change(textarea, { target: { value: '/', selectionStart: 1 } });
    });

    expect(screen.getByRole('listbox')).toBeDefined();
    expect(screen.getByText('/saludo')).toBeDefined();
    expect(screen.getByText('/cuenta')).toBeDefined();
  });

  it('4. Filtra dinámicamente las opciones al escribir un comando como «/sal»', async () => {
    await act(async () => {
      render(<BandejaConversacionPage />);
      await new Promise((r) => setTimeout(r, 20));
    });

    const textarea = screen.getByPlaceholderText<HTMLTextAreaElement>(
      /Escribe tu respuesta a cliente/i,
    );

    act(() => {
      fireEvent.change(textarea, { target: { value: '/sal', selectionStart: 4 } });
    });

    expect(screen.getByText('/saludo')).toBeDefined();
    expect(screen.queryByText('/cuenta')).toBeNull();
  });

  it('5. Al seleccionar una respuesta rápida, reemplaza el comando e interpola variables contextuales ({nombre}, {asesor})', async () => {
    await act(async () => {
      render(<BandejaConversacionPage />);
      await new Promise((r) => setTimeout(r, 20));
    });

    const textarea = screen.getByPlaceholderText<HTMLTextAreaElement>(
      /Escribe tu respuesta a cliente/i,
    );

    // Escribir /saludo
    act(() => {
      fireEvent.change(textarea, { target: { value: '/saludo', selectionStart: 7 } });
    });

    // Clic en la opción Saludo inicial cordial
    const opcionSaludo = screen.getByText('Saludo inicial cordial');
    act(() => {
      fireEvent.click(opcionSaludo);
    });

    // El menú flotante debe cerrarse
    expect(screen.queryByRole('listbox')).toBeNull();

    // El textarea debe contener el texto expandido con "María Gómez" y "Carlos Asesor"
    expect(textarea.value).toContain('¡Hola María Gómez!');
    expect(textarea.value).toContain('Carlos Asesor');
    expect(textarea.value).not.toContain('/saludo');
    expect(textarea.value).not.toContain('{nombre}');
  });

  it('6. Permite navegar con flecha abajo y seleccionar con tecla Enter', async () => {
    await act(async () => {
      render(<BandejaConversacionPage />);
      await new Promise((r) => setTimeout(r, 20));
    });

    const textarea = screen.getByPlaceholderText<HTMLTextAreaElement>(
      /Escribe tu respuesta a cliente/i,
    );

    // Abrir menú escribiendo /
    act(() => {
      fireEvent.change(textarea, { target: { value: '/', selectionStart: 1 } });
    });

    expect(screen.getByRole('listbox')).toBeDefined();

    // Flecha abajo para cambiar selección
    act(() => {
      fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    });

    // Enter para insertar la opción activa
    act(() => {
      fireEvent.keyDown(textarea, { key: 'Enter' });
    });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(textarea.value.length).toBeGreaterThan(5);
  });

  it('7. Cierra el menú de respuestas rápidas al presionar la tecla Escape', async () => {
    await act(async () => {
      render(<BandejaConversacionPage />);
      await new Promise((r) => setTimeout(r, 20));
    });

    const textarea = screen.getByPlaceholderText<HTMLTextAreaElement>(
      /Escribe tu respuesta a cliente/i,
    );

    act(() => {
      fireEvent.change(textarea, { target: { value: '/', selectionStart: 1 } });
    });

    expect(screen.getByRole('listbox')).toBeDefined();

    act(() => {
      fireEvent.keyDown(textarea, { key: 'Escape' });
    });

    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
