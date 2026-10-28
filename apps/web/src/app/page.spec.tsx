import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import InicioPage from './page';
import * as authApi from '../lib/auth-api';
import * as crmApi from '../lib/crm-api';
import type { PendientesDelDia, SesionActual } from '@viajapro/contracts';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

const SESION_ASESOR: SesionActual = {
  identidad: {
    id: '01932000-0000-7000-8000-000000000001',
    correo: 'laura@viajapro.com',
    nombre: 'Laura Gómez',
  },
  agencias: [
    {
      id: '01932000-0000-7000-8000-00000000000a',
      nombre: 'JD Tours Cartagena',
      slug: 'jd-tours-cartagena',
    },
  ],
  tenantActivoId: '01932000-0000-7000-8000-00000000000a',
  acceso: {
    usuarioId: '01932000-0000-7000-8000-000000000011',
    rol: 'Asesor Comercial',
    permisos: ['conversaciones.ver_todas'],
  },
};

const RESUMEN_MOCK: crmApi.ResumenTrabajoDelDia = {
  conversacionesPendientes: 5,
  conversacionesSinAsignar: 2,
  oportunidadesActivas: 7,
  oportunidadesPorEtapa: {
    nuevoLead: 3,
    enCotizacion: 3,
    enNegociacion: 1,
    ganadas: 4,
  },
  cotizacionesPorVencer: 2,
  totalVentasEstimadasCop: '24000000',
  estaVacio: false,
};

const PENDIENTES_MOCK: PendientesDelDia = {
  fecha: '2026-10-27',
  vencidos: [
    {
      id: '01932000-0000-7000-8000-000000000071',
      descripcion: 'Confirmar pago de anticipo $2.500.000 San Andrés Decameron',
      venceEn: '2026-10-26T15:00:00.000Z',
      completadoEn: null,
      asesorId: '01932000-0000-7000-8000-000000000011',
      asesorNombre: 'Laura Gómez',
      contactoId: '01932000-0000-7000-8000-000000000021',
      contactoNombre: 'Laura Restrepo',
      oportunidadId: '01932000-0000-7000-8000-000000000031',
      oportunidadTitulo: 'Paquete San Andrés Decameron',
      conversacionId: '01932000-0000-7000-8000-000000000041',
    },
  ],
  deHoy: [
    {
      id: '01932000-0000-7000-8000-000000000072',
      descripcion: 'Enviar cotización formal Pasadía Bora Bora VIP',
      venceEn: '2026-10-27T16:00:00.000Z',
      completadoEn: null,
      asesorId: '01932000-0000-7000-8000-000000000011',
      asesorNombre: 'Laura Gómez',
      contactoId: '01932000-0000-7000-8000-000000000022',
      contactoNombre: 'Sofía Henao',
      oportunidadId: null,
      oportunidadTitulo: null,
      conversacionId: '01932000-0000-7000-8000-000000000042',
    },
  ],
};

