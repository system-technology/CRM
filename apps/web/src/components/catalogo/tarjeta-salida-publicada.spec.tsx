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

describe('TarjetaSalidaPublicada (T-018 & T-051)', () => {
  const salidaBase: SalidaPublicada = {
    vigenciaId: 'vig-1',
    paqueteId: 'paq-1',
    paqueteNombre: 'Pasadía Islas del Rosario',
    destino: 'Cartagena',
    noches: 0,
    fecha: '2026-10-03',
    cupoTotal: 4,
    desde: { unidades: '180000', moneda: 'COP' },
    desdeEsDeGrupo: false,
    tarifas: 2,
  };

  it('1. Renderiza los datos básicos, cupos por salida («sáb 3 oct · quedan 4») y botón de cotización (T-018)', () => {
    render(
      <TarjetaSalidaPublicada
        salida={{
          ...salidaBase,
          horaSalida: '08:00',
          horaRegreso: '16:00',
          inclusiones: ['Transporte en lancha', 'Almuerzo típico', 'Careteo'],
        }}
      />,
    );

    expect(screen.getByText('Pasadía Islas del Rosario')).toBeDefined();
    expect(screen.getByText('Cartagena')).toBeDefined();
    expect(screen.getByText('Pasadía')).toBeDefined();

    // Chip de cupos con formato de urgencia
    const chipCupos = screen.getByTestId('chip-cupos-salida');
    expect(chipCupos.textContent).toContain('quedan 4');

    // Horario
    expect(screen.getByText('Salida: 08:00 · Regreso: 16:00')).toBeDefined();

    // Inclusiones
    expect(screen.getByText('Transporte en lancha')).toBeDefined();

    // Tarifa venta
    const tarifa = screen.getByTestId('tarifa-venta');
    expect(tarifa.textContent).toContain('180.000');

    // Botón de cotizar con enlace
    const btnCotizar = screen.getByTestId('btn-cotizar-salida');
    expect(btnCotizar.getAttribute('href')).toContain(
      '/cotizador?paqueteId=paq-1&fecha=2026-10-03',
    );
  });

  it('2. Muestra «Consultar» cuando el precio es cero o la presentación indica CONSULTAR', () => {
    render(
      <TarjetaSalidaPublicada
        salida={{
          ...salidaBase,
          desde: { unidades: '0', moneda: 'COP' },
          presentacion: {
            estado: 'CONSULTAR',
            venta: null,
            listaTachada: null,
            leyenda: null,
            promoVigente: false,
          },
        }}
      />,
    );

    const consultar = screen.getByTestId('tarifa-consultar');
    expect(consultar.textContent).toBe('Consultar');
  });

  it('3. Muestra listaTachada y leyenda «promo vencida» según presentacion de la API (T-051)', () => {
    render(
      <TarjetaSalidaPublicada
        salida={{
          ...salidaBase,
          desde: { unidades: '220000', moneda: 'COP' },
          presentacion: {
            estado: 'PROMO_VENCIDA',
            venta: { unidades: '220000', moneda: 'COP' },
            listaTachada: { unidades: '180000', moneda: 'COP' },
            leyenda: 'PROMO_VENCIDA',
            promoVigente: false,
          },
        }}
      />,
    );

    const tachado = screen.getByTestId('tarifa-lista-tachada');
    expect(tachado.textContent).toContain('180.000');

    const insigniaVencida = screen.getByTestId('insignia-promo-vencida');
    expect(insigniaVencida.textContent).toBe('Promo vencida');
  });

  it('4. Muestra múltiples monedas con desdePorMoneda', () => {
    render(
      <TarjetaSalidaPublicada
        salida={{
          ...salidaBase,
          desde: { unidades: '180000', moneda: 'COP' },
          desdePorMoneda: [
            { unidades: '180000', moneda: 'COP' },
            { unidades: '45', moneda: 'USD' },
          ],
        }}
      />,
    );

    const multimoneda = screen.getByTestId('tarifa-desde-por-moneda');
    expect(multimoneda.textContent).toContain('US$');
  });
});
