import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FichaDetalleExcursion } from './ficha-detalle-excursion';
import type { ProductoCatalogoAgrupado } from '../../lib/catalogo-logica';

describe('FichaDetalleExcursion — T-018', () => {
  const productoEjemplo: ProductoCatalogoAgrupado = {
    paqueteId: 'pkg-rosario-01',
    nombre: 'Pasadía Islas del Rosario & Barú VIP',
    destino: 'Cartagena',
    noches: 0,
    dias: 1,
    tipoTurismo: 'PLAYA_NAUTICO',
    horario: '07:30 - 16:30',
    inclusiones: [
      'Lancha rápida deportiva',
      'Almuerzo típico caribeño',
      'Careteo y snorkel guiado',
    ],
    exclusiones: ['Impuesto de muelle', 'Gastos personales'],
    requiereImpuestoMuelle: true,
    precioDesde: { unidades: '250000', moneda: 'COP' },
    precioEtiqueta: 'Desde $ 250.000 por persona',
    tienePromo: true,
    desdeEsDeGrupo: false,
    salidas: [
      {
        vigenciaId: 'v-1',
        fecha: '2026-10-03',
        etiquetaFecha: 'sáb 3 oct',
        cupoTotal: 14,
        etiquetaCupo: '14 cupos',
        estadoCupo: 'DISPONIBLE',
        desde: { unidades: '250000', moneda: 'COP' },
        desdeEsDeGrupo: false,
      },
      {
        vigenciaId: 'v-2',
        fecha: '2026-10-04',
        etiquetaFecha: 'dom 4 oct',
        cupoTotal: 4,
        etiquetaCupo: 'quedan 4',
        estadoCupo: 'ULTIMOS_CUPOS',
        desde: { unidades: '250000', moneda: 'COP' },
        desdeEsDeGrupo: false,
      },
    ],
  };

  it('1. No renderiza nada si producto es null', () => {
    const { container } = render(<FichaDetalleExcursion producto={null} alCerrar={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('2. Renderiza modal con título, destino, horario e inclusiones', () => {
    render(<FichaDetalleExcursion producto={productoEjemplo} alCerrar={vi.fn()} />);

    expect(screen.getByTestId('modal-ficha-excursion')).toBeDefined();
    expect(screen.getByText('Pasadía Islas del Rosario & Barú VIP')).toBeDefined();
    expect(screen.getByText('07:30 - 16:30')).toBeDefined();
    expect(screen.getByText('Lancha rápida deportiva')).toBeDefined();
    expect(screen.getByText('Almuerzo típico caribeño')).toBeDefined();
  });

  it('3. Muestra aviso de impuesto de muelle no incluido', () => {
    render(<FichaDetalleExcursion producto={productoEjemplo} alCerrar={vi.fn()} />);

    expect(
      screen.getByText(/Tasa portuaria requerida al abordar en taquilla del muelle/i),
    ).toBeDefined();
  });

  it('4. Permite seleccionar una salida y actualiza el enlace de cotización', () => {
    render(<FichaDetalleExcursion producto={productoEjemplo} alCerrar={vi.fn()} />);

    const botonSalida2 = screen.getByRole('button', { name: /dom 4 oct/i });
    fireEvent.click(botonSalida2);

    const enlaceCotizar = screen.getByRole('link', { name: /cotizar fecha seleccionada/i });
    expect(enlaceCotizar.getAttribute('href')).toContain('fecha=2026-10-04');
  });

  it('5. Botón de cerrar ejecuta callback alCerrar', () => {
    const alCerrar = vi.fn();
    render(<FichaDetalleExcursion producto={productoEjemplo} alCerrar={alCerrar} />);

    const btnCerrar = screen.getByRole('button', { name: /cerrar ficha/i });
    fireEvent.click(btnCerrar);
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });
});
