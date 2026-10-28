import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { CotizacionGuardada, Contacto } from '@viajapro/contracts';
import { ModalEnviarWhatsAppCotizacion } from './modal-enviar-whatsapp-cotizacion';
import * as cotizacionesApi from '../../lib/cotizaciones-api';

describe('ModalEnviarWhatsAppCotizacion (T-107)', () => {
  const cotizacionPrueba: CotizacionGuardada = {
    id: '01932000-0000-7000-8000-000000000001',
    contactoId: '00000000-0002-4000-8000-000000000001',
    oportunidadId: null,
    titulo: 'Cotización San Andrés Todo Incluido',
    estado: 'BORRADOR',
    versionEnviada: null,
    enviadaEn: null,
    creadaEn: '2026-10-25T10:00:00.000Z',
    actualizadaEn: '2026-10-25T10:00:00.000Z',
    versiones: [
      {
        id: '01932000-0000-7000-8000-000000000011',
        numero: 1,
        creadaEn: '2026-10-25T10:00:00.000Z',
        paqueteId: '01932000-0000-7000-8000-000000000001',
        paqueteNombre: 'Escape Caribeño San Andrés',
        destino: 'San Andrés',
        noches: 4,
        fechaSalida: '2026-11-10',
        vigenciaId: '01932000-0000-7000-8000-000000000001',
        vigenciaDesde: '2026-11-01',
        vigenciaHasta: '2026-11-30',
        deSalidaProgramada: true,
        adultos: 2,
        ninos: 0,
        infantes: 0,
        acomodacion: 'DOBLE',
        lineas: [
          {
            tarifaId: '01932000-0000-7000-8000-000000000091',
            nombre: 'Adulto en acomodación DOBLE',
            unidad: 'POR_PERSONA',
            cubrePasajeros: 1,
            veces: 2,
            precioUnitario: { unidades: '2500000', moneda: 'COP' },
            total: { unidades: '5000000', moneda: 'COP' },
            masBarata: false,
            margen: { unidades: '750000', moneda: 'COP' },
          },
        ],
        venta: { unidades: '5000000', moneda: 'COP' },
        vigenteHasta: '2026-10-31',
        neto: { unidades: '4250000', moneda: 'COP' },
        margen: { unidades: '750000', moneda: 'COP' },
      },
      {
        id: '01932000-0000-7000-8000-000000000012',
        numero: 2,
        creadaEn: '2026-10-26T10:00:00.000Z',
        paqueteId: '01932000-0000-7000-8000-000000000001',
        paqueteNombre: 'Escape Caribeño San Andrés',
        destino: 'San Andrés',
        noches: 4,
        fechaSalida: '2026-11-15',
        vigenciaId: '01932000-0000-7000-8000-000000000001',
        vigenciaDesde: '2026-11-01',
        vigenciaHasta: '2026-11-30',
        deSalidaProgramada: true,
        adultos: 3,
        ninos: 0,
        infantes: 0,
        acomodacion: 'TRIPLE',
        lineas: [
          {
            tarifaId: '01932000-0000-7000-8000-000000000092',
            nombre: 'Adulto en acomodación TRIPLE',
            unidad: 'POR_PERSONA',
            cubrePasajeros: 1,
            veces: 3,
            precioUnitario: { unidades: '2300000', moneda: 'COP' },
            total: { unidades: '6900000', moneda: 'COP' },
            masBarata: false,
          },
        ],
        venta: { unidades: '6900000', moneda: 'COP' },
        vigenteHasta: '2026-11-05',
      },
    ],
  };

  const contactoPrueba: Contacto = {
    id: '00000000-0002-4000-8000-000000000001',
    nombre: 'Carolina Herrera',
    telefono: '+573105559876',
    correo: 'carolina@ejemplo.com',
    etiquetas: ['VIP'],
    preferencias: 'Ventana',
    consentimientos: ['TRANSACCIONAL'],
    creadoEn: '2026-10-01T00:00:00.000Z',
    ultimoContactoEn: null,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('no renderiza nada si abierto es false', () => {
    const { container } = render(
      <ModalEnviarWhatsAppCotizacion
        cotizacion={cotizacionPrueba}
        contacto={contactoPrueba}
        abierto={false}
        alCerrar={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renderiza la cabecera, destinatario y vista previa formateada al abrir', () => {
    render(
      <ModalEnviarWhatsAppCotizacion
        cotizacion={cotizacionPrueba}
        contacto={contactoPrueba}
        abierto={true}
        alCerrar={vi.fn()}
      />,
    );

    expect(screen.getByText(/Enviar Cotización por WhatsApp/i)).toBeDefined();
    expect(screen.getByText('Carolina Herrera')).toBeDefined();
    expect(screen.getByDisplayValue('+573105559876')).toBeDefined();

    // Vista previa
    const vistaPrevia = screen.getByTestId('vista-previa-mensaje-whatsapp');
    expect(vistaPrevia.textContent).toContain('ESCAPE CARIBEÑO SAN ANDRÉS');
    expect(vistaPrevia.textContent).toContain('TOTAL VENTA:* *$ 6.900.000*'); // Versión 2 por defecto al ser la última

    // Regla R10: Cero leak de netos
    expect(vistaPrevia.textContent).not.toContain('4250000');
    expect(vistaPrevia.textContent).not.toContain('750000');
    expect(vistaPrevia.textContent?.toLowerCase()).not.toContain('neto');
    expect(vistaPrevia.textContent?.toLowerCase()).not.toContain('margen');
  });

  it('permite cambiar entre versiones y actualiza la vista previa reactivamente', () => {
    render(
      <ModalEnviarWhatsAppCotizacion
        cotizacion={cotizacionPrueba}
        contacto={contactoPrueba}
        versionInicial={2}
        abierto={true}
        alCerrar={vi.fn()}
      />,
    );

    // Inicialmente v2: $ 6.900.000
    const vistaPrevia = screen.getByTestId('vista-previa-mensaje-whatsapp');
    expect(vistaPrevia.textContent).toContain('6.900.000');

    // Cambiar a Versión 1
    const botonV1 = screen.getByRole('button', { name: /Versión 1/i });
    fireEvent.click(botonV1);

    expect(vistaPrevia.textContent).toContain('5.000.000');
    expect(vistaPrevia.textContent).toContain('Versión 1');
  });

  it('copia el mensaje al portapapeles al hacer clic en Copiar texto', () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: mockWriteText,
      },
      configurable: true,
      writable: true,
    });

    render(
      <ModalEnviarWhatsAppCotizacion
        cotizacion={cotizacionPrueba}
        contacto={contactoPrueba}
        abierto={true}
        alCerrar={vi.fn()}
      />,
    );

    const btnCopiar = screen.getByRole('button', { name: /Copiar texto/i });
    fireEvent.click(btnCopiar);

    expect(mockWriteText).toHaveBeenCalled();
    const textoCopiado = mockWriteText.mock.calls[0]?.[0] as string;
    expect(textoCopiado).toContain('¡Hola, Carolina Herrera!');
    expect(textoCopiado).toContain('ESCAPE CARIBEÑO SAN ANDRÉS');
  });

  it('marca como enviada llamando a la API y notifica al padre con alEnviarExitoso', async () => {
    const alEnviarExitoso = vi.fn();
    const alCerrar = vi.fn();
    const actualizadaMock: CotizacionGuardada = {
      ...cotizacionPrueba,
      estado: 'ENVIADA',
      versionEnviada: 2,
    };

    vi.spyOn(cotizacionesApi, 'cambiarEstadoCotizacionApi').mockResolvedValue(actualizadaMock);

    render(
      <ModalEnviarWhatsAppCotizacion
        cotizacion={cotizacionPrueba}
        contacto={contactoPrueba}
        abierto={true}
        alCerrar={alCerrar}
        alEnviarExitoso={alEnviarExitoso}
      />,
    );

    const btnSoloMarcar = screen.getByTestId('btn-solo-marcar-enviada');
    fireEvent.click(btnSoloMarcar);

    await waitFor(() => {
      expect(cotizacionesApi.cambiarEstadoCotizacionApi).toHaveBeenCalledWith(
        cotizacionPrueba.id,
        'ENVIADA',
      );
      expect(alEnviarExitoso).toHaveBeenCalledWith(actualizadaMock);
    });
  });

  it('abre enlace wa.me y marca como enviada al hacer clic en Abrir y Enviar por WhatsApp', () => {
    const mockWindowOpen = vi.fn();
    vi.spyOn(window, 'open').mockImplementation(mockWindowOpen);

    const alEnviarExitoso = vi.fn();
    vi.spyOn(cotizacionesApi, 'cambiarEstadoCotizacionApi').mockResolvedValue({
      ...cotizacionPrueba,
      estado: 'ENVIADA',
    });

    render(
      <ModalEnviarWhatsAppCotizacion
        cotizacion={cotizacionPrueba}
        contacto={contactoPrueba}
        abierto={true}
        alCerrar={vi.fn()}
        alEnviarExitoso={alEnviarExitoso}
      />,
    );

    const btnAbrirWhatsApp = screen.getByTestId('btn-abrir-whatsapp-directo');
    fireEvent.click(btnAbrirWhatsApp);

    expect(mockWindowOpen).toHaveBeenCalled();
    const urlLlamada = mockWindowOpen.mock.calls[0]?.[0] as string;
    expect(urlLlamada).toContain('https://wa.me/573105559876?text=');
  });
});
