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
