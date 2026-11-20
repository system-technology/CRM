/**
 * T-261 / T-285 — la propuesta al viajero con la API REAL: el RNT solo se imprime si la plataforma
 * lo verificó (ADR-0030 §3.3). Declarado pero sin verificar, o de una API anterior sin el dato, no
 * aparece en ninguna parte del documento. (Con la maqueta, el RNT de la demo cuenta como
 * verificado: lo cubre `page.spec.tsx`.)
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { CotizacionGuardada } from '@viajapro/contracts';
import PaginaImprimirCotizacion from './page';
import * as agencia from '../../../../lib/agencia-api';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '01932000-0000-7000-8000-000000000077' }),
}));

const BASE = {
  nombre: 'Viajes del Sol',
  paisIso: 'CO',
  monedaIso: 'COP',
  zonaHoraria: 'America/Bogota',
};

const COTIZACION: CotizacionGuardada = {
  id: '01932000-0000-7000-8000-000000000077',
  contactoId: '00000000-0002-4000-8000-000000000001',
  oportunidadId: null,
  titulo: 'Cotización San Andrés',
  estado: 'ENVIADA',
  versionEnviada: 1,
  enviadaEn: '2026-10-18T15:30:00.000Z',
  creadaEn: '2026-10-18T14:20:00.000Z',
  actualizadaEn: '2026-10-19T09:15:00.000Z',
  versiones: [
    {
      id: '01932000-0000-7000-8000-000000000101',
      numero: 1,
      creadaEn: '2026-10-18T14:20:00.000Z',
      paqueteId: '01932000-0000-7000-8000-000000000001',
      paqueteNombre: 'San Andrés — 4 días / 3 noches',
      destino: 'San Andrés',
      noches: 3,
      fechaSalida: '2026-12-24',
      vigenciaId: '01932000-0000-7000-8000-000000000001',
      vigenciaDesde: '2026-12-01',
      vigenciaHasta: '2026-12-31',
      deSalidaProgramada: true,
      adultos: 2,
      ninos: 0,
      infantes: 0,
      acomodacion: 'DOBLE',
      lineas: [
        {
          tarifaId: '01932000-0000-7000-8000-000000000011',
          nombre: 'Adulto en acomodación doble',
          unidad: 'POR_PERSONA',
          cubrePasajeros: 1,
          veces: 2,
          precioUnitario: { unidades: '2450000', moneda: 'COP' },
          total: { unidades: '4900000', moneda: 'COP' },
          masBarata: false,
        },
      ],
      venta: { unidades: '4900000', moneda: 'COP' },
      vigenteHasta: '2026-11-15',
    },
  ],
};

const pintar = () =>
  render(<PaginaImprimirCotizacion cotizacionInicial={COTIZACION} productoInicial={null} />);

describe('PaginaImprimirCotizacion con la API real — RNT', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_USE_REAL_CRM', 'true');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('imprime el RNT verificado, en el pie legal', async () => {
    vi.spyOn(agencia, 'obtenerAjustesAgenciaApi').mockResolvedValue({
      ...BASE,
      rnt: '48213',
      rntVerificado: true,
    });
    pintar();
    await waitFor(() =>
      expect(screen.getByTestId('datos-legales-agencia').textContent).toContain('RNT 48213'),
    );
  });

  it('NO imprime el RNT declarado pero sin verificar, en ninguna parte del documento', async () => {
    vi.spyOn(agencia, 'obtenerAjustesAgenciaApi').mockResolvedValue({
      ...BASE,
      rnt: '48213',
      rntVerificado: false,
    });
    const { container } = pintar();
    // Espera a que carguen los datos de la agencia (su nombre ya está en la portada)...
    await waitFor(() =>
      expect(screen.getByTestId('marca-agencia-cotizacion').textContent).toContain(
        'Viajes del Sol',
      ),
    );
    // ...y comprueba que el RNT no llegó al documento, ni como texto ni como atributo.
    expect(screen.queryByTestId('datos-legales-agencia')).toBeNull();
    expect(container.textContent).not.toContain('48213');
    expect(container.innerHTML).not.toContain('48213');
    expect(container.textContent).not.toMatch(/RNT/);
  });

  it('una API anterior, sin los campos del RNT, tampoco lo imprime', async () => {
    vi.spyOn(agencia, 'obtenerAjustesAgenciaApi').mockResolvedValue(BASE);
    const { container } = pintar();
    await waitFor(() =>
      expect(screen.getByTestId('marca-agencia-cotizacion').textContent).toContain(
        'Viajes del Sol',
      ),
    );
    expect(container.textContent).not.toMatch(/RNT/);
  });

  it('verificado pero sin número no inventa uno', async () => {
    vi.spyOn(agencia, 'obtenerAjustesAgenciaApi').mockResolvedValue({
      ...BASE,
      rnt: null,
      rntVerificado: true,
    });
    const { container } = pintar();
    await waitFor(() =>
      expect(screen.getByTestId('marca-agencia-cotizacion').textContent).toContain(
        'Viajes del Sol',
      ),
    );
    expect(container.textContent).not.toMatch(/RNT/);
  });
});
