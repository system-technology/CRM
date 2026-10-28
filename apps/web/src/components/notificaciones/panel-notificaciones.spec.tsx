import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { PanelNotificaciones } from './panel-notificaciones';
import type { NotificacionWeb } from '../../lib/notificaciones-web';
import * as prefLib from '../../lib/preferencias-notificaciones';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const NOTIFICACIONES_PRUEBA: NotificacionWeb[] = [
  {
    id: 'notif-1',
    tipo: 'mensaje_nuevo',
    severidad: 'critica',
    titulo: 'Nuevo mensaje de WhatsApp',
    detalle: 'Has recibido un nuevo mensaje en la bandeja de WhatsApp.',
    href: '/bandeja/conv-1',
    creadaEn: '2026-10-28T12:00:00Z',
    leida: false,
    accionTexto: 'Responder',
  },
  {
    id: 'notif-2',
    tipo: 'seguimiento_vencido',
    severidad: 'critica',
    titulo: 'Seguimiento comercial vencido',
    detalle: 'Tienes una tarea programada (Llamada) que ha superado su fecha límite.',
    href: '/seguimientos',
    creadaEn: '2026-10-28T11:00:00Z',
    leida: false,
    accionTexto: 'Gestionar',
  },
  {
    id: 'notif-3',
    tipo: 'cotizacion_por_vencer',
    severidad: 'advertencia',
    titulo: 'Cotización próxima a vencer',
    detalle: 'La oferta vence en aproximadamente 18 hora(s). Revisa el itinerario con tu viajero.',
    href: '/cotizaciones/cot-1',
    creadaEn: '2026-10-28T10:00:00Z',
    leida: true,
    accionTexto: 'Ver Cotización',
  },
  {
    id: 'notif-4',
    tipo: 'alerta_operativa',
    severidad: 'informativa',
    titulo: 'Documentación Incompleta',
    detalle: 'Faltan pasaportes del grupo.',
    href: '/viajes?id=1',
    creadaEn: '2026-10-28T09:00:00Z',
    leida: true,
    accionTexto: 'Cargar Documentos',
  },
];

