import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ModalEnviarCotizacion } from './modal-enviar-cotizacion';
import type { CotizacionResumen, Mensaje } from '@viajapro/contracts';
import { inboxApi } from '../../lib/inbox-api';
import * as cotizacionesApi from '../../lib/cotizaciones-api';

const cotizacionesEjemplo: CotizacionResumen[] = [
  {
    id: '00000000-0004-4000-8000-000000000001',
    version: 1,
    titulo: 'Escapada Caribe Cancún',
    precioVenta: {
      unidades: '5400000', // 5.400.000 COP (unidad mínima COP = peso)
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
      unidades: '18500000', // 18.500.000 COP
      moneda: 'COP',
    },
    vigenteHasta: null,
    enviadaEn: null,
  },
];

const mensajeEnviado: Mensaje = {
  id: '00000000-0000-4000-a000-000000000098',
  conversacionId: '00000000-0000-4000-a000-000000000001',
  direccion: 'SALIENTE',
  tipo: 'TEXTO',
  texto: 'Cotización enviada',
  adjuntos: [],
  estado: 'ENTREGADO',
  motivoFallo: null,
  autorId: '00000000-0000-4000-a000-000000000001',
  autorNombre: 'Asesor',
  ocurridoEn: '2026-11-20T12:00:00.000Z',
  cotizacionId: cotizacionesEjemplo[0]!.id,
};

describe('ModalEnviarCotizacion (T-074)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  function montar(extra: Partial<React.ComponentProps<typeof ModalEnviarCotizacion>> = {}) {
    return render(
      <ModalEnviarCotizacion
        conversacionId="00000000-0000-4000-a000-000000000001"
        contactoNombre="Laura Gómez"
        contactoTelefono="+573109876543"
        ventanaAbierta={true}
        cotizaciones={cotizacionesEjemplo}
        onCerrar={vi.fn()}
        onCotizacionEnviada={vi.fn()}
        {...extra}
      />,
    );
  }

  // T-347: la cotización solo pasa a ENVIADA cuando el envío por el canal salió.
  it('marca la cotización ENVIADA solo DESPUÉS de que el envío por el canal salió', async () => {
    const orden: string[] = [];
    vi.spyOn(inboxApi, 'enviarCotizacion').mockImplementation(() => {
      orden.push('canal');
      return Promise.resolve(mensajeEnviado);
    });
    const estado = vi
      .spyOn(cotizacionesApi, 'cambiarEstadoCotizacionApi')
      .mockImplementation(() => {
        orden.push('estado');
        return Promise.resolve({} as never);
      });

    montar();
    fireEvent.click(screen.getByTestId('boton-confirmar-enviar-cotizacion'));

    await waitFor(() => expect(estado).toHaveBeenCalledTimes(1));
    expect(estado).toHaveBeenCalledWith(cotizacionesEjemplo[0]!.id, 'ENVIADA');
    expect(orden).toEqual(['canal', 'estado']);
  });

  it('si el envío por el canal FALLA, la cotización NO se marca ENVIADA (T-347)', async () => {
    vi.spyOn(inboxApi, 'enviarCotizacion').mockRejectedValue(
      new Error('VENTANA_CERRADA: La ventana de 24h está cerrada'),
    );
    const estado = vi.spyOn(cotizacionesApi, 'cambiarEstadoCotizacionApi');

    montar();
    fireEvent.click(screen.getByTestId('boton-confirmar-enviar-cotizacion'));

    await waitFor(() => expect(screen.getByTestId('alerta-error-envio-cotizacion')).toBeDefined());
    expect(estado).not.toHaveBeenCalled();
  });

  it('una cotización que ya salió antes no vuelve a pedir la transición a ENVIADA', async () => {
    vi.spyOn(inboxApi, 'enviarCotizacion').mockResolvedValue(mensajeEnviado);
    const estado = vi.spyOn(cotizacionesApi, 'cambiarEstadoCotizacionApi');

    montar({
      cotizaciones: [{ ...cotizacionesEjemplo[0]!, enviadaEn: '2026-11-19T10:00:00.000Z' }],
    });
    fireEvent.click(screen.getByTestId('boton-confirmar-enviar-cotizacion'));

    await waitFor(() => expect(screen.getByTestId('alerta-exito-envio-cotizacion')).toBeDefined());
    expect(estado).not.toHaveBeenCalled();
  });

  it('si el mensaje salió pero no se pudo marcar ENVIADA, lo dice sin esconder el envío', async () => {
    vi.spyOn(inboxApi, 'enviarCotizacion').mockResolvedValue(mensajeEnviado);
    vi.spyOn(cotizacionesApi, 'cambiarEstadoCotizacionApi').mockRejectedValue(new Error('409'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    montar();
    fireEvent.click(screen.getByTestId('boton-confirmar-enviar-cotizacion'));

    await waitFor(() => expect(screen.getByTestId('aviso-estado-cotizacion')).toBeDefined());
    expect(screen.getByTestId('alerta-exito-envio-cotizacion')).toBeDefined();
    expect(screen.getByTestId('aviso-estado-cotizacion').textContent).toContain(
      'sigue como Borrador',
    );
  });

  it('llega con la cotización elegida cuando viene de su detalle (cotizacionInicialId)', () => {
    montar({ cotizacionInicialId: cotizacionesEjemplo[1]!.id });
    const selector = screen.getByTestId<HTMLSelectElement>('selector-cotizacion-conversacion');
    expect(selector.value).toBe(cotizacionesEjemplo[1]!.id);
    expect(screen.getByTestId('vista-previa-texto-cotizacion').textContent).toContain(
      'Tour Europa Soñada',
    );
  });

  it('una cotización inicial que no está en la lista cae a la primera', () => {
    montar({ cotizacionInicialId: 'no-existe' });
    const selector = screen.getByTestId<HTMLSelectElement>('selector-cotizacion-conversacion');
    expect(selector.value).toBe(cotizacionesEjemplo[0]!.id);
  });

  it('la vista previa es un resumen honesto, con nota de que no lleva neto ni margen', () => {
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
    const vista = screen.getByTestId('vista-previa-texto-cotizacion');
    expect(vista.textContent).not.toContain('Propuesta de Viaje');
    expect(vista.textContent).toContain('v1');
    expect(vista.textContent).toContain('Vigente hasta: 30 nov 2026');
    expect(vista.textContent).toContain('sin neto ni margen');
  });

  it('no muestra vigencia rota cuando vigenteHasta es null', () => {
    render(
      <ModalEnviarCotizacion
        conversacionId="conv-123"
        contactoNombre={null}
        contactoTelefono="+573109876543"
        ventanaAbierta={true}
        cotizaciones={[cotizacionesEjemplo[1]!]}
        onCerrar={vi.fn()}
        onCotizacionEnviada={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('vigencia-cotizacion')).toBeNull();
    const vista = screen.getByTestId('vista-previa-texto-cotizacion');
    expect(vista.textContent).not.toMatch(/null|undefined|Vigente hasta/);
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
    vi.spyOn(cotizacionesApi, 'cambiarEstadoCotizacionApi').mockResolvedValue({} as never);
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
