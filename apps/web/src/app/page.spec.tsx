import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import InicioPage from './page';
import * as authApi from '../lib/auth-api';
import * as crmApi from '../lib/crm-api';
import type { SesionActual } from '@viajapro/contracts';

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

describe('InicioPage (T-037) - Saludo de turismo, trabajo del día y accesos rápidos', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Renderiza saludo con el nombre del asesor y contexto de su agencia', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);
    vi.spyOn(crmApi, 'obtenerResumenTrabajoDelDia').mockResolvedValue(RESUMEN_MOCK);

    render(<InicioPage />);

    // El saludo contiene el nombre del asesor
    expect(await screen.findByText(/Laura Gómez/i)).toBeDefined();

    // Muestra la agencia activa y estado
    expect(screen.getByText('JD Tours Cartagena')).toBeDefined();
    expect(screen.getByText(/Turno activo/i)).toBeDefined();
  });

  it('2. Presenta accesos rápidos directos a cotizador, bandeja, catálogo y pipeline', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);
    vi.spyOn(crmApi, 'obtenerResumenTrabajoDelDia').mockResolvedValue(RESUMEN_MOCK);

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

  it('3. Muestra las 4 tarjetas de colores de la paleta caribeña con datos reales', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);
    vi.spyOn(crmApi, 'obtenerResumenTrabajoDelDia').mockResolvedValue(RESUMEN_MOCK);

    render(<InicioPage />);

    // Tarjeta 1: Turquesa Caribeño (Conversaciones pendientes)
    const tarjetaInbox = await screen.findByTestId('tarjeta-conversaciones-pendientes');
    expect(tarjetaInbox).toBeDefined();
    expect(tarjetaInbox.getAttribute('href')).toBe('/bandeja');
    expect(within(tarjetaInbox).getByText('5')).toBeDefined();

    // Tarjeta 2: Océano Profundo (Oportunidades en Pipeline)
    const tarjetaPipeline = screen.getByTestId('tarjeta-oportunidades-etapa');
    expect(tarjetaPipeline).toBeDefined();
    expect(tarjetaPipeline.getAttribute('href')).toBe('/pipeline');
    expect(within(tarjetaPipeline).getByText('7')).toBeDefined();
    expect(within(tarjetaPipeline).getByText(/3 leads/i)).toBeDefined();

    // Tarjeta 3: Coral Cálido (Cotizaciones por vencer)
    const tarjetaCotiz = screen.getByTestId('tarjeta-cotizaciones-vencer');
    expect(tarjetaCotiz).toBeDefined();
    expect(tarjetaCotiz.getAttribute('href')).toBe('/cotizaciones');
    expect(within(tarjetaCotiz).getByText('2')).toBeDefined();

    // Tarjeta 4: Atardecer con aro dorado (Catálogo de excursiones)
    const tarjetaCat = screen.getByTestId('tarjeta-catalogo-turismo');
    expect(tarjetaCat).toBeDefined();
    expect(tarjetaCat.getAttribute('href')).toBe('/catalogo');
    expect(within(tarjetaCat).getByText(/Pasadías & Tours/i)).toBeDefined();
  });

  it('4. Muestra banner de bienvenida amigable cuando la agencia no tiene actividad todavía (estado vacío)', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);
    vi.spyOn(crmApi, 'obtenerResumenTrabajoDelDia').mockResolvedValue({
      ...RESUMEN_MOCK,
      conversacionesPendientes: 0,
      conversacionesSinAsignar: 0,
      oportunidadesActivas: 0,
      cotizacionesPorVencer: 0,
      oportunidadesPorEtapa: { nuevoLead: 0, enCotizacion: 0, enNegociacion: 0, ganadas: 0 },
      estaVacio: true,
    });

    render(<InicioPage />);

    expect(await screen.findByTestId('inicio-vacio')).toBeDefined();
    expect(screen.getByText(/¡Te damos la bienvenida a tu CRM de turismo!/i)).toBeDefined();
  });

  it('5. Maneja fallos de red con banner de error y botón de reintento funcional', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);
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
});
