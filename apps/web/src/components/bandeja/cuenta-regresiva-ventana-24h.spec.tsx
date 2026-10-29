import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  InsigniaCuentaRegresiva24h,
  BannerAvisoVentana24h,
  CompositorVentanaCerrada24h,
} from './cuenta-regresiva-ventana-24h';
import { calcularCuentaRegresivaVentana24h } from '../../lib/ventana-24h';

describe('CuentaRegresivaVentana24h componentes — T-113', () => {
  const AHORA = new Date('2026-10-29T12:00:00.000Z').getTime();
  const reloj = () => AHORA;

  it('muestra la insignia en verde con horas y minutos cuando la ventana tiene más de 2 h', () => {
    const estado = calcularCuentaRegresivaVentana24h(
      { expiraEn: new Date(AHORA + (6 * 60 + 15) * 60_000).toISOString() },
      reloj,
    );

    render(<InsigniaCuentaRegresiva24h estado={estado} />);

    const insignia = screen.getByTestId('insignia-ventana-24h');
    expect(insignia.getAttribute('data-nivel')).toBe('abierta');
    expect(insignia.textContent).toContain('6 h 15 min');
  });

  it('muestra la insignia y el banner en ámbar cuando restan menos de 2 h', () => {
    const estado = calcularCuentaRegresivaVentana24h(
      { expiraEn: new Date(AHORA + 85 * 60_000).toISOString() },
      reloj,
    );
    const onAbrirPlantillas = vi.fn();

    render(
      <>
        <InsigniaCuentaRegresiva24h estado={estado} />
        <BannerAvisoVentana24h estado={estado} onAbrirPlantillas={onAbrirPlantillas} />
      </>,
    );

    expect(screen.getByTestId('insignia-ventana-24h').getAttribute('data-nivel')).toBe('ambar');
    expect(screen.getByTestId('banner-ventana-ambar').textContent).toContain('1 h 25 min');

    fireEvent.click(screen.getByText('Ver plantillas'));
    expect(onAbrirPlantillas).toHaveBeenCalledTimes(1);
  });

  it('cuando está cerrada y hay plantilla aprobada, muestra la explicación y habilita el botón de reapertura', () => {
    const estado = calcularCuentaRegresivaVentana24h(
      { expiraEn: new Date(AHORA - 60_000).toISOString() },
      reloj,
    );
    const onAbrirPlantillas = vi.fn();

    render(
      <CompositorVentanaCerrada24h
        estado={estado}
        plantillas={[{ id: 'pl-1', nombre: 'seguimiento_cotizacion_v1', estado: 'APROBADA' }]}
        onAbrirPlantillas={onAbrirPlantillas}
      />,
    );

    expect(screen.getByTestId('explicacion-ventana-cerrada').textContent).toContain(
      'más de 24 horas',
    );
    const btn = screen.getByTestId<HTMLButtonElement>('btn-plantilla-reapertura');
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onAbrirPlantillas).toHaveBeenCalledTimes(1);
  });

  it('cuando está cerrada y NO hay plantilla aprobada, deshabilita el botón de reapertura y explica por qué', () => {
    const estado = calcularCuentaRegresivaVentana24h(
      { expiraEn: new Date(AHORA - 60_000).toISOString() },
      reloj,
    );
    const onAbrirPlantillas = vi.fn();

    render(
      <CompositorVentanaCerrada24h
        estado={estado}
        plantillas={[
          { id: 'pl-pausada', nombre: 'promo_v1', estado: 'PAUSADA' },
          { id: 'pl-rechazada', nombre: 'promo_v2', estado: 'RECHAZADA' },
        ]}
        onAbrirPlantillas={onAbrirPlantillas}
      />,
    );

    const btn = screen.getByTestId<HTMLButtonElement>('btn-plantilla-reapertura');
    expect(btn.disabled).toBe(true);
    expect(screen.getByTestId('aviso-sin-plantilla-aprobada')).toBeDefined();
    fireEvent.click(btn);
    expect(onAbrirPlantillas).not.toHaveBeenCalled();
  });
});
