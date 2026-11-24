import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Contacto360Page from './page';
import * as crmApi from '../../../../lib/crm-api';
import { obtenerMockFichaDeContacto } from '../../../../lib/mock-crm';

let busqueda = '';
const replace = vi.fn();

// Mock de next/navigation
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    useParams: () => ({ id: '00000000-0002-4000-8000-000000000001' }),
    usePathname: () => '/contactos/00000000-0002-4000-8000-000000000001',
    useSearchParams: () => new URLSearchParams(busqueda),
    useRouter: () => ({
      push: vi.fn(),
      replace,
      prefetch: vi.fn(),
    }),
  };
});

describe('Contacto360Page (T-100) — Pantalla Ficha 360 del Contacto', () => {
  const fichaMock = obtenerMockFichaDeContacto('00000000-0002-4000-8000-000000000001');

  beforeEach(() => {
    vi.restoreAllMocks();
    busqueda = '';
    replace.mockClear();
    vi.spyOn(crmApi, 'obtenerFichaDeContacto').mockResolvedValue(fichaMock);
    vi.spyOn(crmApi, 'listarSeguimientosApi').mockResolvedValue({
      datos: [
        {
          id: '01932000-0000-7000-8000-000000000071',
          descripcion: 'Llamar para verificar anticipo',
          venceEn: '2026-10-30T10:00:00.000Z',
          completadoEn: null,
          asesorId: '00000000-0000-4000-a000-000000000001',
          asesorNombre: 'Laura Gómez',
          contactoId: fichaMock.contacto.id,
          contactoNombre: fichaMock.contacto.nombre,
          oportunidadId: fichaMock.oportunidadActual?.id ?? null,
          oportunidadTitulo: fichaMock.oportunidadActual?.titulo ?? null,
          conversacionId: null,
        },
      ],
      pageInfo: { nextCursor: null, hasMore: false },
    });
  });

  it('1. Renderiza los datos demográficos principales, teléfono formateado y consentimiento Ley 1581', async () => {
    render(<Contacto360Page />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
    });

    expect(screen.getByText(fichaMock.contacto.nombre!)).toBeDefined();
    expect(screen.getByText(/Consentimiento Ley 1581/i)).toBeDefined();
    expect(screen.getByText(/Abrir WhatsApp/i)).toBeDefined();
    expect(screen.getByText(/Editar Datos/i)).toBeDefined();
  });

  it('2. Presenta la cuadrícula de métricas 360 (oportunidad activa, cotizaciones, seguimientos y viajes)', async () => {
    render(<Contacto360Page />);

    await waitFor(() => {
      expect(screen.getByText(/Oportunidad Activa/i)).toBeDefined();
    });

    expect(screen.getByText(/Cotizaciones Emitidas/i)).toBeDefined();
    expect(screen.getByText(/Seguimientos Pendientes/i)).toBeDefined();
    expect(screen.getByText(/Archivos de Viaje/i)).toBeDefined();
  });

  it('3. Muestra la línea de tiempo 360 y las pestañas viven en ?pestana= (T-318)', async () => {
    const { rerender } = render(<Contacto360Page />);

    await waitFor(() => {
      expect(screen.getByText(/Línea de Tiempo 360/i)).toBeDefined();
    });

    // Elegir una pestaña escribe la URL con replace (Atrás sale de la ficha)
    fireEvent.click(screen.getByRole('button', { name: /Oportunidad & Cotizaciones/i }));
    expect(replace).toHaveBeenLastCalledWith(
      '/contactos/00000000-0002-4000-8000-000000000001?pestana=oportunidades',
      { scroll: false },
    );

    // La URL manda: con el parámetro puesto, se ve esa pestaña
    busqueda = 'pestana=oportunidades';
    rerender(<Contacto360Page />);
    expect(screen.getByText(/Oportunidad en Pipeline/i)).toBeDefined();
    expect(screen.getByText(fichaMock.oportunidadActual!.titulo)).toBeDefined();
    expect(screen.getByText(/Cotizaciones Oficiales/i)).toBeDefined();

    busqueda = 'pestana=seguimientos';
    rerender(<Contacto360Page />);
    expect(screen.getByText(/Llamar para verificar anticipo/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Completar/i })).toBeDefined();

    // Volver a la primera pestaña deja la URL limpia
    fireEvent.click(screen.getByRole('button', { name: /Línea de Tiempo 360/i }));
    expect(replace).toHaveBeenLastCalledWith('/contactos/00000000-0002-4000-8000-000000000001', {
      scroll: false,
    });
  });

  it('3b. Abrir con ?pestana= válida muestra esa pestaña al montar', async () => {
    busqueda = 'pestana=seguimientos';
    render(<Contacto360Page />);
    expect(await screen.findByText(/Llamar para verificar anticipo/i)).toBeDefined();
  });

  it('3c. Una ?pestana inválida cae a la línea de tiempo, sin romper la ficha', async () => {
    busqueda = 'pestana=../../admin';
    render(<Contacto360Page />);
    expect(await screen.findByText(/Línea de Tiempo 360/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: /Completar/i })).toBeNull();
  });

  it('4. Abre el modal de edición de contacto y permite guardar cambios', async () => {
    const spyEditar = vi.spyOn(crmApi, 'editarContactoApi').mockResolvedValue({
      ...fichaMock.contacto,
      nombre: 'Juan Pérez Editado',
    });

    render(<Contacto360Page />);

    await waitFor(() => {
      expect(screen.getByText(/Editar Datos/i)).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Editar Datos/i));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
    });
    expect(screen.getByRole('heading', { name: /Editar Ficha del Contacto/i })).toBeDefined();

    const inputNombre = screen.getByLabelText(/Nombre completo/i);
    fireEvent.change(inputNombre, { target: { value: 'Juan Pérez Editado' } });

    fireEvent.click(screen.getByRole('button', { name: /Guardar Cambios/i }));

    await waitFor(() => {
      expect(spyEditar).toHaveBeenCalled();
    });
  });

  it('5. Abre el modal de crear oportunidad comercial', async () => {
    const spyCrearOp = vi.spyOn(crmApi, 'crearOportunidadApi').mockResolvedValue({
      ...fichaMock.oportunidadActual!,
      titulo: 'Nueva Oportunidad Cartagena',
    });

    render(<Contacto360Page />);

    await waitFor(() => {
      expect(screen.getByText(/Nueva Oportunidad/i)).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Nueva Oportunidad/i));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
    });
    expect(screen.getByRole('heading', { name: /Nueva Oportunidad Comercial/i })).toBeDefined();

    const inputTitulo = screen.getByLabelText(/Título de la oportunidad/i);
    fireEvent.change(inputTitulo, { target: { value: 'Nueva Oportunidad Cartagena' } });

    fireEvent.click(screen.getByRole('button', { name: /Crear Oportunidad/i }));

    await waitFor(() => {
      expect(spyCrearOp).toHaveBeenCalled();
    });
  });

  it('6. Abre el modal de agendar seguimiento y permite crearlo', async () => {
    const spyCrearSeg = vi.spyOn(crmApi, 'crearSeguimientoApi').mockResolvedValue({
      id: '01932000-0000-7000-8000-000000000099',
      descripcion: 'Confirmar itinerario detallado',
      venceEn: '2026-10-31T15:00:00.000Z',
      completadoEn: null,
      asesorId: '00000000-0000-4000-a000-000000000001',
      asesorNombre: 'Laura Gómez',
      contactoId: fichaMock.contacto.id,
      contactoNombre: fichaMock.contacto.nombre,
      oportunidadId: fichaMock.oportunidadActual?.id ?? null,
      oportunidadTitulo: fichaMock.oportunidadActual?.titulo ?? null,
      conversacionId: null,
    });

    render(<Contacto360Page />);

    await waitFor(() => {
      expect(screen.getByText(/Agendar Seguimiento/i)).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Agendar Seguimiento/i));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
    });
    expect(screen.getByRole('heading', { name: /Agendar Seguimiento/i })).toBeDefined();

    const inputDesc = screen.getByLabelText(/Compromiso \/ Tarea comercial/i);
    fireEvent.change(inputDesc, { target: { value: 'Confirmar itinerario detallado' } });

    const botones = screen.getAllByRole('button', { name: /Agendar Seguimiento/i });
    expect(botones.length).toBeGreaterThan(1);
    // El último es el botón del formulario dentro del modal
    fireEvent.click(botones[botones.length - 1]!);

    await waitFor(() => {
      expect(spyCrearSeg).toHaveBeenCalled();
    });
  });

  it('7. Muestra aviso de error accionable si la API falla', async () => {
    vi.spyOn(crmApi, 'obtenerFichaDeContacto').mockRejectedValueOnce(
      new Error('Fallo de red en servidor CRM'),
    );

    render(<Contacto360Page />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Reintentar/i })).toBeDefined();
    });

    // T-629: la lista se llama «Contactos» en todas partes, no «Directorio de …».
    expect(screen.getByText(/Volver a Contactos/i)).toBeDefined();
  });
});
