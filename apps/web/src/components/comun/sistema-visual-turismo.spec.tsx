import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  BotonTurismo,
  TarjetaTurismo,
  InsigniaAroDorado,
  InsigniaPromo,
  InsigniaCuposVivos,
  ChipTipoProducto,
  inferirTipoProducto,
  IconoModulo,
  CONFIGURACION_MODULOS,
  type ModuloViajaPro,
} from './index';

describe('Sistema Visual de Turismo (T-032)', () => {
  describe('BotonTurismo', () => {
    it('renderiza con variante degradado mar y tamaño accesible >= 44px', () => {
      render(<BotonTurismo variante="mar">Cotizar Excursión</BotonTurismo>);
      const boton = screen.getByRole('button', { name: /Cotizar Excursión/i });
      expect(boton).toBeDefined();
      expect(boton.className).toContain('degradado-mar');
      expect(boton.className).toContain('min-h-[44px]');
    });

    it('renderiza variante atardecer y dorado', () => {
      const { rerender } = render(<BotonTurismo variante="atardecer">Comprar Ahora</BotonTurismo>);
      expect(screen.getByRole('button').className).toContain('degradado-atardecer');

      rerender(<BotonTurismo variante="dorado">Plan VIP</BotonTurismo>);
      expect(screen.getByRole('button').className).toContain('degradado-dorado');
    });

    it('muestra spinner accesible y deshabilita interacción en estado cargando', () => {
      const alClick = vi.fn();
      render(
        <BotonTurismo cargando={true} textoCarga="Guardando..." onClick={alClick}>
          Guardar
        </BotonTurismo>,
      );

      const boton = screen.getByRole('button', { name: /Guardando\.\.\./i });
      expect(boton).toBeDefined();
      expect(boton.getAttribute('aria-busy')).toBe('true');
      expect((boton as HTMLButtonElement).disabled).toBe(true);

      fireEvent.click(boton);
      expect(alClick).not.toHaveBeenCalled();
    });

    it('ejecuta onClick normalmente cuando no está deshabilitado', () => {
      const alClick = vi.fn();
      render(<BotonTurismo onClick={alClick}>Enviar WhatsApp</BotonTurismo>);
      fireEvent.click(screen.getByRole('button'));
      expect(alClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('TarjetaTurismo', () => {
    it('renderiza contenido con clase de elevación y estilos pulidos', () => {
      render(
        <TarjetaTurismo>
          <h2>Tour Islas del Rosario</h2>
        </TarjetaTurismo>,
      );

      const heading = screen.getByText('Tour Islas del Rosario');
      const tarjeta = heading.closest('div');
      expect(tarjeta).toBeDefined();
      expect(tarjeta?.className).toContain('tarjeta-turismo-hover');
      expect(tarjeta?.className).toContain('rounded-2xl');
    });

    it('soporta ribete dorado y fondo oceánico para productos premium', () => {
      const { container } = render(
        <TarjetaTurismo bordeDorado={true} fondoOceano={true}>
          <span>Plan Premium</span>
        </TarjetaTurismo>,
      );

      const el = container.firstChild as HTMLElement;
      expect(el.className).toContain('border-[#C9A24B]');
      expect(el.className).toContain('bg-[#0B1F3A]');
    });
  });

  describe('InsigniaAroDorado & InsigniaPromo', () => {
    it('renderiza insignia con aro dorado e icono de duración', () => {
      render(<InsigniaAroDorado icono="reloj">1 día</InsigniaAroDorado>);
      expect(screen.getByText('1 día')).toBeDefined();
      expect(screen.getByText('1 día').parentElement?.className).toContain('border-[#C9A24B]');
    });

    it('renderiza insignia de promoción con resalte amarillo caribeño', () => {
      render(<InsigniaPromo descuentoTexto="PROMO -20%">Hot Sale</InsigniaPromo>);
      expect(screen.getByText('PROMO -20%')).toBeDefined();
      expect(screen.getByText('Hot Sale')).toBeDefined();
      expect(screen.getByText('PROMO -20%').parentElement?.className).toContain('bg-[#FACC15]');
    });

    it('renderiza InsigniaCuposVivos con diferentes estados de disponibilidad', () => {
      const { rerender } = render(<InsigniaCuposVivos cupos={0} />);
      expect(screen.getByText('Agotado')).toBeDefined();

      rerender(<InsigniaCuposVivos cupos={1} />);
      expect(screen.getByText('¡Último cupo!')).toBeDefined();

      rerender(<InsigniaCuposVivos cupos={5} total={20} />);
      expect(screen.getByText('5 de 20 cupos')).toBeDefined();

      rerender(<InsigniaCuposVivos cupos={null} />);
      expect(screen.getByText('Cupos libres')).toBeDefined();
    });
  });

  describe('ChipTipoProducto & inferirTipoProducto', () => {
    it('infiere categorías de excursión a partir del título o etiquetas', () => {
      expect(inferirTipoProducto('Pasadía en Bora Bora Beach Club')).toBe('isla_beach_club');
      expect(inferirTipoProducto('Caminata Ecoturística en Manglares')).toBe('reserva_natural');
      expect(inferirTipoProducto('City Tour Centro Histórico en Chiva')).toBe('city_tour');
      expect(inferirTipoProducto('Alquiler de Lancha Deportiva y Snorkel')).toBe(
        'aventura_nautica',
      );
      expect(inferirTipoProducto('Paquete San Andrés 4 Noches con Hotel')).toBe('paquete_hotel');
      expect(inferirTipoProducto('Experiencia Gastronómica')).toBe('excursion_general');
    });

    it('renderiza el chip con la etiqueta e icono apropiados', () => {
      render(<ChipTipoProducto tipo="isla_beach_club" />);
      expect(screen.getByText('Isla & Beach Club')).toBeDefined();
    });

    it('infiere automáticamente cuando se pasa nombreReferencia', () => {
      render(<ChipTipoProducto nombreReferencia="Tour a la Reserva Isla Palma" />);
      expect(screen.getByText('Reserva Natural & Ecoturismo')).toBeDefined();
    });
  });

  describe('IconoModulo', () => {
    const modulos: ModuloViajaPro[] = [
      'bandeja',
      'pipeline',
      'cotizaciones',
      'catalogo',
      'contactos',
      'viajes',
      'reportes',
      'configuracion',
    ];

    it.each(modulos)('renderiza icono con círculo suave para el módulo: %s', (modulo) => {
      const { container } = render(<IconoModulo modulo={modulo} />);
      const config = CONFIGURACION_MODULOS[modulo];
      expect(container.firstChild).toBeDefined();
      expect((container.firstChild as HTMLElement).className).toContain(config.claseBgSuave);
    });
  });
});
