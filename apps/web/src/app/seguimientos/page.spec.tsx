import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import SeguimientosPage from './page';
import * as crmApi from '../../lib/crm-api';
import type { Seguimiento } from '@viajapro/contracts';

const MOCK_SEGUIMIENTOS: Seguimiento[] = [
  {
    id: '01932000-0000-7000-8000-000000000001',
    descripcion: 'Confirmar pago anticipo San Andrés Decameron',
    venceEn: '2026-10-26T15:00:00.000Z', // Vencido
    completadoEn: null,
    asesorId: 'asesor-1',
    asesorNombre: 'Laura Gómez',
    contactoId: 'contacto-1',
    contactoNombre: 'Laura Restrepo',
    oportunidadId: 'op-1',
    oportunidadTitulo: 'Paquete San Andrés Decameron',
    conversacionId: 'conv-1',
  },
  {
    id: '01932000-0000-7000-8000-000000000002',
    descripcion: 'Enviar itinerario con lancha Barú',
    venceEn: new Date().toISOString(), // Hoy
    completadoEn: null,
    asesorId: 'asesor-1',
    asesorNombre: 'Laura Gómez',
    contactoId: 'contacto-2',
    contactoNombre: 'Carlos Mario Valencia',
    oportunidadId: null,
    oportunidadTitulo: null,
    conversacionId: 'conv-2',
  },
  {
    id: '01932000-0000-7000-8000-000000000003',
    descripcion: 'Reunión de cierre paquete Europa',
    venceEn: new Date(Date.now() + 86400000 * 2).toISOString(), // Próximo
    completadoEn: null,
    asesorId: 'asesor-2',
    asesorNombre: 'Pedro Martínez',
    contactoId: 'contacto-3',
    contactoNombre: 'Andrés Cepeda',
    oportunidadId: 'op-3',
    oportunidadTitulo: 'Eurotrip 15 Días',
    conversacionId: null,
  },
  {
    id: '01932000-0000-7000-8000-000000000004',
    descripcion: 'Verificar emisión de tiquetes aéreos',
    venceEn: '2026-10-25T11:00:00.000Z',
    completadoEn: '2026-10-25T11:45:00.000Z', // Completado
    asesorId: 'asesor-1',
    asesorNombre: 'Laura Gómez',
    contactoId: 'contacto-1',
    contactoNombre: 'Laura Restrepo',
    oportunidadId: null,
    oportunidadTitulo: null,
    conversacionId: 'conv-1',
  },
];

