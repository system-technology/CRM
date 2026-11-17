import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { PanelNotificaciones } from './panel-notificaciones';
import type { NotificacionWeb } from '../../lib/notificaciones-web';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const aviso: NotificacionWeb = {
  id: 'aviso-1',
  tipo: 'aviso_plazo',
  severidad: 'critica',
  titulo: 'Time limit vencido',
  detalle: 'Time limit del file 1043: venció hace 2 horas',
  href: '/viajes?id=a1',
  creadaEn: '2026-10-28T12:00:00Z',
  leida: false,
  accionTexto: 'Ver reserva',
};

describe('PanelNotificaciones — avisos de plazo (T-255)', () => {
  const props = {
    abierto: true,
    alCerrar: vi.fn(),
    alMarcarLeida: vi.fn(),
    alMarcarTodasLeidas: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());

  it('al abrir el aviso lo marca leído y navega a Reservas', () => {
    render(<PanelNotificaciones {...props} notificaciones={[aviso]} />);
    fireEvent.click(screen.getByTestId('boton-accion-aviso-1'));
    expect(props.alMarcarLeida).toHaveBeenCalledWith('aviso-1');
    expect(mockPush).toHaveBeenCalledWith('/viajes?id=a1');
  });

  it('el botón «Marcar leída» no navega', () => {
    render(<PanelNotificaciones {...props} notificaciones={[aviso]} />);
    fireEvent.click(screen.getByTestId('boton-descartar-aviso-1'));
    expect(props.alMarcarLeida).toHaveBeenCalledWith('aviso-1');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('un aviso ya leído no ofrece marcar de nuevo', () => {
    render(<PanelNotificaciones {...props} notificaciones={[{ ...aviso, leida: true }]} />);
    expect(screen.queryByTestId('boton-descartar-aviso-1')).toBeNull();
  });

  it('muestra esqueleto al cargar y no el estado vacío', () => {
    render(<PanelNotificaciones {...props} notificaciones={[]} estadoAvisos="cargando" />);
    expect(screen.getByTestId('avisos-cargando')).toBeTruthy();
    expect(screen.queryByTestId('estado-sin-notificaciones')).toBeNull();
  });

  it('muestra el error con qué hacer y reintenta', () => {
    const reintentar = vi.fn();
    render(
      <PanelNotificaciones
        {...props}
        notificaciones={[]}
        estadoAvisos="error"
        alReintentarAvisos={reintentar}
      />,
    );
    expect(screen.getByTestId('avisos-error').textContent).toContain('reintenta');
    fireEvent.click(screen.getByTestId('boton-reintentar-avisos'));
    expect(reintentar).toHaveBeenCalled();
  });

  it('estado vacío cuando no hay avisos', () => {
    render(<PanelNotificaciones {...props} notificaciones={[]} estadoAvisos="listo" />);
    expect(screen.getByTestId('estado-sin-notificaciones')).toBeTruthy();
  });
});
