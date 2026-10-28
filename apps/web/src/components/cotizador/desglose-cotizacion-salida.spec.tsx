import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import type { CotizacionDeSalida } from '@viajapro/contracts';
import { DesgloseCotizacionSalida } from './desglose-cotizacion-salida';

describe('DesgloseCotizacionSalida — Excursiones y Pasadías (Bloque 2)', () => {
  const cotizacionPasadiaCartagena: CotizacionDeSalida = {
    paqueteId: '01932000-0000-7000-8000-000000000010',
    paqueteNombre: 'Pasadía Islas del Rosario & Barú VIP',
    destino: 'Cartagena',
    noches: 0,
    fecha: '2026-10-15',
    vigenciaId: '01932000-0000-7000-8000-0000000000e1',
    vigenciaDesde: '2026-10-01',
    vigenciaHasta: '2026-10-31',
    deSalidaProgramada: true,
    pideComposicion: true,
    pasajeros: 2,
    adultos: 2,
    ninos: 0,
    infantes: 0,
    lineas: [
      {
        tarifaId: '01932000-0000-7000-8000-0000000000f1',
        nombre: 'Tarifa Regular Adulto',
        unidad: 'POR_PERSONA',
        cubrePasajeros: 1,
        precioUnitario: { unidades: '260000', moneda: 'COP' },
        veces: 2,
        total: { unidades: '520000', moneda: 'COP' },
        masBarata: false,
      },
    ],
    total: { unidades: '520000', moneda: 'COP' },
    alternativas: [
      {
        tarifaId: '01932000-0000-7000-8000-0000000000f2',
        nombre: 'Promo Pareja Pasadía',
        unidad: 'POR_GRUPO',
        cubrePasajeros: 2,
        precioUnitario: { unidades: '460000', moneda: 'COP' },
        veces: 1,
        total: { unidades: '460000', moneda: 'COP' },
        masBarata: true,
      },
    ],
    noAplicables: [],
    suplementos: [],
  };

  it('1. Renderiza distintivo de Excursión de 1 día (Pasadía) cuando noches es 0', () => {
    render(
      <DesgloseCotizacionSalida
        cotizacion={cotizacionPasadiaCartagena}
        copiado={false}
        alCopiarWhatsApp={vi.fn()}
      />,
    );

    expect(screen.getByText(/Excursión de 1 día \(Pasadía\)/i)).toBeDefined();
    expect(screen.getByText('Pasadía Islas del Rosario & Barú VIP')).toBeDefined();
  });

  it('2. Renderiza aviso obligatorio de impuesto de muelle no incluido en tours náuticos', () => {
    render(
      <DesgloseCotizacionSalida
        cotizacion={cotizacionPasadiaCartagena}
        copiado={false}
        alCopiarWhatsApp={vi.fn()}
      />,
    );

    const avisoMuelle = screen.getByTestId('aviso-impuesto-muelle');
    expect(avisoMuelle).toBeDefined();
    expect(avisoMuelle.textContent).toContain('Impuesto de muelle no incluido');
    expect(avisoMuelle.textContent).toContain('La Bodeguita');
  });

  it('3. NO renderiza aviso de muelle cuando el destino es de tierra firme', () => {
    const cotizacionEjeCafetero: CotizacionDeSalida = {
      ...cotizacionPasadiaCartagena,
      destino: 'Eje Cafetero',
      paqueteNombre: 'Pasadía Panaca y Café',
    };

    render(
      <DesgloseCotizacionSalida
        cotizacion={cotizacionEjeCafetero}
        copiado={false}
        alCopiarWhatsApp={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('aviso-impuesto-muelle')).toBeNull();
  });

  it('4. Muestra indicador de promo vigente disponible cuando alternativas tiene tarifa más económica', () => {
    render(
      <DesgloseCotizacionSalida
        cotizacion={cotizacionPasadiaCartagena}
        copiado={false}
        alCopiarWhatsApp={vi.fn()}
      />,
    );

    const badgePromo = screen.getByTestId('badge-promo-vigente');
    expect(badgePromo).toBeDefined();
    expect(badgePromo.textContent).toContain('Promo vigente disponible');
    expect(screen.getByText('Promo Pareja Pasadía')).toBeDefined();
    expect(screen.getByText('Opción más económica')).toBeDefined();
  });

  it('5. Botones de acción tienen altura táctil accesible para móvil (>= 44px)', () => {
    render(
      <DesgloseCotizacionSalida
        cotizacion={cotizacionPasadiaCartagena}
        copiado={false}
        alCopiarWhatsApp={vi.fn()}
        alGuardarCotizacion={vi.fn()}
      />,
    );

    const btnGuardar = screen.getByRole('button', { name: /guardar cotización/i });
    expect(btnGuardar).toBeDefined();
    expect(btnGuardar.className).toContain('min-h-[44px]');
  });
});

describe('DesgloseCotizacionSalida — cargos en destino (T-063)', () => {
  const base = {
    paqueteId: '01932000-0000-7000-8000-000000000010',
    paqueteNombre: 'Isla Palma',
    destino: 'Cartagena',
    noches: 0,
    pideComposicion: true,
    total: { unidades: '520000', moneda: 'COP' },
    lineas: [],
    alternativas: [],
    noAplicables: [],
    suplementos: [],
  } as unknown as CotizacionDeSalida;

  it('muestra los cargos aparte con «No incluido» y no los suma al total', () => {
    const conCargos: CotizacionDeSalida = {
      ...base,
      cargosEnDestino: [
        {
          concepto: 'Tasa portuaria',
          monto: { unidades: '30000', moneda: 'COP' },
          unidad: 'POR_PERSONA',
        },
        { concepto: 'Impuesto de muelle', monto: null, unidad: 'POR_GRUPO' },
      ],
    };
    render(
      <DesgloseCotizacionSalida
        cotizacion={conCargos}
        copiado={false}
        alCopiarWhatsApp={vi.fn()}
      />,
    );
    const bloque = screen.getByTestId('cargos-en-destino');
    expect(bloque.textContent).toContain('No incluido');
    expect(bloque.textContent).toContain('Tasa portuaria');
    expect(bloque.textContent).toContain('Monto por confirmar');
    // El total sigue siendo el de la API (520.000), sin los 30.000 del cargo.
    expect(screen.getAllByText(/520\.000/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/550\.000/)).toBeNull();
  });

  it('sin cargos no pinta el bloque', () => {
    render(
      <DesgloseCotizacionSalida cotizacion={base} copiado={false} alCopiarWhatsApp={vi.fn()} />,
    );
    expect(screen.queryByTestId('cargos-en-destino')).toBeNull();
  });

  it('muestra listaTachada y leyenda «promo vencida» en la línea cuando viene en presentacion (T-051)', () => {
    const cotizacionConPromoVencida: CotizacionDeSalida = {
      ...base,
      lineas: [
        {
          tarifaId: '01932000-0000-7000-8000-0000000000f1',
          nombre: 'Tarifa Regular Adulto',
          unidad: 'POR_PERSONA',
          cubrePasajeros: 1,
          precioUnitario: { unidades: '260000', moneda: 'COP' },
          veces: 2,
          total: { unidades: '520000', moneda: 'COP' },
          masBarata: false,
          presentacion: {
            estado: 'PROMO_VENCIDA',
            venta: { unidades: '260000', moneda: 'COP' },
            listaTachada: { unidades: '220000', moneda: 'COP' },
            leyenda: 'PROMO_VENCIDA',
            promoVigente: false,
          },
        },
      ],
    };

    render(
      <DesgloseCotizacionSalida
        cotizacion={cotizacionConPromoVencida}
        copiado={false}
        alCopiarWhatsApp={vi.fn()}
      />,
    );

    const tachado = screen.getByTestId('linea-lista-tachada');
    expect(tachado.textContent).toContain('220.000');

    const leyenda = screen.getByTestId('linea-promo-vencida');
    expect(leyenda.textContent).toBe('Promo vencida');
  });
});

describe('DesgloseCotizacionSalida — política promo_vencida (T-028)', () => {
  const baseCotizacion = {
    paqueteId: '01932000-0000-7000-8000-000000000010',
    paqueteNombre: 'Tour Islas del Rosario',
    destino: 'Cartagena',
    noches: 0,
    pideComposicion: true,
    total: { unidades: '250000', moneda: 'COP' },
    alternativas: [],
    noAplicables: [],
    suplementos: [],
  } as unknown as CotizacionDeSalida;

  it('con promo_vencida OCULTAR (sin listaTachada) muestra el precio sin tachón ni insignia', () => {
    const cotizacionOcultar: CotizacionDeSalida = {
      ...baseCotizacion,
      lineas: [
        {
          tarifaId: 'tarifa-1',
          nombre: 'Pasadía Regular',
          unidad: 'POR_PERSONA',
          cubrePasajeros: 1,
          veces: 1,
          precioUnitario: { unidades: '250000', moneda: 'COP' },
          total: { unidades: '250000', moneda: 'COP' },
          masBarata: true,
          presentacion: {
            estado: 'PROMO_VENCIDA',
            venta: { unidades: '250000', moneda: 'COP' },
            listaTachada: null,
            leyenda: null,
            promoVigente: false,
          },
        },
      ],
    };

    render(
      <DesgloseCotizacionSalida
        cotizacion={cotizacionOcultar}
        copiado={false}
        alCopiarWhatsApp={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('linea-lista-tachada')).toBeNull();
    expect(screen.queryByTestId('linea-promo-vencida')).toBeNull();
  });

  it('con promo_vencida TACHAR enseña el precio tachado y la insignia de promo vencida en la línea', () => {
    const cotizacionTachar: CotizacionDeSalida = {
      ...baseCotizacion,
      lineas: [
        {
          tarifaId: 'tarifa-1',
          nombre: 'Pasadía Regular',
          unidad: 'POR_PERSONA',
          cubrePasajeros: 1,
          veces: 1,
          precioUnitario: { unidades: '250000', moneda: 'COP' },
          total: { unidades: '250000', moneda: 'COP' },
          masBarata: true,
          presentacion: {
            estado: 'PROMO_VENCIDA',
            venta: { unidades: '250000', moneda: 'COP' },
            listaTachada: { unidades: '300000', moneda: 'COP' },
            leyenda: 'PROMO_VENCIDA',
            promoVigente: false,
          },
        },
      ],
    };

    render(
      <DesgloseCotizacionSalida
        cotizacion={cotizacionTachar}
        copiado={false}
        alCopiarWhatsApp={vi.fn()}
      />,
    );

    const tachado = screen.getByTestId('linea-lista-tachada');
    expect(tachado.textContent).toContain('300.000');
    expect(screen.getByTestId('linea-promo-vencida')).toBeDefined();
  });
});
