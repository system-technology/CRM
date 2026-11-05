import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ModalEnviarCotizacion, generarTextoWhatsAppCotizacion } from './modal-enviar-cotizacion';
import type { CotizacionResumen, Mensaje } from '@viajapro/contracts';
import { inboxApi } from '../../lib/inbox-api';

const cotizacionesEjemplo: CotizacionResumen[] = [
  {
    id: '00000000-0004-4000-8000-000000000001',
    version: 1,
    titulo: 'Escapada Caribe Cancún',
    precioVenta: {
      unidades: '540000000', // 5.400.000 COP
      moneda: 'COP',
    },
    vigenteHasta: '2026-11-30',
    enviadaEn: null,
  },
  {
    id: '00000000-0004-4000-8000-000000000002',
    version: 2,
    titulo: 'Tour Europa Soñada',
    precioVenta: {
      unidades: '1850000000', // 18.500.000 COP
      moneda: 'COP',
    },
    vigenteHasta: null,
    enviadaEn: null,
  },
];

describe('ModalEnviarCotizacion (T-074)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('formatea correctamente el texto estructurado para WhatsApp', () => {
    const texto = generarTextoWhatsAppCotizacion(
      cotizacionesEjemplo[0]!,
      'Carlos Pérez',
      '+573001234567',
    );

    expect(texto).toContain('✈️ *Propuesta de Viaje: Escapada Caribe Cancún (v1)*');
    expect(texto).toContain('👤 Para: Carlos Pérez');
    expect(texto).toContain('💵 Inversión total: $ 5.400.000 COP');
    expect(texto).toContain('📅 Vigencia de tarifa: Hasta 2026-11-30');
    expect(texto).toContain('📋 *Detalles de tu cotización:*');
  });

  it('renderiza la lista de cotizaciones y la vista previa formateada', () => {
    render(
      <ModalEnviarCotizacion
        conversacionId="conv-123"
        contactoNombre="Laura Gómez"
        contactoTelefono="+573109876543"
        ventanaAbierta={true}
        cotizaciones={cotizacionesEjemplo}
        onCerrar={vi.fn()}
        onCotizacionEnviada={vi.fn()}
      />,
    );

    expect(screen.getByText('Enviar cotización por WhatsApp')).toBeDefined();
    expect(screen.getAllByText(/Laura Gómez/).length).toBeGreaterThan(0);

    const selector = screen.getByTestId<HTMLSelectElement>('selector-cotizacion-conversacion');
    expect(selector.value).toBe(cotizacionesEjemplo[0]!.id);

    const vistaPrevia = screen.getByTestId('vista-previa-texto-cotizacion');
    expect(vistaPrevia.textContent).toContain('Escapada Caribe Cancún');
    expect(vistaPrevia.textContent).toContain('5.400.000 COP');
  });

  it('actualiza la vista previa al cambiar de cotización en el selector', () => {
    render(
      <ModalEnviarCotizacion
        conversacionId="conv-123"
        contactoNombre="Laura Gómez"
        contactoTelefono="+573109876543"
        ventanaAbierta={true}
        cotizaciones={cotizacionesEjemplo}
        onCerrar={vi.fn()}
        onCotizacionEnviada={vi.fn()}
      />,
    );

    const selector = screen.getByTestId('selector-cotizacion-conversacion');
    fireEvent.change(selector, { target: { value: cotizacionesEjemplo[1]!.id } });

    const vistaPrevia = screen.getByTestId('vista-previa-texto-cotizacion');
    expect(vistaPrevia.textContent).toContain('Tour Europa Soñada');
    expect(vistaPrevia.textContent).toContain('18.500.000 COP');
  });

  it('muestra la alerta de ventana de 24 horas cerrada cuando ventanaAbierta es false', () => {
    render(
      <ModalEnviarCotizacion
        conversacionId="conv-123"
        contactoNombre="Laura Gómez"
        contactoTelefono="+573109876543"
        ventanaAbierta={false}
        cotizaciones={cotizacionesEjemplo}
        onCerrar={vi.fn()}
        onCotizacionEnviada={vi.fn()}
      />,
    );

    expect(screen.getByTestId('alerta-ventana-cerrada-cotizacion')).toBeDefined();
    expect(screen.getByText(/Ventana de 24 horas cerrada/)).toBeDefined();
  });

  it('envía la cotización y transiciona por los estados inactivo -> enviando -> enviado', async () => {
    const mockMensaje: Mensaje = {
      id: '00000000-0000-4000-a000-000000000099',
      conversacionId: '00000000-0000-4000-a000-000000000001',
      direccion: 'SALIENTE',
      tipo: 'TEXTO',
      texto: 'Cotización enviada',
      adjuntos: [],
      estado: 'ENTREGADO',
      motivoFallo: null,
      autorId: '00000000-0000-4000-a000-000000000001',
      autorNombre: 'Asesor',
      ocurridoEn: new Date().toISOString(),
      cotizacionId: cotizacionesEjemplo[0]!.id,
    };

    const spyEnviar = vi.spyOn(inboxApi, 'enviarCotizacion').mockResolvedValue(mockMensaje);
    const onCotizacionEnviada = vi.fn();
    const onCerrar = vi.fn();

    render(
      <ModalEnviarCotizacion
        conversacionId="00000000-0000-4000-a000-000000000001"
        contactoNombre="Laura Gómez"
        contactoTelefono="+573109876543"
        ventanaAbierta={true}
        cotizaciones={cotizacionesEjemplo}
        onCerrar={onCerrar}
        onCotizacionEnviada={onCotizacionEnviada}
      />,
    );

    const botonEnviar = screen.getByTestId('boton-confirmar-enviar-cotizacion');
    expect(botonEnviar.textContent).toContain('Enviar por WhatsApp');

    fireEvent.click(botonEnviar);

    await waitFor(() => {
      expect(spyEnviar).toHaveBeenCalledWith('00000000-0000-4000-a000-000000000001', {
        cotizacionId: cotizacionesEjemplo[0]!.id,
        version: cotizacionesEjemplo[0]!.version,
      });
      expect(onCotizacionEnviada).toHaveBeenCalledWith(mockMensaje);
      expect(screen.getByTestId('alerta-exito-envio-cotizacion')).toBeDefined();
    });
  });

  it('maneja el estado fallido y permite reintentar el envío', async () => {
    vi.spyOn(inboxApi, 'enviarCotizacion').mockRejectedValueOnce(
      new Error('VENTANA_CERRADA: La ventana de 24h está cerrada'),
    );

    render(
      <ModalEnviarCotizacion
        conversacionId="conv-123"
        contactoNombre="Laura Gómez"
        contactoTelefono="+573109876543"
        ventanaAbierta={true}
        cotizaciones={cotizacionesEjemplo}
        onCerrar={vi.fn()}
        onCotizacionEnviada={vi.fn()}
      />,
    );

    const botonEnviar = screen.getByTestId('boton-confirmar-enviar-cotizacion');
    fireEvent.click(botonEnviar);

    await waitFor(() => {
      const alerta = screen.getByTestId('alerta-error-envio-cotizacion');
      expect(alerta).toBeDefined();
      expect(screen.getByText(/La ventana de servicio de 24 horas está cerrada/)).toBeDefined();
      expect(alerta.textContent).not.toContain('VENTANA_CERRADA');
      expect(botonEnviar.textContent).toContain('Reintentar envío');
    });
  });

  it('traduce CONSENTIMIENTO_REVOCADO a mensaje de Habeas Data sin código crudo (T-117)', async () => {
    vi.spyOn(inboxApi, 'enviarCotizacion').mockRejectedValueOnce({
      code: 'CONSENTIMIENTO_REVOCADO',
      message: 'El contacto revocó el consentimiento',
    });

    render(
      <ModalEnviarCotizacion
        conversacionId="conv-123"
        contactoNombre="Laura Gómez"
        contactoTelefono="+573109876543"
        ventanaAbierta={true}
        cotizaciones={cotizacionesEjemplo}
        onCerrar={vi.fn()}
        onCotizacionEnviada={vi.fn()}
      />,
    );

    const botonEnviar = screen.getByTestId('boton-confirmar-enviar-cotizacion');
    fireEvent.click(botonEnviar);

    await waitFor(() => {
      const alerta = screen.getByTestId('alerta-error-envio-cotizacion');
      expect(screen.getByText('Autorización de datos revocada')).toBeDefined();
      expect(screen.getByText(/Ley 1581/)).toBeDefined();
      expect(alerta.textContent).not.toContain('CONSENTIMIENTO_REVOCADO');
    });
  });

  it('traduce COTIZACION_DE_OTRO_CONTACTO explicando que pertenece a otro viajero (T-117)', async () => {
    vi.spyOn(inboxApi, 'enviarCotizacion').mockRejectedValueOnce({
      error: { code: 'COTIZACION_DE_OTRO_CONTACTO' },
    });

    render(
      <ModalEnviarCotizacion
        conversacionId="conv-123"
        contactoNombre="Laura Gómez"
        contactoTelefono="+573109876543"
        ventanaAbierta={true}
        cotizaciones={cotizacionesEjemplo}
        onCerrar={vi.fn()}
        onCotizacionEnviada={vi.fn()}
      />,
    );

    const botonEnviar = screen.getByTestId('boton-confirmar-enviar-cotizacion');
    fireEvent.click(botonEnviar);

    await waitFor(() => {
      const alerta = screen.getByTestId('alerta-error-envio-cotizacion');
      expect(screen.getByText('Cotización de otro contacto')).toBeDefined();
      expect(screen.getByText(/otro viajero/)).toBeDefined();
      expect(alerta.textContent).not.toContain('COTIZACION_DE_OTRO_CONTACTO');
    });
  });

  it('traduce código desconocido a mensaje amigable en es-CO sin mostrar código crudo (T-117)', async () => {
    vi.spyOn(inboxApi, 'enviarCotizacion').mockRejectedValueOnce({
      code: 'ERROR_SISTEMA_INTERNO_FATAL_999',
    });

    render(
      <ModalEnviarCotizacion
        conversacionId="conv-123"
        contactoNombre="Laura Gómez"
        contactoTelefono="+573109876543"
        ventanaAbierta={true}
        cotizaciones={cotizacionesEjemplo}
        onCerrar={vi.fn()}
        onCotizacionEnviada={vi.fn()}
      />,
    );

    const botonEnviar = screen.getByTestId('boton-confirmar-enviar-cotizacion');
    fireEvent.click(botonEnviar);

    await waitFor(() => {
      const alerta = screen.getByTestId('alerta-error-envio-cotizacion');
      expect(screen.getByText('Inconveniente al enviar el mensaje')).toBeDefined();
      expect(screen.getByText(/Ocurrió un contratiempo/)).toBeDefined();
      expect(alerta.textContent).not.toContain('ERROR_SISTEMA_INTERNO_FATAL_999');
    });
  });

  it('cumple con área táctil accesible (mínimo 44px de altura) para 375 px móvil', () => {
    render(
      <ModalEnviarCotizacion
        conversacionId="conv-123"
        contactoNombre="Laura Gómez"
        contactoTelefono="+573109876543"
        ventanaAbierta={true}
        cotizaciones={cotizacionesEjemplo}
        onCerrar={vi.fn()}
        onCotizacionEnviada={vi.fn()}
      />,
    );

    const botonEnviar = screen.getByTestId('boton-confirmar-enviar-cotizacion');
    expect(botonEnviar.className).toContain('min-h-[44px]');
  });
});
