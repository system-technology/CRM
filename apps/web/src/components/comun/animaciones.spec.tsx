import React from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  obtenerClaseEscalonada,
  usePrefersReducedMotion,
  ShimmerBox,
  ContenedorEscalonado,
} from './animaciones';

describe('Utilidades de Animación y Movimiento Reducido (T-035)', () => {
  describe('obtenerClaseEscalonada', () => {
    it('asigna nivel 1 para el primer elemento (índice 0)', () => {
      expect(obtenerClaseEscalonada(0)).toBe('anim-entrada anim-retraso-1');
    });

    it('asigna el nivel correspondiente para índices intermedios', () => {
      expect(obtenerClaseEscalonada(2)).toBe('anim-entrada anim-retraso-3');
      expect(obtenerClaseEscalonada(4)).toBe('anim-entrada anim-retraso-5');
    });

    it('limita el retraso a un máximo de 6 niveles (máx 240ms) para listas largas', () => {
      expect(obtenerClaseEscalonada(5)).toBe('anim-entrada anim-retraso-6');
      expect(obtenerClaseEscalonada(10)).toBe('anim-entrada anim-retraso-6');
      expect(obtenerClaseEscalonada(99)).toBe('anim-entrada anim-retraso-6');
    });

    it('maneja índices negativos devolviendo anim-entrada base', () => {
      expect(obtenerClaseEscalonada(-1)).toBe('anim-entrada');
    });
  });

  describe('usePrefersReducedMotion', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function TestComponente() {
      const reduced = usePrefersReducedMotion();
      return <div data-testid="estado-reduced">{reduced ? 'reducido' : 'completo'}</div>;
    }

    it('devuelve false cuando el usuario no solicita movimiento reducido', () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockImplementation((query: string) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      );

      render(<TestComponente />);
      expect(screen.getByTestId('estado-reduced').textContent).toBe('completo');
    });

    it('devuelve true cuando el usuario tiene activado prefers-reduced-motion', () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockImplementation((query: string) => ({
          matches: query.includes('prefers-reduced-motion: reduce'),
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      );

      render(<TestComponente />);
      expect(screen.getByTestId('estado-reduced').textContent).toBe('reducido');
    });

    it('reacciona dinámicamente cuando el usuario cambia la configuración de movimiento', () => {
      let listener: ((e: MediaQueryListEvent) => void) | null = null;

      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockImplementation((query: string) => ({
          matches: false,
          media: query,
          onchange: null,
          addEventListener: vi.fn((event: string, cb: (e: MediaQueryListEvent) => void) => {
            if (event === 'change') listener = cb;
          }),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      );

      render(<TestComponente />);
      expect(screen.getByTestId('estado-reduced').textContent).toBe('completo');

      act(() => {
        if (listener) {
          listener({ matches: true } as MediaQueryListEvent);
        }
      });

      expect(screen.getByTestId('estado-reduced').textContent).toBe('reducido');
    });
  });

  describe('ShimmerBox (Caja con brillo)', () => {
    it('renderiza con aria-hidden="true" para no confundir a lectores de pantalla', () => {
      render(<ShimmerBox />);
      const box = screen.getByTestId('shimmer-box');
      expect(box.getAttribute('aria-hidden')).toBe('true');
      expect(box.className).toContain('esqueleto-brillo');
    });

    it('permite personalizar clases, dimensiones y bordes', () => {
      render(
        <ShimmerBox
          ancho="w-48"
          alto="h-8"
          redondeado="rounded-xl"
          className="custom-shimmer shadow-xs"
        />,
      );
      const box = screen.getByTestId('shimmer-box');
      expect(box.className).toContain('w-48');
      expect(box.className).toContain('h-8');
      expect(box.className).toContain('rounded-xl');
      expect(box.className).toContain('custom-shimmer');
    });
  });

  describe('ContenedorEscalonado', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('aplica clases de entrada escalonada a cada hijo en modo normal', () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockImplementation(() => ({
          matches: false,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      );

      render(
        <ContenedorEscalonado data-testid="contenedor">
          <div data-testid="item-0">Primer tarjeta</div>
          <div data-testid="item-1">Segunda tarjeta</div>
          <div data-testid="item-2">Tercera tarjeta</div>
        </ContenedorEscalonado>,
      );

      const item0 = screen.getByTestId('item-0');
      const item1 = screen.getByTestId('item-1');
      const item2 = screen.getByTestId('item-2');

      expect(item0.className).toContain('anim-entrada anim-retraso-1');
      expect(item1.className).toContain('anim-entrada anim-retraso-2');
      expect(item2.className).toContain('anim-entrada anim-retraso-3');
    });

    it('no inyecta clases anim-entrada cuando prefers-reduced-motion está activo', () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockImplementation((query: string) => ({
          matches: query.includes('prefers-reduced-motion: reduce'),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      );

      render(
        <ContenedorEscalonado data-testid="contenedor">
          <div data-testid="item-0" className="tarjeta-base">
            Tarjeta sin movimiento brusco
          </div>
        </ContenedorEscalonado>,
      );

      const item0 = screen.getByTestId('item-0');
      expect(item0.className).not.toContain('anim-entrada');
      expect(item0.className).toContain('tarjeta-base');
    });
  });
});
