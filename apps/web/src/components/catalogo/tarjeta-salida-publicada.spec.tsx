import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('con promoción vigente enseña la insignia de promo vigente con aro dorado (T-036)', () => {
    const salidaPromoVigente: SalidaPublicada = {
      ...SALIDA_BASE,
      presentacion: {
        estado: 'PROMO_VENGENTE' as any,
        venta: { unidades: '160000', moneda: 'COP' },
        listaTachada: { unidades: '180000', moneda: 'COP' },
        leyenda: null,
        promoVigente: true,
      },
    };

    render(<TarjetaSalidaPublicada salida={salidaPromoVigente} />);

    const badgePromo = screen.getByTestId('insignia-promo-vigente');
    expect(badgePromo).toBeDefined();
    expect(badgePromo.className).toContain('insignia-aro-dorado');
    expect(badgePromo.className).toContain('border-[#c9a24b]');
  });
});

describe('TarjetaSalidaPublicada — Identidad visual por tipo de excursión (T-036)', () => {
  it('1. Asigna color, icono y degradado para isla_beach_club', () => {
    render(
      <TarjetaSalidaPublicada
        salida={{
          ...SALIDA_BASE,
          paqueteNombre: 'Pasadía en Playa Blanca Barú Beach Club',
        }}
      />,
    );

    const tarjeta = screen.getByTestId('tarjeta-salida-publicada');
    expect(tarjeta.getAttribute('data-tipo-producto')).toBe('isla_beach_club');

    const cabecera = screen.getByTestId('cabecera-sin-foto');
    expect(cabecera.className).toContain('from-cyan-500');

    expect(screen.getByTestId('chip-tipo-producto-cabecera').textContent).toContain(
      'Isla & Beach Club',
    );
    expect(screen.getByTestId('icono-marca-agua-tipo')).toBeDefined();
  });

  it('2. Asigna color, icono y degradado para reserva_natural', () => {
    render(
      <TarjetaSalidaPublicada
        salida={{
          ...SALIDA_BASE,
          paqueteNombre: 'Senderismo en Reserva Natural Cañón del Combeima',
        }}
      />,
    );

    const tarjeta = screen.getByTestId('tarjeta-salida-publicada');
    expect(tarjeta.getAttribute('data-tipo-producto')).toBe('reserva_natural');

    const cabecera = screen.getByTestId('cabecera-sin-foto');
    expect(cabecera.className).toContain('from-emerald-600');
    expect(screen.getByTestId('chip-tipo-producto-cabecera').textContent).toContain(
      'Reserva Natural & Ecoturismo',
    );
  });

  it('3. Asigna color, icono y degradado para city_tour', () => {
    render(
      <TarjetaSalidaPublicada
        salida={{
          ...SALIDA_BASE,
          paqueteNombre: 'City Tour Centro Histórico y Castillos',
        }}
      />,
    );

    const tarjeta = screen.getByTestId('tarjeta-salida-publicada');
    expect(tarjeta.getAttribute('data-tipo-producto')).toBe('city_tour');

    const cabecera = screen.getByTestId('cabecera-sin-foto');
    expect(cabecera.className).toContain('from-amber-500');
    expect(screen.getByTestId('chip-tipo-producto-cabecera').textContent).toContain(
      'City Tour & Cultura',
    );
  });

  it('4. Asigna color, icono y degradado para aventura_nautica', () => {
    render(
      <TarjetaSalidaPublicada
        salida={{
          ...SALIDA_BASE,
          paqueteNombre: 'Tour de Snorkel y Careteo en Lancha Deportiva',
        }}
      />,
    );

    const tarjeta = screen.getByTestId('tarjeta-salida-publicada');
    expect(tarjeta.getAttribute('data-tipo-producto')).toBe('aventura_nautica');

    const cabecera = screen.getByTestId('cabecera-sin-foto');
    expect(cabecera.className).toContain('from-blue-500');
    expect(screen.getByTestId('chip-tipo-producto-cabecera').textContent).toContain(
      'Aventura & Náutica',
    );
  });

  it('5. Asigna color, icono y degradado para paquete_hotel', () => {
    render(
      <TarjetaSalidaPublicada
        salida={{
          ...SALIDA_BASE,
          paqueteNombre: 'Paquete Santa Marta 4 Noches con Hotel y Resort',
          noches: 4,
        }}
      />,
    );

    const tarjeta = screen.getByTestId('tarjeta-salida-publicada');
    expect(tarjeta.getAttribute('data-tipo-producto')).toBe('paquete_hotel');

    const cabecera = screen.getByTestId('cabecera-sin-foto');
    expect(cabecera.className).toContain('from-indigo-600');
    expect(screen.getByTestId('chip-tipo-producto-cabecera').textContent).toContain(
      'Paquete con Hotel',
    );
  });

  it('6. Soporta fotografía real con superposición protectora de contraste', () => {
    render(
      <TarjetaSalidaPublicada
        salida={{
          ...SALIDA_BASE,
          fotoUrl: 'https://images.unsplash.com/photo-1544644181-1484b3fdfc62',
        }}
      />,
    );

    const cabeceraFoto = screen.getByTestId('cabecera-con-foto');
    expect(cabeceraFoto).toBeDefined();
    expect(cabeceraFoto.style.backgroundImage).toContain(
      'https://images.unsplash.com/photo-1544644181-1484b3fdfc62',
    );
    expect(screen.queryByTestId('cabecera-sin-foto')).toBeNull();
  });

  it('7. Renderiza la insignia de duración con aro dorado (#c9a24b)', () => {
    render(<TarjetaSalidaPublicada salida={SALIDA_BASE} />);

    const badgeDuracion = screen.getByTestId('insignia-duracion-salida');
    expect(badgeDuracion).toBeDefined();
    expect(badgeDuracion.className).toContain('border-[#c9a24b]');
    expect(badgeDuracion.textContent).toBe('Pasadía');
  });

  it('8. Renderiza botón de Ver ficha si se suministra el callback onVerFicha', () => {
    const handleVerFicha = vi.fn();
    render(<TarjetaSalidaPublicada salida={SALIDA_BASE} onVerFicha={handleVerFicha} />);

    const btnVerFicha = screen.getByTestId('btn-ver-ficha-salida');
    expect(btnVerFicha).toBeDefined();

    fireEvent.click(btnVerFicha);
    expect(handleVerFicha).toHaveBeenCalledTimes(1);
    expect(handleVerFicha).toHaveBeenCalledWith(SALIDA_BASE);
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
