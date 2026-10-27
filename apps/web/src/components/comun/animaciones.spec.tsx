import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ContenedorEscalonado,
  useMovimientoReducido,
  calcularRetrasoEscalonado,
  obtenerEstiloEscalonado,
  EsqueletoConBrillo,
  TarjetaTurismo,
} from './index';

function ComponentePruebaMovimiento() {
  const reducido = useMovimientoReducido();
  return <div data-testid="estado-movimiento">{reducido ? 'reducido' : 'normal'}</div>;
}

describe('Animaciones y Transiciones (T-035)', () => {
  let matchesReducedMotion = false;

  beforeEach(() => {
    matchesReducedMotion = false;

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: matchesReducedMotion,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  describe('calcularRetrasoEscalonado y obtenerEstiloEscalonado', () => {
    it('calcula retrasos incrementales bajo 300 ms', () => {
      expect(calcularRetrasoEscalonado(0)).toBe(0);
      expect(calcularRetrasoEscalonado(1)).toBe(30);
      expect(calcularRetrasoEscalonado(3)).toBe(90);
      expect(calcularRetrasoEscalonado(5)).toBe(150);
      // Tope máximo en 270 ms (< 300ms)
      expect(calcularRetrasoEscalonado(15)).toBe(270);
    });

    it('devuelve estilos con animationDelay cuando hay animación activa', () => {
      const estilo = obtenerEstiloEscalonado(2, false);
      expect(estilo.animationDelay).toBe('60ms');
    });

    it('devuelve objeto vacío cuando se prefiere movimiento reducido', () => {
      const estilo = obtenerEstiloEscalonado(2, true);
      expect(estilo).toEqual({});
    });
  });

  describe('useMovimientoReducido', () => {
    it('detecta estado normal por defecto', () => {
      render(<ComponentePruebaMovimiento />);
      expect(screen.getByTestId('estado-movimiento').textContent).toBe('normal');
    });

    it('detecta estado reducido cuando matchMedia coincide', () => {
      matchesReducedMotion = true;
      render(<ComponentePruebaMovimiento />);
      expect(screen.getByTestId('estado-movimiento').textContent).toBe('reducido');
    });
  });

  describe('ContenedorEscalonado', () => {
    it('aplica la clase escalonado-hijos por defecto cuando hay animación permitida', () => {
      render(
        <ContenedorEscalonado>
          <div>Tarjeta 1</div>
          <div>Tarjeta 2</div>
        </ContenedorEscalonado>,
      );

      const contenedor = screen.getByTestId('contenedor-escalonado');
      expect(contenedor.className).toContain('escalonado-hijos');
      expect(screen.getByText('Tarjeta 1')).toBeDefined();
      expect(screen.getByText('Tarjeta 2')).toBeDefined();
    });

    it('omite la clase escalonado-hijos cuando prefers-reduced-motion está activado', () => {
      matchesReducedMotion = true;
      render(
        <ContenedorEscalonado>
          <div>Item A</div>
        </ContenedorEscalonado>,
      );

      const contenedor = screen.getByTestId('contenedor-escalonado');
      expect(contenedor.className).not.toContain('escalonado-hijos');
    });

    it('permite renderizar como elemento semántico alternativo (ej: ul)', () => {
      render(
        <ContenedorEscalonado as="ul">
          <li>Elemento de lista</li>
        </ContenedorEscalonado>,
      );

      const lista = screen.getByRole('list');
      expect(lista.tagName).toBe('UL');
      expect(screen.getByText('Elemento de lista')).toBeDefined();
    });
  });

  describe('EsqueletoConBrillo y Brillo Shimmer', () => {
    it('renderiza el bloque de esqueleto con la clase esqueleto-brillo', () => {
      render(<EsqueletoConBrillo className="h-10 w-40" />);

      const esqueleto = screen.getByTestId('esqueleto-con-brillo');
      expect(esqueleto.className).toContain('esqueleto-brillo');
      expect(esqueleto.className).toContain('h-10');
      expect(esqueleto.className).toContain('w-40');
    });
  });

  describe('TarjetaTurismo y Elevación al Hover', () => {
    it('incorpora la clase tarjeta-turismo-hover para elevación suave', () => {
      render(
        <TarjetaTurismo data-testid="tarjeta-turismo">
          <p>Excursión VIP</p>
        </TarjetaTurismo>,
      );

      const tarjeta = screen.getByTestId('tarjeta-turismo');
      expect(tarjeta.className).toContain('tarjeta-turismo-hover');
    });
  });
});
