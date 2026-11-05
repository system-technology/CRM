import React, { useState } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn(() => null),
  }),
  usePathname: () => '/catalogo',
}));

vi.mock('../../lib/catalogo-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/catalogo-api')>();
  return {
    ...actual,
    estaUsandoCatalogoReal: vi.fn(() => false),
    listarSalidasApi: vi.fn().mockResolvedValue([]),
    listarPaquetesCatalogoApi: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('../../lib/catalogo-gestion-api', () => ({
  listarPaquetesGestionApi: vi.fn().mockResolvedValue([]),
  crearPaqueteGestionApi: vi.fn(),
  actualizarPaqueteGestionApi: vi.fn(),
  desactivarPaqueteGestionApi: vi.fn(),
}));

vi.mock('../../lib/importaciones-api', () => ({
  listarFormatosSoportadosApi: vi.fn().mockResolvedValue([]),
  analizarArchivoImportacionApi: vi.fn(),
  ejecutarImportacionApi: vi.fn(),
  descargarPlantillaUrl: vi.fn(() => '#'),
}));

import CatalogoPage from './page';
import { ModalFormularioPaquete } from '../../components/catalogo/modal-formulario-paquete';
import { DialogoDesactivarPaquete } from '../../components/catalogo/dialogo-desactivar-paquete';
import { FichaDetallePaquete } from '../../components/catalogo/ficha-detalle-paquete';
import { MOCK_PAQUETES_CATALOGO } from '../../lib/mock-catalogo';
import type { ResumenDePaqueteGestion } from '@viajapro/contracts';

const PAQUETE_MOCK: ResumenDePaqueteGestion = {
  id: 'paq-001',
  codigo: 'SMR-PLAYA-4D',
  nombre: 'Playa Blanca y Tayrona Mágico',
  destino: 'Santa Marta',
  paisIso: 'CO',
  dias: 4,
  noches: 3,
  planAlimentacion: 'DESAYUNO',
  inclusiones: ['Alojamiento', 'Desayuno'],
  exclusiones: ['Vuelos'],
  descripcion: 'Experiencia inolvidable en el Caribe',
  activo: true,
  mayoristaId: null,
  desde: [{ moneda: 'COP', unidades: '850000' }],
  desdeEsDeGrupo: false,
  vigenciasActivas: 2,
  creadoEn: '2026-10-01T10:00:00.000Z',
};

describe('Catálogo — Accesibilidad, foco, etiquetas y teclado (T-129)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Pestañas de navegación cumplen con role="tablist", role="tab", aria-selected y panel asociado', () => {
    render(<CatalogoPage />);

    const tablist = screen.getByRole('tablist', { name: /vistas del catálogo/i });
    expect(tablist).toBeDefined();

    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(3);

    const tabExplorar = screen.getByRole('tab', { name: /explorar catálogo/i });
    const tabPlantillas = screen.getByRole('tab', { name: /plantillas csv/i });
    const tabGestion = screen.getByRole('tab', { name: /gestión de productos/i });

    // Estado inicial: Explorar está seleccionado
    expect(tabExplorar.getAttribute('aria-selected')).toBe('true');
    expect(tabPlantillas.getAttribute('aria-selected')).toBe('false');
    expect(tabGestion.getAttribute('aria-selected')).toBe('false');

    const panel = screen.getByRole('tabpanel');
    expect(panel).toBeDefined();
    expect(panel.id).toBe('panel-catalogo-explorar');

    // Cambiar a pestaña de Gestión
    fireEvent.click(tabGestion);
    expect(tabExplorar.getAttribute('aria-selected')).toBe('false');
    expect(tabGestion.getAttribute('aria-selected')).toBe('true');
    expect(panel.id).toBe('panel-catalogo-gestion');
  });

  it('2. Los filtros y campos de búsqueda tienen etiquetas accesibles y objetivos táctiles de al menos 44px', () => {
    render(<CatalogoPage />);

    const inputBuscar = screen.getByRole('textbox', {
      name: /buscar productos por destino o nombre/i,
    });
    expect(inputBuscar).toBeDefined();
    expect(inputBuscar.className).toContain('min-h-[44px]');

    const selectDestino = screen.getByRole('combobox', { name: /filtrar por destino/i });
    expect(selectDestino).toBeDefined();
    expect(selectDestino.className).toContain('min-h-[44px]');
  });

  it('3. ModalFormularioPaquete atrapa foco, cierra con Escape y asocia aria-invalid y aria-describedby a errores', async () => {
    function TestWrapper() {
      const [abierto, setAbierto] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setAbierto(true)}>
            Crear Paquete
          </button>
          <ModalFormularioPaquete
            abierto={abierto}
            alCerrar={() => setAbierto(false)}
            alGuardar={vi.fn()}
          />
        </div>
      );
    }

    render(<TestWrapper />);

    const trigger = screen.getByRole('button', { name: /crear paquete/i });
    trigger.focus();
    fireEvent.click(trigger);

    // Modal abierto con atributos ARIA adecuados
    const dialog = await screen.findByRole('dialog', { name: /nuevo producto turístico/i });
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    // El foco inicial se sitúa en el primer campo interactivo (nombre)
    const inputNombre = screen.getByRole('textbox', { name: /nombre del producto \*/i });
    await waitFor(() => {
      expect(document.activeElement).toBe(inputNombre);
    });

    // Intentar guardar sin datos requeridos para disparar validaciones
    const botonGuardar = screen.getByRole('button', { name: /crear producto/i });
    fireEvent.click(botonGuardar);

    // Verificar que los campos con error tienen aria-invalid y aria-describedby
    await waitFor(() => {
      expect(inputNombre.getAttribute('aria-invalid')).toBe('true');
      expect(inputNombre.getAttribute('aria-describedby')).toBe('error-campo-nombre');
      const alertaNombre = screen.getByText(/el nombre es obligatorio/i);
      expect(alertaNombre.getAttribute('role')).toBe('alert');
    });

    // Cerrar con Escape
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      // Foco devuelto al elemento trigger
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('4. DialogoDesactivarPaquete atrapa foco, enfoca inicialmente el botón seguro y cierra con Escape', async () => {
    function TestWrapper() {
      const [abierto, setAbierto] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setAbierto(true)}>
            Desactivar
          </button>
          <DialogoDesactivarPaquete
            abierto={abierto}
            paquete={PAQUETE_MOCK}
            alCerrar={() => setAbierto(false)}
            alConfirmar={vi.fn()}
          />
        </div>
      );
    }

    render(<TestWrapper />);

    const trigger = screen.getByRole('button', { name: /desactivar/i });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('alertdialog', {
      name: /¿desactivar este producto\?/i,
    });
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-describedby')).toBe('descripcion-dialogo-desactivar');

    // Foco inicial en la acción segura (Cancelar)
    const botonCancelar = screen.getByRole('button', { name: /cancelar/i });
    await waitFor(() => {
      expect(document.activeElement).toBe(botonCancelar);
    });

    // Objetivos táctiles mínimos
    expect(botonCancelar.className).toContain('min-h-[44px]');
    const botonConfirmar = screen.getByRole('button', { name: /desactivar paquete/i });
    expect(botonConfirmar.className).toContain('min-h-[44px]');

    // Cerrar con Escape y verificar foco devuelto
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('5. FichaDetallePaquete atrapa foco, tiene botón de cerrar >= 44px y cierra con Escape', async () => {
    const paqueteDetalle = MOCK_PAQUETES_CATALOGO[0]!;
    function TestWrapper() {
      const [abierto, setAbierto] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setAbierto(true)}>
            Ver Ficha
          </button>
          <FichaDetallePaquete
            paquete={abierto ? paqueteDetalle : null}
            alCerrar={() => setAbierto(false)}
          />
        </div>
      );
    }

    render(<TestWrapper />);

    const trigger = screen.getByRole('button', { name: /ver ficha/i });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog', {
      name: new RegExp(paqueteDetalle.nombre, 'i'),
    });
    expect(dialog).toBeDefined();

    // Botón cerrar accesible y con tamaño mínimo 44px
    const botonCerrar = screen.getByRole('button', { name: /cerrar detalle/i });
    expect(botonCerrar).toBeDefined();
    expect(botonCerrar.className).toContain('min-h-[44px]');
    expect(botonCerrar.className).toContain('min-w-[44px]');

    // Cerrar con Escape
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  });
});
