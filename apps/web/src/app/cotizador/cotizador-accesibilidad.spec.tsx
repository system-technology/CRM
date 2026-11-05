import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn((key: string) => (key === 'paqueteId' ? 'paq-101' : null)),
  }),
  usePathname: () => '/cotizador',
}));

vi.mock('../../lib/catalogo-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/catalogo-api')>();
  return {
    ...actual,
    estaUsandoCatalogoReal: vi.fn(() => true),
    listarSalidasApi: vi.fn(),
    cotizarSalidaApi: vi.fn(),
    obtenerOpcionesDeSalidaApi: vi.fn(),
  };
});

vi.mock('../../lib/crm-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/crm-api')>();
  return {
    ...actual,
    listarContactos: vi.fn().mockResolvedValue({
      datos: [
        {
          id: '00000000-0002-4000-8000-000000000001',
          nombre: 'María Camila Rodríguez',
          telefono: '+573001234567',
        },
      ],
      pageInfo: { nextCursor: null, hasMore: false },
    }),
  };
});

import {
  estaUsandoCatalogoReal,
  listarSalidasApi,
  cotizarSalidaApi,
  obtenerOpcionesDeSalidaApi,
} from '../../lib/catalogo-api';
import CotizadorPage from './page';

describe('Cotizador — Accesibilidad, foco, etiquetas y teclado (T-129)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('1. Todos los campos de entrada cuentan con etiqueta accesible y controles de foco', async () => {
    vi.mocked(estaUsandoCatalogoReal).mockReturnValue(true);
    vi.mocked(listarSalidasApi).mockResolvedValue([
      {
        vigenciaId: 'vig-101',
        paqueteId: 'paq-101',
        paqueteNombre: 'Tour Islas del Rosario VIP',
        destino: 'Cartagena',
        noches: 0,
        fecha: '2026-10-03',
        cupoTotal: 8,
        desde: { unidades: '180000', moneda: 'COP' },
        desdeEsDeGrupo: false,
        tarifas: 2,
      },
    ]);
    vi.mocked(obtenerOpcionesDeSalidaApi).mockResolvedValue([]);
    vi.mocked(cotizarSalidaApi).mockResolvedValue({
      vigenciaId: 'vig-101',
      paqueteId: 'paq-101',
      paqueteNombre: 'Tour Islas del Rosario VIP',
      destino: 'Cartagena',
      noches: 0,
      deSalidaProgramada: true,
      fecha: '2026-10-03',
      vigenciaDesde: '2026-10-01',
      vigenciaHasta: '2026-10-31',
      pasajeros: 2,
      adultos: 2,
      ninos: 0,
      infantes: 0,
      pideComposicion: true,
      total: { unidades: '360000', moneda: 'COP' },
      lineas: [
        {
          tarifaId: 'tar-1',
          nombre: 'Adulto',
          unidad: 'POR_PERSONA',
          cubrePasajeros: 1,
          veces: 2,
          precioUnitario: { unidades: '180000', moneda: 'COP' },
          total: { unidades: '360000', moneda: 'COP' },
          masBarata: false,
        },
      ],
      alternativas: [],
      noAplicables: [],
      suplementos: [],
    });

    render(<CotizadorPage />);

    // Selector de paquete accesible por rol y etiqueta
    const selectPaquete = await screen.findByRole('combobox', { name: /paquete turístico/i });
    expect(selectPaquete).toBeDefined();

    // Campo de fecha de excursión accesible por etiqueta
    const inputFecha = screen.getByLabelText(/fecha de la excursión/i);
    expect(inputFecha).toBeDefined();

    // Grupo accesible de composición de pasajeros
    const grupoPasajeros = screen.getByRole('group', {
      name: /composición del grupo de pasajeros/i,
    });
    expect(grupoPasajeros).toBeDefined();
  });

  it('2. Los steppers de pasajeros cuentan con botones con aria-label descriptivo y lectura accesible', async () => {
    vi.mocked(estaUsandoCatalogoReal).mockReturnValue(true);
    vi.mocked(listarSalidasApi).mockResolvedValue([
      {
        vigenciaId: 'vig-101',
        paqueteId: 'paq-101',
        paqueteNombre: 'Tour Islas del Rosario VIP',
        destino: 'Cartagena',
        noches: 0,
        fecha: '2026-10-03',
        cupoTotal: 8,
        desde: { unidades: '180000', moneda: 'COP' },
        desdeEsDeGrupo: false,
        tarifas: 2,
      },
    ]);
    vi.mocked(obtenerOpcionesDeSalidaApi).mockResolvedValue([]);
    vi.mocked(cotizarSalidaApi).mockResolvedValue({
      vigenciaId: 'vig-101',
      paqueteId: 'paq-101',
      paqueteNombre: 'Tour Islas del Rosario VIP',
      destino: 'Cartagena',
      noches: 0,
      deSalidaProgramada: true,
      fecha: '2026-10-03',
      vigenciaDesde: '2026-10-01',
      vigenciaHasta: '2026-10-31',
      pasajeros: 2,
      adultos: 2,
      ninos: 0,
      infantes: 0,
      pideComposicion: true,
      total: { unidades: '360000', moneda: 'COP' },
      lineas: [],
      alternativas: [],
      noAplicables: [],
      suplementos: [],
    });

    render(<CotizadorPage />);

    // Botones con etiquetas descriptivas para lectores de pantalla
    const btnAumentarAdultos = await screen.findByRole('button', { name: /aumentar adultos/i });
    const btnDisminuirAdultos = screen.getByRole('button', { name: /disminuir adultos/i });
    const btnAumentarNinos = screen.getByRole('button', { name: /aumentar niños/i });

    expect(btnAumentarAdultos).toBeDefined();
    expect(btnDisminuirAdultos).toBeDefined();

    // Ver el valor inicial anunciado
    expect(screen.getByLabelText(/2 adultos/i)).toBeDefined();

    // Pulsar botón aumentar y verificar actualización accesible
    act(() => {
      fireEvent.click(btnAumentarAdultos);
    });

    expect(screen.getByLabelText(/3 adultos/i)).toBeDefined();

    // Aumentar niños
    act(() => {
      fireEvent.click(btnAumentarNinos);
    });

    expect(screen.getByLabelText(/1 niños/i)).toBeDefined();
  });

  it('3. La opción de salida asocia aria-invalid y aria-describedby con el aviso de error', async () => {
    vi.mocked(estaUsandoCatalogoReal).mockReturnValue(true);
    vi.mocked(listarSalidasApi).mockResolvedValue([
      {
        vigenciaId: 'vig-101',
        paqueteId: 'paq-101',
        paqueteNombre: 'Tour Islas del Rosario VIP',
        destino: 'Cartagena',
        noches: 0,
        fecha: '2026-10-03',
        cupoTotal: 8,
        desde: { unidades: '180000', moneda: 'COP' },
        desdeEsDeGrupo: false,
        tarifas: 2,
      },
    ]);
    vi.mocked(obtenerOpcionesDeSalidaApi).mockResolvedValue([
      {
        id: 'opc-1',
        etiqueta: 'Lancha Rápida Estándar',
        horaSalida: '08:00',
        horaRegreso: null,
        puntoDeEncuentro: null,
        activa: true,
        orden: 1,
      },
    ]);

    render(<CotizadorPage />);

    // Selector de opción de salida
    const selectOpcion = await screen.findByRole('combobox', { name: /opción de salida/i });
    expect(selectOpcion).toBeDefined();

    // Inicialmente no se ha elegido opción, por lo que debe estar marcado aria-invalid
    await waitFor(() => {
      expect(selectOpcion.getAttribute('aria-invalid')).toBe('true');
      expect(selectOpcion.getAttribute('aria-describedby')).toBe('aviso-elegir-opcion');
      const alerta = screen.getByRole('alert');
      expect(alerta.textContent).toContain('Elige una opción de salida para ver el precio');
    });

    // Al seleccionar una opción válida, se elimina el estado de error
    act(() => {
      fireEvent.change(selectOpcion, { target: { value: 'opc-1' } });
    });

    await waitFor(() => {
      expect(selectOpcion.getAttribute('aria-invalid')).toBe('false');
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('4. El modal de Guardar Cotización atrapa foco, cierra con Escape y devuelve el foco al trigger', async () => {
    vi.mocked(estaUsandoCatalogoReal).mockReturnValue(true);
    vi.mocked(listarSalidasApi).mockResolvedValue([
      {
        vigenciaId: 'vig-101',
        paqueteId: 'paq-101',
        paqueteNombre: 'Tour Islas del Rosario VIP',
        destino: 'Cartagena',
        noches: 0,
        fecha: '2026-10-03',
        cupoTotal: 8,
        desde: { unidades: '180000', moneda: 'COP' },
        desdeEsDeGrupo: false,
        tarifas: 2,
      },
    ]);
    vi.mocked(obtenerOpcionesDeSalidaApi).mockResolvedValue([]);
    vi.mocked(cotizarSalidaApi).mockResolvedValue({
      vigenciaId: 'vig-101',
      paqueteId: 'paq-101',
      paqueteNombre: 'Tour Islas del Rosario VIP',
      destino: 'Cartagena',
      noches: 0,
      deSalidaProgramada: true,
      fecha: '2026-10-03',
      vigenciaDesde: '2026-10-01',
      vigenciaHasta: '2026-10-31',
      pasajeros: 2,
      adultos: 2,
      ninos: 0,
      infantes: 0,
      pideComposicion: true,
      total: { unidades: '360000', moneda: 'COP' },
      lineas: [],
      alternativas: [],
      noAplicables: [],
      suplementos: [],
    });

    render(<CotizadorPage />);

    // Esperar a que renderice el botón de guardar
    const btnGuardar = await screen.findByRole('button', { name: /guardar oficial/i });
    expect(btnGuardar).toBeDefined();

    // Enfocar y abrir el modal
    act(() => {
      btnGuardar.focus();
      fireEvent.click(btnGuardar);
    });

    // El diálogo se muestra con role="dialog", aria-modal="true" y aria-labelledby
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toBeDefined();
    expect(dialogo.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('heading', { name: /guardar cotización oficial/i })).toBeDefined();

    // El foco inicial va al input de título descriptivo
    const inputTitulo = screen.getByRole('textbox', { name: /título descriptivo/i });
    await waitFor(() => {
      expect(document.activeElement).toBe(inputTitulo);
    });

    // Pulsar tecla Escape para cerrar el modal
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    // El diálogo desaparece
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    // El foco regresa al botón trigger
    await waitFor(() => {
      expect(document.activeElement).toBe(btnGuardar);
    });
  });
});