describe('Componente PanelNotificaciones (T-110)', () => {
  const alCerrarMock = vi.fn();
  const alMarcarLeidaMock = vi.fn();
  const alMarcarTodasLeidasMock = vi.fn();
  const alDescartarMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('no renderiza nada si abierto es false', () => {
    const { container } = render(
      <PanelNotificaciones
        abierto={false}
        alCerrar={alCerrarMock}
        notificaciones={NOTIFICACIONES_PRUEBA}
        alMarcarLeida={alMarcarLeidaMock}
        alMarcarTodasLeidas={alMarcarTodasLeidasMock}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renderiza la lista de notificaciones con títulos genéricos y sin PII (R10)', () => {
    render(
      <PanelNotificaciones
        abierto={true}
        alCerrar={alCerrarMock}
        notificaciones={NOTIFICACIONES_PRUEBA}
        alMarcarLeida={alMarcarLeidaMock}
        alMarcarTodasLeidas={alMarcarTodasLeidasMock}
      />,
    );

    expect(screen.getByText('Notificaciones y Alertas')).toBeDefined();
    expect(screen.getByText('2 pendiente(s) de atención')).toBeDefined();

    // Invariante R10: títulos genéricos presentes
    expect(screen.getByText('Nuevo mensaje de WhatsApp')).toBeDefined();
    expect(screen.getByText('Seguimiento comercial vencido')).toBeDefined();
    expect(screen.getByText('Cotización próxima a vencer')).toBeDefined();
  });

  it('permite alternar el panel de preferencias de aviso del asesor', () => {
    render(
      <PanelNotificaciones
        abierto={true}
        alCerrar={alCerrarMock}
        notificaciones={NOTIFICACIONES_PRUEBA}
        alMarcarLeida={alMarcarLeidaMock}
        alMarcarTodasLeidas={alMarcarTodasLeidasMock}
      />,
    );

    expect(screen.queryByTestId('seccion-preferencias-notificaciones')).toBeNull();

    // Abrir preferencias
    const botonAjustes = screen.getByTestId('boton-ajustes-notificaciones');
    fireEvent.click(botonAjustes);

    expect(screen.getByTestId('seccion-preferencias-notificaciones')).toBeDefined();
    expect(screen.getByText('Preferencias de Aviso por Asesor')).toBeDefined();
    expect(screen.getByText(/Cero PII en Títulos/i)).toBeDefined();
  });

  it('activa y desactiva el sonido y prueba la campana sintetizada', () => {
    const reproducirSpy = vi
      .spyOn(prefLib, 'reproducirSonidoNotificacion')
      .mockImplementation(() => {});

    render(
      <PanelNotificaciones
        abierto={true}
        alCerrar={alCerrarMock}
        notificaciones={NOTIFICACIONES_PRUEBA}
        alMarcarLeida={alMarcarLeidaMock}
        alMarcarTodasLeidas={alMarcarTodasLeidasMock}
      />,
    );

    fireEvent.click(screen.getByTestId('boton-ajustes-notificaciones'));

    const switchSonido = screen.getByTestId('switch-sonido-notificaciones');
    expect(switchSonido.getAttribute('aria-checked')).toBe('false');

    // Probar sonido
    const botonProbar = screen.getByTestId('boton-probar-sonido');
    fireEvent.click(botonProbar);
    expect(reproducirSpy).toHaveBeenCalledWith(true);

    // Alternar sonido a activado
    fireEvent.click(switchSonido);
    expect(switchSonido.getAttribute('aria-checked')).toBe('true');
  });

  it('gestiona la activación de notificaciones de navegador solicitando permiso', async () => {
    const permisoSpy = vi.spyOn(prefLib, 'solicitarPermisoNotificaciones').mockResolvedValue(true);

    render(
      <PanelNotificaciones
        abierto={true}
        alCerrar={alCerrarMock}
        notificaciones={NOTIFICACIONES_PRUEBA}
        alMarcarLeida={alMarcarLeidaMock}
        alMarcarTodasLeidas={alMarcarTodasLeidasMock}
      />,
    );

    fireEvent.click(screen.getByTestId('boton-ajustes-notificaciones'));

    const switchNav = screen.getByTestId('switch-navegador-notificaciones');
    expect(switchNav.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(switchNav);

    await waitFor(() => {
      expect(permisoSpy).toHaveBeenCalled();
      expect(switchNav.getAttribute('aria-checked')).toBe('true');
      expect(screen.getByTestId('mensaje-estado-permiso').textContent).toContain(
        'Notificaciones del navegador activadas',
      );
    });
  });

  it('filtra correctamente por categoría', () => {
    render(
      <PanelNotificaciones
        abierto={true}
        alCerrar={alCerrarMock}
        notificaciones={NOTIFICACIONES_PRUEBA}
        alMarcarLeida={alMarcarLeidaMock}
        alMarcarTodasLeidas={alMarcarTodasLeidasMock}
      />,
    );

    // Filtrar por WhatsApp
    fireEvent.click(screen.getByTestId('filtro-mensajes'));
    expect(screen.getByText('Nuevo mensaje de WhatsApp')).toBeDefined();
    expect(screen.queryByText('Seguimiento comercial vencido')).toBeNull();

    // Filtrar por Seguimientos
    fireEvent.click(screen.getByTestId('filtro-seguimientos'));
    expect(screen.queryByText('Nuevo mensaje de WhatsApp')).toBeNull();
    expect(screen.getByText('Seguimiento comercial vencido')).toBeDefined();

    // Volver a Todas
    fireEvent.click(screen.getByTestId('filtro-todas'));
    expect(screen.getByText('Nuevo mensaje de WhatsApp')).toBeDefined();
    expect(screen.getByText('Seguimiento comercial vencido')).toBeDefined();
  });

  it('permite marcar todas las notificaciones como leídas', () => {
    render(
      <PanelNotificaciones
        abierto={true}
        alCerrar={alCerrarMock}
        notificaciones={NOTIFICACIONES_PRUEBA}
        alMarcarLeida={alMarcarLeidaMock}
        alMarcarTodasLeidas={alMarcarTodasLeidasMock}
      />,
    );

    const botonMarcarTodas = screen.getByTestId('boton-marcar-todas-leidas');
    fireEvent.click(botonMarcarTodas);
    expect(alMarcarTodasLeidasMock).toHaveBeenCalledTimes(1);
  });

  it('ejecuta la acción de una notificación, la marca como leída y navega', () => {
    render(
      <PanelNotificaciones
        abierto={true}
        alCerrar={alCerrarMock}
        notificaciones={NOTIFICACIONES_PRUEBA}
        alMarcarLeida={alMarcarLeidaMock}
        alMarcarTodasLeidas={alMarcarTodasLeidasMock}
      />,
    );

    const botonAccion = screen.getByTestId('boton-accion-notif-1');
    fireEvent.click(botonAccion);

    expect(alMarcarLeidaMock).toHaveBeenCalledWith('notif-1');
    expect(alCerrarMock).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/bandeja/conv-1');
  });

  it('permite descartar una notificación individual', () => {
    render(
      <PanelNotificaciones
        abierto={true}
        alCerrar={alCerrarMock}
        notificaciones={NOTIFICACIONES_PRUEBA}
        alMarcarLeida={alMarcarLeidaMock}
        alMarcarTodasLeidas={alMarcarTodasLeidasMock}
        alDescartar={alDescartarMock}
      />,
    );

    const botonDescartar = screen.getByTestId('boton-descartar-notif-1');
    fireEvent.click(botonDescartar);

    expect(alDescartarMock).toHaveBeenCalledWith('notif-1');
  });

  it('se cierra al pulsar el botón cerrar o presionar la tecla Escape', () => {
    render(
      <PanelNotificaciones
        abierto={true}
        alCerrar={alCerrarMock}
        notificaciones={NOTIFICACIONES_PRUEBA}
        alMarcarLeida={alMarcarLeidaMock}
        alMarcarTodasLeidas={alMarcarTodasLeidasMock}
      />,
    );

    const botonCerrar = screen.getByTestId('boton-cerrar-panel-notificaciones');
    fireEvent.click(botonCerrar);
    expect(alCerrarMock).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(alCerrarMock).toHaveBeenCalledTimes(2);
  });
});