describe('SeguimientosPage (T-101)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(crmApi, 'listarSeguimientosApi').mockResolvedValue({
      datos: MOCK_SEGUIMIENTOS,
      pageInfo: { nextCursor: null, hasMore: false },
    });

    vi.spyOn(crmApi, 'completarSeguimientoApi').mockImplementation((id) => {
      const item = MOCK_SEGUIMIENTOS.find((s) => s.id === id);
      return Promise.resolve({
        ...(item ?? MOCK_SEGUIMIENTOS[0]!),
        completadoEn: new Date().toISOString(),
      });
    });

    vi.spyOn(crmApi, 'crearSeguimientoApi').mockImplementation((cuerpo) => {
      return Promise.resolve({
        id: '01932000-0000-7000-8000-000000000099',
        descripcion: cuerpo.descripcion,
        venceEn: cuerpo.venceEn,
        completadoEn: null,
        asesorId: 'asesor-1',
        asesorNombre: 'Laura Gómez',
        contactoId: cuerpo.oportunidadId ?? 'contacto-1',
        contactoNombre: 'Cliente Nuevo',
        oportunidadId: cuerpo.oportunidadId ?? null,
        oportunidadTitulo: 'Nueva Oportunidad',
        conversacionId: cuerpo.conversacionId ?? null,
      });
    });
  });

  it('1. Renderiza la cabecera, métricas KPI y lista inicial de seguimientos', async () => {
    render(<SeguimientosPage />);

    expect(
      await screen.findByRole('heading', { level: 1, name: /Seguimientos del Asesor/i }),
    ).toBeDefined();

    // Comprobar tarjetas KPI
    expect(screen.getByTestId('kpi-vencidos')).toBeDefined();
    expect(screen.getByTestId('kpi-hoy')).toBeDefined();
    expect(screen.getByTestId('kpi-proximos')).toBeDefined();
    expect(screen.getByTestId('kpi-completados')).toBeDefined();

    // Comprobar items activos en la lista
    expect(screen.getByText('Confirmar pago anticipo San Andrés Decameron')).toBeDefined();
    expect(screen.getByText('Enviar itinerario con lancha Barú')).toBeDefined();
    expect(screen.getByText('Reunión de cierre paquete Europa')).toBeDefined();
  });

  it('2. Resalta las tareas vencidas con color de alerta e indicación visual', async () => {
    render(<SeguimientosPage />);

    const tarjetaVencida = await screen.findByTestId(
      'tarjeta-seguimiento-01932000-0000-7000-8000-000000000001',
    );
    expect(tarjetaVencida).toBeDefined();
    expect(tarjetaVencida.getAttribute('data-estado')).toBe('vencido');
    expect(within(tarjetaVencida).getByText('Vencido')).toBeDefined();
  });

  it('3. Filtra por la pestaña Vencidos al hacer clic en el tab o KPI', async () => {
    render(<SeguimientosPage />);

    await screen.findByText('Confirmar pago anticipo San Andrés Decameron');

    // Clic en tab Vencidos
    fireEvent.click(screen.getByTestId('tab-vencidos'));

    expect(screen.getByText('Confirmar pago anticipo San Andrés Decameron')).toBeDefined();
    expect(screen.queryByText('Reunión de cierre paquete Europa')).toBeNull();
  });

  it('4. Filtra por la pestaña Completados mostrando tareas finalizadas', async () => {
    render(<SeguimientosPage />);

    await screen.findByText('Confirmar pago anticipo San Andrés Decameron');

    // Clic en tab Completados
    fireEvent.click(screen.getByTestId('tab-completados'));

    expect(screen.getByText('Verificar emisión de tiquetes aéreos')).toBeDefined();
    expect(screen.queryByText('Confirmar pago anticipo San Andrés Decameron')).toBeNull();
  });

  it('5. Filtra por texto en el cuadro de búsqueda', async () => {
    render(<SeguimientosPage />);

    await screen.findByText('Confirmar pago anticipo San Andrés Decameron');

    const input = screen.getByTestId('input-busqueda-seguimientos');
    fireEvent.change(input, { target: { value: 'Barú' } });

    expect(screen.getByText('Enviar itinerario con lancha Barú')).toBeDefined();
    expect(screen.queryByText('Confirmar pago anticipo San Andrés Decameron')).toBeNull();
  });

  it('6. Marca un seguimiento como completado al pulsar el botón Completar', async () => {
    render(<SeguimientosPage />);

    await screen.findByText('Confirmar pago anticipo San Andrés Decameron');

    const tarjeta = screen.getByTestId('tarjeta-seguimiento-01932000-0000-7000-8000-000000000001');
    const botonesCompletar = within(tarjeta).getAllByRole('button', { name: /Completar/i });

    fireEvent.click(botonesCompletar[0]!);

    await waitFor(() => {
      expect(crmApi.completarSeguimientoApi).toHaveBeenCalledWith(
        '01932000-0000-7000-8000-000000000001',
      );
    });
  });

  it('7. Muestra estado vacío cuando una búsqueda no arroja resultados', async () => {
    render(<SeguimientosPage />);

    await screen.findByText('Confirmar pago anticipo San Andrés Decameron');

    const input = screen.getByTestId('input-busqueda-seguimientos');
    fireEvent.change(input, { target: { value: 'InexistenteXYZ123' } });

    expect(screen.getByText('No hay coincidencias')).toBeDefined();
  });

  it('8. Muestra estado de error accionable si la API falla', async () => {
    vi.spyOn(crmApi, 'listarSeguimientosApi').mockRejectedValueOnce(
      new Error('Fallo de conexión con el CRM'),
    );

    render(<SeguimientosPage />);

    expect(await screen.findByRole('button', { name: /Reintentar/i })).toBeDefined();
  });

  it('9. Abre el modal y agenda un nuevo seguimiento', async () => {
    render(<SeguimientosPage />);

    await screen.findByText('Confirmar pago anticipo San Andrés Decameron');

    const botonAgendar = screen.getByTestId('boton-agendar-seguimiento');
    fireEvent.click(botonAgendar);

    // Modal abierto
    expect(screen.getByRole('dialog', { name: /Agendar Seguimiento/i })).toBeDefined();

    const inputDescripcion = screen.getByLabelText(/Compromiso \/ Tarea comercial/i);
    fireEvent.change(inputDescripcion, {
      target: { value: 'Agendar cita presencial para entrega de visas' },
    });

    const botonesGuardar = screen.getAllByRole('button', { name: /Agendar Seguimiento/i });
    fireEvent.click(botonesGuardar[botonesGuardar.length - 1]!);

    await waitFor(() => {
      expect(crmApi.crearSeguimientoApi).toHaveBeenCalled();
    });
  });
});
