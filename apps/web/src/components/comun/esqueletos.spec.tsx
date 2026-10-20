import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  AvisoErrorAccionable,
  EsqueletoConversacion,
  EsqueletoKanban,
  EsqueletoGridTarjetas,
  EsqueletoTabla,
  EsqueletoExpediente,
  EsqueletoReportes,
} from './esqueletos';
import type { MensajeErrorDetallado } from '../../lib/estados-ui-logica';

describe('Componentes de Estado y Accesibilidad (0c.25 & 0c.31)', () => {
  const errorMock: MensajeErrorDetallado = {
    codigo: 'ERROR_CONEXION_RED',
    titulo: 'Fallo de conexión con el servidor',
    quePaso: 'No se pudo contactar con el backend de ViajaPro.',
    queHacer: 'Verifique su conexión a internet o reintente en unos instantes.',
    esReintentable: true,
  };

  describe('AvisoErrorAccionable', () => {
    it('expone role="alert" y aria-live="assertive"', () => {
      render(<AvisoErrorAccionable error={errorMock} />);

      const alerta = screen.getByRole('alert');
      expect(alerta).toBeDefined();
      expect(alerta.getAttribute('aria-live')).toBe('assertive');
    });

    it('enseña los campos informativos qué pasó y qué hacer', () => {
      render(<AvisoErrorAccionable error={errorMock} />);

      expect(screen.getByText('Fallo de conexión con el servidor')).toBeDefined();
      expect(screen.getByText(/No se pudo contactar con el backend/)).toBeDefined();
      expect(screen.getByText(/Verifique su conexión a internet/)).toBeDefined();
    });

    it('el botón «Reintentar» mide >= 44px de clase táctil y llama a su callback', () => {
      const onReintentar = vi.fn();
      render(<AvisoErrorAccionable error={errorMock} onReintentar={onReintentar} />);

      const botonReintentar = screen.getByRole('button', { name: /reintentar/i });
      expect(botonReintentar).toBeDefined();

      // Touch target >= 44px
      expect(botonReintentar.className).toContain('min-h-[44px]');

      // Clic ejecuta el callback
      fireEvent.click(botonReintentar);
      expect(onReintentar).toHaveBeenCalledTimes(1);
    });

    it('no renderiza botón «Reintentar» si esReintentable es false', () => {
      const errorNoReintentable: MensajeErrorDetallado = {
        ...errorMock,
        esReintentable: false,
      };

      const onReintentar = vi.fn();
      render(<AvisoErrorAccionable error={errorNoReintentable} onReintentar={onReintentar} />);

      expect(screen.queryByRole('button', { name: /reintentar/i })).toBeNull();
    });

    it('renderiza acción secundaria si se suministra callback y etiqueta >= 44px', () => {
      const onSecundaria = vi.fn();
      render(
        <AvisoErrorAccionable
          error={errorMock}
          onAccionSecundaria={onSecundaria}
          etiquetaSecundaria="Ir a Configuración"
        />,
      );

      const botonSecundario = screen.getByRole('button', {
        name: /ir a configuración/i,
      });
      expect(botonSecundario).toBeDefined();
      expect(botonSecundario.className).toContain('min-h-[44px]');

      fireEvent.click(botonSecundario);
      expect(onSecundaria).toHaveBeenCalledTimes(1);
    });
  });

  describe('Esqueletos de Carga — Accesibilidad y Lectores de Pantalla', () => {
    it('EsqueletoConversacion tiene aria-busy="true" y texto para lector de pantalla', () => {
      const { container } = render(<EsqueletoConversacion />);
      const raiz = container.firstElementChild as HTMLElement;

      expect(raiz.getAttribute('aria-busy')).toBe('true');
      expect(raiz.getAttribute('aria-label')).toBe('Cargando conversación');
    });

    it('EsqueletoKanban tiene aria-busy="true" y texto para lector de pantalla', () => {
      const { container } = render(<EsqueletoKanban />);
      const raiz = container.firstElementChild as HTMLElement;

      expect(raiz.getAttribute('aria-busy')).toBe('true');
      expect(raiz.getAttribute('aria-label')).toBe('Cargando tablero kanban');
    });

    it('EsqueletoGridTarjetas tiene aria-busy="true", texto accesible y número configurable de tarjetas', () => {
      const { container } = render(<EsqueletoGridTarjetas cantidad={3} />);
      const raiz = container.firstElementChild as HTMLElement;

      expect(raiz.getAttribute('aria-busy')).toBe('true');
      expect(raiz.getAttribute('aria-label')).toBe('Cargando catálogo');
      expect(raiz.children.length).toBe(3);
    });

    it('EsqueletoTabla tiene aria-busy="true", texto accesible y número de filas configurable', () => {
      const { container } = render(<EsqueletoTabla filas={4} />);
      const raiz = container.firstElementChild as HTMLElement;

      expect(raiz.getAttribute('aria-busy')).toBe('true');
      expect(raiz.getAttribute('aria-label')).toBe('Cargando registros');
      expect(raiz.children.length).toBe(4);
    });

    it('EsqueletoExpediente tiene aria-busy="true" y texto accesible', () => {
      const { container } = render(<EsqueletoExpediente />);
      const raiz = container.firstElementChild as HTMLElement;

      expect(raiz.getAttribute('aria-busy')).toBe('true');
      expect(raiz.getAttribute('aria-label')).toBe('Cargando expedientes de viaje');
    });

    it('EsqueletoReportes tiene aria-busy="true" y texto accesible', () => {
      const { container } = render(<EsqueletoReportes />);
      const raiz = container.firstElementChild as HTMLElement;

      expect(raiz.getAttribute('aria-busy')).toBe('true');
      expect(raiz.getAttribute('aria-label')).toBe('Cargando reportes comerciales');
    });
  });
});
