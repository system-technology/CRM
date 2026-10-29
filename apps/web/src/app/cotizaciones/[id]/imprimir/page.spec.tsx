import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CotizacionGuardada, VersionDeCotizacion } from '@viajapro/contracts';
import PaginaImprimirCotizacion, { proyectarVersionParaVistaCliente } from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '01932000-0000-7000-8000-000000000077' }),
}));

describe('PaginaImprimirCotizacion (/cotizaciones/[id]/imprimir) — T-114', () => {
  const versionConCostosSensibles: VersionDeCotizacion = {
    id: '01932000-0000-7000-8000-000000000101',
    numero: 1,
    creadaEn: '2026-10-18T14:20:00.000Z',
    paqueteId: '01932000-0000-7000-8000-000000000001',
    paqueteNombre: 'San Andrés — 4 días / 3 noches, todo incluido',
    destino: 'San Andrés Islas, Colombia',
    noches: 3,
    fechaSalida: '2026-12-24',
    vigenciaId: '01932000-0000-7000-8000-000000000001',
    vigenciaDesde: '2026-12-01',
    vigenciaHasta: '2026-12-31',
    deSalidaProgramada: true,
    adultos: 2,
    ninos: 1,
    infantes: 0,
    acomodacion: 'TRIPLE',
    politica: {
      porcentaje: 28,
      base: 'SOBRE_EL_NETO',
      origenDeLaVenta: 'DERIVADA_DEL_NETO',
      redondeoVenta: 1000,
    },
    lineas: [
      {
        tarifaId: '01932000-0000-7000-8000-000000000011',
        nombre: 'Adulto en acomodación triple',
        unidad: 'POR_PERSONA',
        cubrePasajeros: 1,
        veces: 2,
        precioUnitario: { unidades: '2450000', moneda: 'COP' },
        total: { unidades: '4900000', moneda: 'COP' },
        masBarata: false,
      },
      {
        tarifaId: '01932000-0000-7000-8000-000000000012',
        nombre: 'Niño (2-11 años)',
        unidad: 'POR_PERSONA',
        cubrePasajeros: 1,
        veces: 1,
        precioUnitario: { unidades: '1650000', moneda: 'COP' },
        total: { unidades: '1650000', moneda: 'COP' },
        masBarata: false,
      },
    ],
    venta: { unidades: '6550000', moneda: 'COP' },
    neto: { unidades: '5117188', moneda: 'COP' },
    margen: { unidades: '1432812', moneda: 'COP' },
    vigenteHasta: '2026-11-15',
  };

  const cotizacionMock: CotizacionGuardada = {
    id: '01932000-0000-7000-8000-000000000077',
    contactoId: '00000000-0002-4000-8000-000000000001',
    oportunidadId: '01932000-0000-7000-8000-000000000001',
    titulo: 'Cotización San Andrés Fin de Año',
    estado: 'ENVIADA',
    versionEnviada: 1,
    enviadaEn: '2026-10-18T15:30:00.000Z',
    creadaEn: '2026-10-18T14:20:00.000Z',
    actualizadaEn: '2026-10-19T09:15:00.000Z',
    versiones: [versionConCostosSensibles],
  };

  it('proyectarVersionParaVistaCliente elimina neto, margen y politica del objeto de versión', () => {
    const proyectada = proyectarVersionParaVistaCliente(versionConCostosSensibles);

    expect('neto' in proyectada).toBe(false);
    expect('margen' in proyectada).toBe(false);
    expect('politica' in proyectada).toBe(false);
    expect(JSON.stringify(proyectada)).not.toContain('5117188');
    expect(JSON.stringify(proyectada)).not.toContain('1432812');
    expect(JSON.stringify(proyectada)).not.toContain('SOBRE_EL_NETO');
    expect(proyectada.venta.unidades).toBe('6550000');
  });

  it('renderiza la hoja A4 con marca de la agencia, desglose, vigencia y condiciones e invoca window.print()', () => {
    const printSpy = vi.fn();
    Object.defineProperty(window, 'print', {
      value: printSpy,
      writable: true,
      configurable: true,
    });

    render(<PaginaImprimirCotizacion cotizacionInicial={cotizacionMock} />);

    expect(screen.getByTestId('hoja-imprimible-a4')).toBeDefined();
    expect(screen.getByTestId('marca-agencia-cotizacion').textContent).toContain(
      'ViajaPro Aventura',
    );
    expect(screen.getByTestId('vigencia-cotizacion').textContent).toContain('Vigente hasta:');
    expect(screen.getByTestId('desglose-tarifas-cliente').textContent).toContain(
      'Adulto en acomodación triple',
    );
    expect(screen.getByTestId('total-venta-cliente').textContent).toContain('6.550.000');
    expect(screen.getByTestId('condiciones-cotizacion').textContent).toContain('Ley 679 de 2001');

    fireEvent.click(screen.getByTestId('btn-imprimir-cotizacion'));
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('GARANTÍA DE CONFIDENCIALIDAD (R10): la vista del cliente NUNCA expone costo neto, margen ni política comercial', () => {
    const { container } = render(<PaginaImprimirCotizacion cotizacionInicial={cotizacionMock} />);

    const html = container.innerHTML;
    const texto = container.textContent ?? '';

    // Verifica que sí están los precios de venta al público
    expect(texto).toContain('6.550.000');
    expect(texto).toContain('4.900.000');
    expect(texto).toContain('1.650.000');

    // Verifica que NO aparece ningún rastro del neto (5.117.188), margen (1.432.812) ni política (28%, SOBRE_EL_NETO)
    expect(html).not.toContain('5117188');
    expect(html).not.toContain('5.117.188');
    expect(html).not.toContain('1432812');
    expect(html).not.toContain('1.432.812');
    expect(html).not.toContain('SOBRE_EL_NETO');
    expect(html).not.toContain('DERIVADA_DEL_NETO');
    expect(texto).not.toMatch(/costo\s+neto/i);
    expect(texto).not.toMatch(/tarifa\s+neta/i);
    expect(texto).not.toMatch(/margen\s+bruto/i);
    expect(texto).not.toContain('28%');
    expect(texto).not.toContain('28 %');
  });
});
