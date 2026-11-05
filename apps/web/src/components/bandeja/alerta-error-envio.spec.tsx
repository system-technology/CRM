import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AlertaErrorEnvio } from './alerta-error-envio';
import { interpretarErrorDeEnvio } from '../../lib/errores-de-envio';

describe('AlertaErrorEnvio (T-117)', () => {
  it('renderiza la alerta con accesibilidad y textos amigables en es-CO', () => {
    const error = interpretarErrorDeEnvio({ code: 'VENTANA_CERRADA' });
    render(<AlertaErrorEnvio error={error} onDescartar={vi.fn()} />);

    const alerta = screen.getByRole('alert');
    expect(alerta).toBeDefined();
    expect(screen.getByText('Ventana de 24 horas cerrada')).toBeDefined();
    expect(screen.getByText(/La ventana de servicio de 24 horas está cerrada/)).toBeDefined();
    expect(screen.getByText(/Envía una plantilla aprobada/)).toBeDefined();

    // El código técnico crudo nunca debe aparecer en el DOM
    expect(alerta.textContent).not.toContain('VENTANA_CERRADA');
  });

  it('permite abrir plantillas directamente cuando el error es de ventana cerrada', () => {
    const onAbrirPlantillas = vi.fn();
    const error = interpretarErrorDeEnvio({ code: 'VENTANA_CERRADA' });

    render(<AlertaErrorEnvio error={error} onAbrirPlantillas={onAbrirPlantillas} />);

    const boton = screen.getByRole('button', { name: /Abrir plantillas/i });
    expect(boton).toBeDefined();
    fireEvent.click(boton);
    expect(onAbrirPlantillas).toHaveBeenCalledTimes(1);
  });

  it('permite recargar la conversación cuando el error es de concurrencia o idempotencia', () => {
    const onRecargar = vi.fn();
    const error = interpretarErrorDeEnvio({ code: 'CONVERSACION_MODIFICADA' });

    render(<AlertaErrorEnvio error={error} onRecargar={onRecargar} />);

    const boton = screen.getByRole('button', { name: /Recargar chat/i });
    expect(boton).toBeDefined();
    fireEvent.click(boton);
    expect(onRecargar).toHaveBeenCalledTimes(1);
  });

  it('permite reintentar el envío cuando el error es transitorio o de red', () => {
    const onReintentar = vi.fn();
    const error = interpretarErrorDeEnvio({ code: 'WHATSAPP_FALLO_TRANSITORIO' });

    render(<AlertaErrorEnvio error={error} onReintentar={onReintentar} />);

    const boton = screen.getByRole('button', { name: /Reintentar envío/i });
    expect(boton).toBeDefined();
    fireEvent.click(boton);
    expect(onReintentar).toHaveBeenCalledTimes(1);
  });

  it('permite descartar el aviso de error con el botón de cierre', () => {
    const onDescartar = vi.fn();
    const error = interpretarErrorDeEnvio({ code: 'CONSENTIMIENTO_REVOCADO' });

    render(<AlertaErrorEnvio error={error} onDescartar={onDescartar} />);

    const botonCerrar = screen.getByRole('button', { name: /Cerrar aviso de error/i });
    fireEvent.click(botonCerrar);
    expect(onDescartar).toHaveBeenCalledTimes(1);
  });

  it('maneja un código de error desconocido sin mostrarlo nunca al asesor', () => {
    const error = interpretarErrorDeEnvio({ code: 'CODIGO_CRITICO_INVENTADO_META_99' });

    render(<AlertaErrorEnvio error={error} />);

    const alerta = screen.getByRole('alert');
    expect(screen.getByText('Inconveniente al enviar el mensaje')).toBeDefined();
    expect(screen.getByText(/Ocurrió un contratiempo/)).toBeDefined();
    expect(alerta.textContent).not.toContain('CODIGO_CRITICO_INVENTADO_META_99');
  });
});
