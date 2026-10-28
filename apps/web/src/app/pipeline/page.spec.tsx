import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PipelinePage from './page';
import * as crmApi from '../../lib/crm-api';
import { obtenerMockTableroPipeline } from '../../lib/mock-pipeline';

// Mock de next/navigation
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    usePathname: () => '/pipeline',
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
    }),
  };
});

describe('PipelinePage (T-102) — Tablero Kanban y Lista de Oportunidades', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  it('1. Renderiza el tablero Kanban con sus columnas, tarjetas y totales por etapa en dinero entero (R8)', () => {
    render(<PipelinePage />);

    expect(screen.getByText('Pipeline de Oportunidades')).toBeDefined();
    expect(screen.getByText('Consulta nueva')).toBeDefined();
    expect(screen.getByText('En cotización')).toBeDefined();

    // Verificación de totales de columna en R8 (pesos colombianos con formato es-CO)
    expect(screen.getByText(/18\.500\.000/)).toBeDefined();
    expect(screen.getByText(/28\.300\.000/)).toBeDefined();

    // Verificación de tarjetas de oportunidad visibles
    expect(screen.getByText('Paquete San Andrés Todo Incluido Familiar')).toBeDefined();
    expect(screen.getByText('Felipe Morales')).toBeDefined();
  });

  it('2. Mueve una oportunidad entre etapas usando el menú accesible de teclado y actualiza los totales de forma optimista', async () => {
    const mockMover = vi.spyOn(crmApi, 'moverOportunidadDeEtapa').mockResolvedValue({
      id: '00000000-0010-4000-8000-000000000001',
      contactoId: '00000000-0002-4000-8000-000000000004',
      contactoNombre: 'Felipe Morales',
      titulo: 'Paquete San Andrés Todo Incluido Familiar',
      destino: 'San Andrés Islas, Colombia',
      paqueteId: null,
      fechaSalida: '2026-11-20',
      etapa: {
        id: '01a114b2-5314-75b1-91ad-3be0518a6a02',
        clave: 'EN_COTIZACION',
        nombre: 'En cotización',
        orden: 2,
        probabilidad: 40,
        esGanada: false,
        esPerdida: false,
      },
      valorEstimado: { unidades: '6200000', moneda: 'COP' },
      probabilidad: 40,
      asesorId: '00000000-0000-4000-a000-000000000001',
      asesorNombre: 'Carlos Asesor',
      proximaTarea: null,
      motivoPerdida: null,
      notaPerdida: null,
      creadaEn: new Date().toISOString(),
      ultimoContactoEn: new Date().toISOString(),
    });

    render(<PipelinePage />);

    // Buscar el botón de mover por teclado de la primera tarjeta
    const botonMover = screen.getAllByRole('button', { name: /Mover oportunidad.*de etapa/i })[0]!;
    fireEvent.click(botonMover);

    // Seleccionar la etapa destino "En cotización" en el menú desplegable
    const opcionDestino = screen.getAllByRole('menuitem', { name: /En cotización/i })[0]!;
    fireEvent.click(opcionDestino);

    // Actualización optimista: Totales recalculados dinámicamente (R8)
    // Columna origen: 18.500.000 - 6.200.000 = 12.300.000
    // Columna destino: 28.300.000 + 6.200.000 = 34.500.000
    await waitFor(() => {
      expect(screen.getByText(/12\.300\.000/)).toBeDefined();
      expect(screen.getByText(/34\.500\.000/)).toBeDefined();
    });

    // Verificación de llamada a la API
    expect(mockMover).toHaveBeenCalledWith(
      '00000000-0010-4000-8000-000000000001',
      expect.objectContaining({
        etapaId: '01a114b2-5314-75b1-91ad-3be0518a6a02',
      }),
    );
  });

  it('3. Revierte el movimiento optimista y muestra alerta si la API rechaza el cambio', async () => {
    vi.spyOn(crmApi, 'moverOportunidadDeEtapa').mockRejectedValue(
      new Error('Fallo de red simulado en servidor CRM'),
    );

    render(<PipelinePage />);

    // Comprobamos total inicial de Consulta nueva: 18.500.000
    expect(screen.getByText(/18\.500\.000/)).toBeDefined();

    // Disparar movimiento
    const botonMover = screen.getAllByRole('button', { name: /Mover oportunidad.*de etapa/i })[0]!;
    fireEvent.click(botonMover);

    const opcionDestino = screen.getAllByRole('menuitem', { name: /En cotización/i })[0]!;
    fireEvent.click(opcionDestino);

    // Ante el fallo, el tablero debe revertirse al estado original (18.500.000 y 28.300.000)
    await waitFor(() => {
      expect(screen.getByText(/Se revirtió el cambio/i)).toBeDefined();
      expect(screen.getByText(/18\.500\.000/)).toBeDefined();
      expect(screen.getByText(/28\.300\.000/)).toBeDefined();
    });
  });

  it('4. Permite arrastrar y soltar (drag & drop) una tarjeta sobre otra columna recalculando los totales', async () => {
    vi.spyOn(crmApi, 'moverOportunidadDeEtapa').mockResolvedValue(
      obtenerMockTableroPipeline().columnas[0]!.oportunidades[0]!,
    );

    render(<PipelinePage />);

    // Simular drag & drop en columna "En cotización"
    const tarjeta = screen.getAllByRole('article')[0]!;
    const columnaDestino = screen.getByText('En cotización').closest('div')!;

    const dataMap: Record<string, string> = {
      'text/plain': '00000000-0010-4000-8000-000000000001',
    };

    const dataTransfer = {
      setData: vi.fn((format: string, val: string): void => {
        dataMap[format] = val;
      }),
      getData: vi.fn((format: string): string => dataMap[format] ?? ''),
      dropEffect: 'none',
      effectAllowed: 'all',
    };

    fireEvent.dragStart(tarjeta, { dataTransfer });
    fireEvent.dragOver(columnaDestino, { dataTransfer });
    fireEvent.drop(columnaDestino, { dataTransfer });

    // Se verifica el recálculo dinámico optimista
    await waitFor(() => {
      expect(screen.getByText(/12\.300\.000/)).toBeDefined();
      expect(screen.getByText(/34\.500\.000/)).toBeDefined();
    });
  });

  it('5. Al mover a una etapa marcada como perdida exige seleccionar un motivo en el modal', async () => {
    const mockMover = vi
      .spyOn(crmApi, 'moverOportunidadDeEtapa')
      .mockResolvedValue(obtenerMockTableroPipeline().columnas[0]!.oportunidades[0]!);

    render(<PipelinePage />);

    // Abrir menú de movimiento de la primera tarjeta
    const botonMover = screen.getAllByRole('button', { name: /Mover oportunidad.*de etapa/i })[0]!;
    fireEvent.click(botonMover);

    // Seleccionar etapa "Perdida"
    const opcionPerdida = screen.getAllByRole('menuitem', { name: /Perdida/i })[0]!;
    fireEvent.click(opcionPerdida);

    // Debe abrirse el modal de pérdida
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Marcar Oportunidad como Perdida')).toBeDefined();

    // Seleccionar motivo PRECIO y confirmar
    const radioPrecio = screen.getByLabelText(/Precio alto frente a presupuesto/i);
    fireEvent.click(radioPrecio);

    const botonConfirmar = screen.getByRole('button', { name: /Confirmar pérdida/i });
    fireEvent.click(botonConfirmar);

    await waitFor(() => {
      expect(mockMover).toHaveBeenCalledWith(
        '00000000-0010-4000-8000-000000000001',
        expect.objectContaining({
          motivoPerdida: 'PRECIO',
        }),
      );
    });
  });

  it('6. Alterna entre vista Kanban y vista Tabla manteniendo los datos y formato', () => {
    render(<PipelinePage />);

    // Inicialmente está en vista Kanban
    expect(screen.getByText('Pipeline de Oportunidades')).toBeDefined();

    // Cambiar a vista Tabla
    const botonTabla = screen.getByRole('button', { name: /Tabla/i });
    fireEvent.click(botonTabla);

    // Debe mostrarse la tabla con cabeceras
    expect(screen.getByRole('table')).toBeDefined();
    expect(screen.getByText('Oportunidad')).toBeDefined();
    expect(screen.getByText('Valor Estimado')).toBeDefined();
    expect(screen.getAllByText(/Chat/i).length).toBeGreaterThan(0);

    // Volver a vista Kanban
    const botonKanban = screen.getByRole('button', { name: /Kanban/i });
    fireEvent.click(botonKanban);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('7. Filtra las tarjetas por texto de búsqueda y por asesor asignado', () => {
    render(<PipelinePage />);

    const inputBusqueda = screen.getByPlaceholderText(/Buscar por cliente, destino o título.../i);

    // Filtrar por texto que solo coincide con San Andrés
    fireEvent.change(inputBusqueda, { target: { value: 'San Andrés' } });

    expect(screen.getByText('Paquete San Andrés Todo Incluido Familiar')).toBeDefined();
    expect(screen.queryByText('Punta Cana Resort 5 Estrellas (2 Adultos)')).toBeNull();

    // Limpiar búsqueda
    fireEvent.change(inputBusqueda, { target: { value: '' } });
    expect(screen.getByText('Punta Cana Resort 5 Estrellas (2 Adultos)')).toBeDefined();

    // Filtrar por asesor
    const selectAsesor = screen.getByRole('combobox');
    fireEvent.change(selectAsesor, { target: { value: 'Laura Gómez' } });

    // Laura Gómez tiene Punta Cana, pero no San Andrés (que es de Carlos Asesor)
    expect(screen.getByText('Punta Cana Resort 5 Estrellas (2 Adultos)')).toBeDefined();
    expect(screen.queryByText('Paquete San Andrés Todo Incluido Familiar')).toBeNull();
  });

  it('8. Cumple con touch targets mínimos de 44px en controles interactivos', () => {
    render(<PipelinePage />);

    // Selector vista Kanban / Tabla
    const botonKanban = screen.getByRole('button', { name: /Kanban/i });
    const botonTabla = screen.getByRole('button', { name: /Tabla/i });
    expect(botonKanban.className).toContain('min-h-[44px]');
    expect(botonTabla.className).toContain('min-h-[44px]');

    // Botones de acción en tarjeta (Chat y Mover con teclado)
    const botonMover = screen.getAllByRole('button', { name: /Mover oportunidad.*de etapa/i })[0]!;
    expect(botonMover.className).toContain('min-h-[44px]');
    expect(botonMover.className).toContain('min-w-[44px]');

    const enlaceChat = screen.getAllByRole('link', { name: /Abrir conversación de WhatsApp/i })[0]!;
    expect(enlaceChat.className).toContain('min-h-[44px]');
    expect(enlaceChat.className).toContain('min-w-[44px]');
  });

  it('9. Muestra el botón de limpiar filtros cuando hay filtros activos y los restablece al pulsarlo (T-103)', () => {
    render(<PipelinePage />);

    expect(screen.queryByRole('button', { name: /Limpiar filtros del pipeline/i })).toBeNull();

    const inputBusqueda = screen.getByPlaceholderText(/Buscar por cliente, destino o título.../i);
    fireEvent.change(inputBusqueda, { target: { value: 'San Andrés' } });

    const botonLimpiar = screen.getByRole('button', { name: /Limpiar filtros del pipeline/i });
    expect(botonLimpiar).toBeDefined();
    expect(botonLimpiar.className).toContain('min-h-[44px]');

    fireEvent.click(botonLimpiar);

    expect(inputBusqueda).toHaveProperty('value', '');
    expect(screen.queryByRole('button', { name: /Limpiar filtros del pipeline/i })).toBeNull();
  });
});