describe('InicioPage (T-020 & T-037) - Inicio del asesor con datos reales y pendientes del día', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);
    vi.spyOn(crmApi, 'obtenerResumenTrabajoDelDia').mockResolvedValue(RESUMEN_MOCK);
    vi.spyOn(crmApi, 'obtenerPendientesDelDiaApi').mockResolvedValue(PENDIENTES_MOCK);
    vi.spyOn(crmApi, 'completarSeguimientoApi').mockResolvedValue({
      ...PENDIENTES_MOCK.vencidos[0]!,
      completadoEn: '2026-10-27T16:30:00.000Z',
    });
  });

  it('1. Renderiza saludo con el nombre del asesor y contexto de su agencia', async () => {
    render(<InicioPage />);

    expect(await screen.findByText(/Laura Gómez/i)).toBeDefined();
    expect(screen.getByText('JD Tours Cartagena')).toBeDefined();
    expect(screen.getByText(/Turno activo/i)).toBeDefined();
  });

  it('2. Presenta accesos rápidos directos a cotizador, bandeja, catálogo y pipeline', async () => {
    render(<InicioPage />);

    const accesoCotizador = await screen.findByTestId('acceso-nueva-cotizacion');
    expect(accesoCotizador.getAttribute('href')).toBe('/cotizador');

    const accesoBandeja = screen.getByTestId('acceso-abrir-bandeja');
    expect(accesoBandeja.getAttribute('href')).toBe('/bandeja');

    const accesoCatalogo = screen.getByTestId('acceso-ver-catalogo');
    expect(accesoCatalogo.getAttribute('href')).toBe('/catalogo');

    const accesoPipeline = screen.getByTestId('acceso-ver-pipeline');
    expect(accesoPipeline.getAttribute('href')).toBe('/pipeline');
  });

  it('3. Muestra las 4 tarjetas con datos reales y enlaces a sus pantallas filtradas', async () => {
    render(<InicioPage />);

    // Tarjeta 1: Conversaciones pendientes
    const tarjetaInbox = await screen.findByTestId('tarjeta-conversaciones-pendientes');
    expect(tarjetaInbox).toBeDefined();
    expect(tarjetaInbox.getAttribute('href')).toBe('/bandeja');
    expect(within(tarjetaInbox).getByText('5')).toBeDefined();

    // Tarjeta 2: Oportunidades en Pipeline
    const tarjetaPipeline = screen.getByTestId('tarjeta-oportunidades-etapa');
    expect(tarjetaPipeline).toBeDefined();
    expect(tarjetaPipeline.getAttribute('href')).toBe('/pipeline');
    expect(within(tarjetaPipeline).getByText('7')).toBeDefined();
    expect(within(tarjetaPipeline).getByText(/3 leads/i)).toBeDefined();

    // Tarjeta 3: Cotizaciones por vencer
    const tarjetaCotiz = screen.getByTestId('tarjeta-cotizaciones-vencer');
    expect(tarjetaCotiz).toBeDefined();
    expect(tarjetaCotiz.getAttribute('href')).toBe('/cotizaciones');
    expect(within(tarjetaCotiz).getByText('2')).toBeDefined();

    // Tarjeta 4: Catálogo de excursiones
    const tarjetaCat = screen.getByTestId('tarjeta-catalogo-turismo');
    expect(tarjetaCat).toBeDefined();
    expect(tarjetaCat.getAttribute('href')).toBe('/catalogo');
    expect(within(tarjetaCat).getByText(/Pasadías & Tours/i)).toBeDefined();
  });

  it('4. Muestra banner de bienvenida amigable cuando la agencia no tiene actividad todavía (estado vacío)', async () => {
    vi.spyOn(crmApi, 'obtenerResumenTrabajoDelDia').mockResolvedValue({
      ...RESUMEN_MOCK,
      conversacionesPendientes: 0,
      conversacionesSinAsignar: 0,
      oportunidadesActivas: 0,
      cotizacionesPorVencer: 0,
      oportunidadesPorEtapa: { nuevoLead: 0, enCotizacion: 0, enNegociacion: 0, ganadas: 0 },
      estaVacio: true,
    });
    vi.spyOn(crmApi, 'obtenerPendientesDelDiaApi').mockResolvedValue({
      fecha: '2026-10-27',
      vencidos: [],
      deHoy: [],
    });

    render(<InicioPage />);

    expect(await screen.findByTestId('inicio-vacio')).toBeDefined();
    expect(screen.getByText(/¡Te damos la bienvenida a tu CRM de turismo!/i)).toBeDefined();
  });

  it('5. Maneja fallos de red con banner de error y botón de reintento funcional', async () => {
    const mockResumen = vi
      .spyOn(crmApi, 'obtenerResumenTrabajoDelDia')
      .mockRejectedValueOnce(new Error('Fallo de red'))
      .mockResolvedValueOnce(RESUMEN_MOCK);

    render(<InicioPage />);

    expect(await screen.findByTestId('inicio-error')).toBeDefined();
    const btnReintentar = screen.getByTestId('boton-reintentar');

    fireEvent.click(btnReintentar);

    await waitFor(() => {
      expect(screen.queryByTestId('inicio-error')).toBeNull();
      expect(screen.getByTestId('tarjeta-conversaciones-pendientes')).toBeDefined();
    });
    expect(mockResumen).toHaveBeenCalledTimes(2);
  });

  it('6. Renderiza el bloque de seguimientos pendientes del día (T-020)', async () => {
    render(<InicioPage />);

    expect(await screen.findByTestId('bloque-seguimientos-dia')).toBeDefined();
    expect(screen.getByText(/Seguimientos pendientes del día/i)).toBeDefined();
    expect(screen.getByText(/Confirmar pago de anticipo/i)).toBeDefined();
    expect(screen.getByText(/Laura Restrepo/i)).toBeDefined();
    expect(screen.getByText(/Enviar cotización formal Pasadía Bora Bora VIP/i)).toBeDefined();
  });

  it('7. Permite completar un seguimiento directamente desde el dashboard (T-020)', async () => {
    const completarSpy = vi.spyOn(crmApi, 'completarSeguimientoApi');

    render(<InicioPage />);

    const btnCompletar = await screen.findByTestId(
      'btn-completar-01932000-0000-7000-8000-000000000071',
    );

    act(() => {
      fireEvent.click(btnCompletar);
    });

    expect(completarSpy).toHaveBeenCalledWith('01932000-0000-7000-8000-000000000071');

    // La tarea completada se retira de la lista
    await waitFor(() => {
      expect(screen.queryByText(/Confirmar pago de anticipo/i)).toBeNull();
    });
  });

  it('8. Mantiene targets táctiles accesibles (>= 44px) para uso en móvil (375 px)', async () => {
    render(<InicioPage />);

    const accesoNuevaCotiz = await screen.findByTestId('acceso-nueva-cotizacion');
    expect(accesoNuevaCotiz.className).toContain('min-h-[44px]');

    const accesoBandeja = screen.getByTestId('acceso-abrir-bandeja');
    expect(accesoBandeja.className).toContain('min-h-[44px]');

    const enlaceChat = screen.getByTestId('enlace-chat-01932000-0000-7000-8000-000000000071');
    expect(enlaceChat.className).toContain('min-h-[44px]');
  });
});
