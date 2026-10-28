import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TarjetaSalidaPublicada } from './tarjeta-salida-publicada';
import type { SalidaPublicada } from '@viajapro/contracts';

const SALIDA_BASE: SalidaPublicada = {
  vigenciaId: '01932000-0000-7000-8000-000000000002',
  paqueteId: '01932000-0000-7000-8000-000000000003',
  paqueteNombre: 'Pasadía Islas del Rosario',
  destino: 'Cartagena',
  noches: 0,
  fecha: '2026-11-20',
  cupoTotal: 25,
  desde: { unidades: '180000', moneda: 'COP' },
  desdeEsDeGrupo: false,
  tarifas: 2,
};

describe('TarjetaSalidaPublicada — Aplicación de política promo_vencida (T-028)', () => {
  it('con promo_vencida OCULTAR (listaTachada: null) no muestra precio tachado ni insignia de vencida', () => {
    const salidaOcultar: SalidaPublicada = {
      ...SALIDA_BASE,
      presentacion: {
        estado: 'PROMO_VENCIDA',
        venta: { unidades: '180000', moneda: 'COP' },
        listaTachada: null,
        leyenda: null,
        promoVigente: false,
      },
    };

    render(<TarjetaSalidaPublicada salida={salidaOcultar} />);

    expect(screen.getByText(/180\.000/)).toBeDefined();
    expect(screen.queryByTestId('tarifa-lista-tachada')).toBeNull();
    expect(screen.queryByTestId('insignia-promo-vencida')).toBeNull();
  });

  it('con promo_vencida TACHAR (listaTachada presente y leyenda PROMO_VENCIDA) muestra el precio tachado y la insignia', () => {
    const salidaTachar: SalidaPublicada = {
      ...SALIDA_BASE,
      presentacion: {
        estado: 'PROMO_VENCIDA',
        venta: { unidades: '180000', moneda: 'COP' },
        listaTachada: { unidades: '220000', moneda: 'COP' },
        leyenda: 'PROMO_VENCIDA',
        promoVigente: false,
      },
    };

    render(<TarjetaSalidaPublicada salida={salidaTachar} />);

    expect(screen.getByText(/180\.000/)).toBeDefined();
    const tachado = screen.getByTestId('tarifa-lista-tachada');
    expect(tachado.textContent).toContain('220.000');
    expect(screen.getByTestId('insignia-promo-vencida')).toBeDefined();
  });

  it('con promoción vigente enseña la insignia de promo vigente', () => {
    const salidaPromoVigente: SalidaPublicada = {
      ...SALIDA_BASE,
      presentacion: {
        estado: 'PROMO_VIGENTE',
        venta: { unidades: '160000', moneda: 'COP' },
        listaTachada: { unidades: '180000', moneda: 'COP' },
        leyenda: null,
        promoVigente: true,
      },
    };

    render(<TarjetaSalidaPublicada salida={salidaPromoVigente} />);

    expect(screen.getByTestId('insignia-promo-vigente')).toBeDefined();
  });
});
