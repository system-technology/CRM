import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Mock de listarContactos, obtenerMockPaginaContactos y estaUsandoApiReal ANTES de importar el componente
vi.mock('../../lib/crm-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/crm-api')>();
  return {
    ...actual,
    listarContactos: vi.fn(),
    estaUsandoApiReal: vi.fn(() => false),
  };
});

vi.mock('../../lib/mock-contactos', () => ({
  obtenerMockPaginaContactos: vi.fn(),
}));

// Mock de next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/contactos',
}));

import { listarContactos } from '../../lib/crm-api';
import { obtenerMockPaginaContactos } from '../../lib/mock-contactos';
import ContactosPage from './page';
import { PaginaContactos } from '@viajapro/contracts';

describe('ContactosPage — Estados de Carga, Error y Vacío (T-005)', () => {
  const mockPaginaContactos: PaginaContactos = {
    datos: [
      {
        id: '00000000-0002-4000-8000-000000000001',
        nombre: 'Juan Pérez',
        telefono: '+573000012345',
        correo: 'juan.perez@ejemplo.com',
        etiquetas: ['VIP', 'Familia'],
        preferencias: 'Prefiere hoteles 5 estrellas',
        consentimientos: ['TRANSACCIONAL', 'PROMOCIONAL'],
        creadoEn: '2026-01-15T10:00:00.000Z',
        ultimoContactoEn: '2026-10-10T16:00:00.000Z',
      },
    ],
    pageInfo: { nextCursor: null, hasMore: false },
  };

  const mockPaginaVacia: PaginaContactos = {
    datos: [],
    pageInfo: { nextCursor: null, hasMore: false },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(obtenerMockPaginaContactos).mockReturnValue(mockPaginaContactos);
  });

  // Helper para forzar la ejecución de efectos
  const flushPromises = async () => {
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
  };

  describe('Estado de Carga', () => {
    it('renderiza EsqueletoTabla con aria-busy="true" mientras listarContactos está pendiente', async () => {
      let resolvePromise: (value: PaginaContactos) => void;
      const pendingPromise = new Promise<PaginaContactos>((resolve) => {
        resolvePromise = resolve;
      });

      vi.mocked(listarContactos).mockReturnValue(pendingPromise);

      const { container } = render(<ContactosPage />);

      // Esperar a que el useEffect se ejecute y establezca cargando=true
      await waitFor(
        async () => {
          await flushPromises();
          // Buscar el esqueleto por su aria-label
          const esqueleto = container.querySelector('[aria-label="Cargando registros"]');
          if (esqueleto) {
            expect(esqueleto).toBeDefined();
            expect(esqueleto.getAttribute('aria-busy')).toBe('true');
            return;
          }
          throw new Error('Esqueleto no encontrado aún');
        },
        { timeout: 10000, interval: 100 },
      );

      // Resolver la promesa
      await act(async () => {
        resolvePromise!(mockPaginaContactos);
        await Promise.resolve();
      });
    }, 15000);
  });

  describe('Estado de Error', () => {
    it('renderiza AvisoErrorAccionable con role="alert" cuando listarContactos rechaza', async () => {
      vi.mocked(listarContactos).mockRejectedValue(new Error('Failed to fetch'));

      const { container } = render(<ContactosPage />);

      await waitFor(
        async () => {
          await flushPromises();
          const alerta = container.querySelector('[role="alert"]');
          expect(alerta).toBeDefined();
          expect(alerta?.getAttribute('aria-live')).toBe('assertive');
          expect(screen.getByText(/error al cargar el directorio/i)).toBeDefined();
        },
        { timeout: 10000 },
      );
    });

    it('el botón "Reintentar" es funcional y vuelve a llamar a listarContactos', async () => {
      vi.mocked(listarContactos)
        .mockRejectedValueOnce(new Error('Failed to fetch'))
        .mockResolvedValueOnce(mockPaginaContactos);

      const { container } = render(<ContactosPage />);

      await waitFor(
        async () => {
          await flushPromises();
          expect(container.querySelector('[role="alert"]')).toBeDefined();
        },
        { timeout: 10000 },
      );

      const botonReintentar = screen.getByRole('button', { name: /reintentar/i });
      expect(botonReintentar).toBeDefined();
      expect(botonReintentar.className).toContain('min-h-[44px]');

      await act(async () => {
        fireEvent.click(botonReintentar);
        await Promise.resolve();
      });

      expect(listarContactos).toHaveBeenCalledTimes(2);
    });
  });

  describe('Estado Vacío', () => {
    it('renderiza AvisoVacio con role="status" y aria-live="polite" cuando listarContactos resuelve página vacía', async () => {
      vi.mocked(listarContactos).mockResolvedValue(mockPaginaVacia);
      vi.mocked(obtenerMockPaginaContactos).mockReturnValue(mockPaginaVacia);

      const { container } = render(<ContactosPage />);

      await waitFor(
        async () => {
          await flushPromises();
          // Buscar el AvisoVacio (el segundo role="status", el primero es el badge de demo)
          const avisos = container.querySelectorAll('[role="status"]');
          const avisoVacio = Array.from(avisos).find(
            (el) =>
              el.getAttribute('aria-live') === 'polite' &&
              el.textContent?.includes('No hay contactos que mostrar'),
          );
          expect(avisoVacio).toBeDefined();
          expect(screen.getByText('No hay contactos que mostrar')).toBeDefined();
          expect(screen.getByText(/el directorio est/i)).toBeDefined();
        },
        { timeout: 10000 },
      );
    });

    it('el botón "Restablecer filtros" limpia los filtros de búsqueda, etiqueta y consentimiento', async () => {
      // Initial render con datos para que haya etiquetas en el selector, pero API devuelve vacío
      vi.mocked(listarContactos).mockResolvedValue(mockPaginaVacia);
      vi.mocked(obtenerMockPaginaContactos).mockReturnValue(mockPaginaContactos);

      render(<ContactosPage />);

      // Aplicar filtros ANTES de que se complete la carga (mientras hay etiquetas disponibles)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const inputBusqueda = screen.getByPlaceholderText(/buscar por nombre/i) as HTMLInputElement;
      fireEvent.change(inputBusqueda, { target: { value: 'juan' } });

      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBeGreaterThanOrEqual(2);
      const selectEtiqueta = selects[0] as HTMLSelectElement;
      const selectConsentimiento = selects[1] as HTMLSelectElement;

      fireEvent.change(selectEtiqueta, { target: { value: 'VIP' } });
      fireEvent.change(selectConsentimiento, { target: { value: 'PROMOCIONAL' } });

      // Verificar que los filtros se aplicaron
      await waitFor(() => {
        expect(inputBusqueda.value).toBe('juan');
        expect(selectEtiqueta.value).toBe('VIP');
        expect(selectConsentimiento.value).toBe('PROMOCIONAL');
      });

      // Ahora esperar a que se complete la carga y aparezca el estado vacío
      await waitFor(
        async () => {
          await flushPromises();
          expect(screen.getByText('No hay contactos que mostrar')).toBeDefined();
        },
        { timeout: 10000 },
      );

      // Click en "Restablecer filtros"
      const botonRestablecer = screen.getByRole('button', { name: /restablecer filtros/i });
      expect(botonRestablecer).toBeDefined();
      expect(botonRestablecer.className).toContain('min-h-[44px]');

      await act(async () => {
        fireEvent.click(botonRestablecer);
        await Promise.resolve();
      });

      // Verificar que los filtros se limpiaron
      expect(inputBusqueda.value).toBe('');
      expect(selectEtiqueta.value).toBe('todas');
      expect(selectConsentimiento.value).toBe('todos');
    });

    it('muestra descripción contextual cuando hay búsqueda activa', async () => {
      vi.mocked(listarContactos).mockResolvedValue(mockPaginaVacia);
      vi.mocked(obtenerMockPaginaContactos).mockReturnValue(mockPaginaVacia);

      render(<ContactosPage />);

      await waitFor(
        async () => {
          await flushPromises();
          expect(screen.getByText('No hay contactos que mostrar')).toBeDefined();
        },
        { timeout: 10000 },
      );

      const inputBusqueda = screen.getByPlaceholderText(/buscar por nombre/i);
      fireEvent.change(inputBusqueda, { target: { value: 'carlos' } });

      await waitFor(() => {
        expect(screen.getByText(/no hay contactos que coincidan con "carlos"/i)).toBeDefined();
      });
    });
  });
});
