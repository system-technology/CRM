import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TarjetaExcursionCatalogo } from './tarjeta-excursion-catalogo';
import type { ProductoCatalogoAgrupado } from '../../lib/catalogo-logica';

describe('TarjetaExcursionCatalogo - T-018 & T-036', () => {
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
      {
        vigenciaId: 'v-3',
        fecha: '2026-10-07',
        etiquetaFecha: 'mié 7 oct',
        cupoTotal: 0,
        etiquetaCupo: 'Agotado',
        estadoCupo: 'AGOTADO',
        desde: { unidades: '250000', moneda: 'COP' },
        desdeEsDeGrupo: false,
      },
    ],
  };

  it('1. Renderiza encabezado con tipo de tour, nombre, destino, duración y horario', () => {
    render(<TarjetaExcursionCatalogo producto={productoEjemplo} />);

    expect(screen.getByText('Pasadía Islas del Rosario & Barú VIP')).toBeDefined();
    expect(screen.getByText('Cartagena')).toBeDefined();
    expect(screen.getByText('1 día (Pasadía)')).toBeDefined();
    expect(screen.getByText(/Horario: 07:30 - 16:30/i)).toBeDefined();
    expect(screen.getByText('Isla & Beach Club')).toBeDefined();
  });

  it('2. Muestra chips de lo que incluye la excursión', () => {
    render(<TarjetaExcursionCatalogo producto={productoEjemplo} />);

    expect(screen.getByText('Lancha rápida deportiva')).toBeDefined();
    expect(screen.getByText('Almuerzo típico caribeño')).toBeDefined();
    expect(screen.getByText('Careteo y snorkel guiado')).toBeDefined();
  });

  it('3. Muestra aviso destacado de impuesto de muelle no incluido en tour de Cartagena', () => {
    render(<TarjetaExcursionCatalogo producto={productoEjemplo} />);

    const aviso = screen.getByTestId('aviso-impuesto-muelle-catalogo');
    expect(aviso).toBeDefined();
    expect(aviso.textContent).toContain('Impuesto de muelle no incluido');
  });

  it('4. Renderiza las próximas salidas como chips interactivos con sus cupos (disponible, últimos cupos, agotado)', () => {
    render(<TarjetaExcursionCatalogo producto={productoEjemplo} />);

    const chips = screen.getAllByTestId('chip-salida');
    expect(chips.length).toBe(3);

    expect(chips[0]!.textContent).toContain('14 cupos');
    expect(chips[1]!.textContent).toContain('quedan 4');
    expect(chips[2]!.textContent).toContain('Agotado');
  });

  it('5. Muestra badge de promo vigente y precio formateado', () => {
    render(<TarjetaExcursionCatalogo producto={productoEjemplo} />);

    expect(screen.getByTestId('badge-promo-catalogo')).toBeDefined();
    expect(screen.getByTestId('precio-producto-catalogo').textContent).toContain('250.000');
  });

  it('6. Muestra "Consultar" cuando el producto no tiene precio publicado (nunca $0)', () => {
    const productoSinPrecio: ProductoCatalogoAgrupado = {
      ...productoEjemplo,
      paqueteId: 'pkg-sin-precio',
      precioDesde: null,
      precioEtiqueta: 'Consultar',
    };

    render(<TarjetaExcursionCatalogo producto={productoSinPrecio} />);

    expect(screen.getByTestId('precio-producto-catalogo').textContent).toBe('Consultar');
  });

  it('7. Botón "Ver ficha" dispara alSeleccionar y botón "Cotizar" enlaza al cotizador con el paquete', () => {
    const onSeleccionar = vi.fn();
    render(<TarjetaExcursionCatalogo producto={productoEjemplo} alSeleccionar={onSeleccionar} />);

    const btnFicha = screen.getByRole('button', { name: /ver ficha/i });
    fireEvent.click(btnFicha);
    expect(onSeleccionar).toHaveBeenCalledWith(productoEjemplo);

    const enlaceCotizar = screen.getByRole('link', { name: /cotizar/i });
    expect(enlaceCotizar.getAttribute('href')).toContain('/cotizador?paqueteId=pkg-rosario-01');
  });

  it('8. Muestra precio de lista tachado y badge «Promo vencida» según la política de la agencia', () => {
    const productoPromoVencida: ProductoCatalogoAgrupado = {
      ...productoEjemplo,
      tienePromo: false,
      presentacion: {
        estado: 'PROMO_VENCIDA',
        venta: { unidades: '250000', moneda: 'COP' },
        listaTachada: { unidades: '320000', moneda: 'COP' },
        leyenda: 'PROMO_VENCIDA',
        promoVigente: false,
      },
    };

    render(<TarjetaExcursionCatalogo producto={productoPromoVencida} />);

    expect(screen.getByTestId('badge-promo-vencida')).toBeDefined();
    expect(screen.getByTestId('badge-promo-vencida').textContent).toContain('Promo vencida');
    const listaTachada = screen.getByTestId('precio-lista-tachada');
    expect(listaTachada).toBeDefined();
    expect(listaTachada.textContent).toContain('320.000');
  });

  it('9. Renderiza imagen fotográfica si el producto trae imagen en sus campos (T-036)', () => {
    const productoConFoto: ProductoCatalogoAgrupado = {
      ...productoEjemplo,
      imagen: '/_local/jd-tours/playa-sombrillas-isla.png',
    };

    render(<TarjetaExcursionCatalogo producto={productoConFoto} />);

    const img = screen.getByTestId('imagen-producto-catalogo');
    expect(img).toBeDefined();
    expect(img.getAttribute('src')).toBe('/_local/jd-tours/playa-sombrillas-isla.png');
  });

  it('10. Infiere tipos de producto correctamente y muestra degradado temático sin foto (T-036)', () => {
    const productoReserva: ProductoCatalogoAgrupado = {
      ...productoEjemplo,
      nombre: 'Parque Natural Tayrona & Senderismo',
      destino: 'Santa Marta',
      imagen: null,
    };

    render(<TarjetaExcursionCatalogo producto={productoReserva} />);
    expect(screen.getByText('Reserva Natural & Ecoturismo')).toBeDefined();
  });
});
