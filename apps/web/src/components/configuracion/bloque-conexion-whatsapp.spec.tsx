import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BloqueConexionWhatsapp } from './bloque-conexion-whatsapp';
import {
  DATOS_WHATSAPP_CONECTADO_DEFAULT,
  DATOS_WHATSAPP_DESCONECTADO_DEFAULT,
  PLANTILLAS_OFICIALES_AGENCIA,
} from '../../lib/whatsapp-conexion-logica';

describe('BloqueConexionWhatsapp (T-106)', () => {
  const mockWriteText = vi.fn().mockImplementation(() => Promise.resolve());

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: mockWriteText,
      },
      writable: true,
      configurable: true,
    });
  });

  it('renderiza la información del canal conectado de WhatsApp y la insignia T-106', () => {
    render(<BloqueConexionWhatsapp />);

    expect(screen.getByTestId('bloque-conexion-whatsapp')).toBeDefined();
    expect(screen.getByText('T-106')).toBeDefined();
    expect(screen.getByText('Canal Oficial de WhatsApp (Meta Cloud API)')).toBeDefined();
    expect(screen.getByText('Conexión Saludable')).toBeDefined();
    expect(screen.getByText(DATOS_WHATSAPP_CONECTADO_DEFAULT.numeroE164)).toBeDefined();
    expect(screen.getByText(DATOS_WHATSAPP_CONECTADO_DEFAULT.nombreVisible)).toBeDefined();
    expect(screen.getByText('Calidad Alta (Óptima)')).toBeDefined();
    expect(screen.getByText(/1.000 clientes únicos \/ 24h/)).toBeDefined();
    expect(
      screen.getByText(new RegExp(DATOS_WHATSAPP_CONECTADO_DEFAULT.phoneNumberId)),
    ).toBeDefined();
    expect(screen.getByText(new RegExp(DATOS_WHATSAPP_CONECTADO_DEFAULT.wabaId))).toBeDefined();
  });

  it('muestra la advertencia de cumplimiento de la Regla R6 (cero secretos en frontend)', () => {
    render(<BloqueConexionWhatsapp />);

    const calloutR6 = screen.getByText(/Regla R6 \(Cero secretos en frontend\)/);
    expect(calloutR6).toBeDefined();
    expect(
      screen.getByText(
        /Las credenciales de acceso permanente de Meta Cloud API están cifradas con AES-256-GCM/,
      ),
    ).toBeDefined();

    // Verificamos que ningún token secreto aparezca en el DOM
    const html = document.body.innerHTML;
    expect(html).not.toContain('EAAB');
    expect(html).not.toContain('Bearer');
    expect(html).not.toContain('app_secret');
  });

  it('permite copiar la URL oficial del webhook', () => {
    render(<BloqueConexionWhatsapp />);

    const botonCopiar = screen.getByRole('button', { name: /Copiar URL/i });
    expect(botonCopiar).toBeDefined();

    fireEvent.click(botonCopiar);

    expect(mockWriteText).toHaveBeenCalledWith(DATOS_WHATSAPP_CONECTADO_DEFAULT.webhookUrl);
    expect(screen.getByText('Copiado')).toBeDefined();
  });

  it('permite alternar al estado desconectado y muestra la guía de 3 pasos para agencias', () => {
    render(<BloqueConexionWhatsapp />);

    const botonAlternar = screen.getByTestId('btn-alternar-modo-conexion');
    expect(botonAlternar.textContent).toContain('Simular desconexión');

    // Cambiar a desconectado
    fireEvent.click(botonAlternar);

    expect(screen.getByText('Canal No Conectado')).toBeDefined();
    expect(botonAlternar.textContent).toContain('Conectar canal');
    expect(screen.getByTestId('estado-whatsapp-no-conectado')).toBeDefined();

    // 3 pasos para agencias
    expect(screen.getByText('Línea Telefónica Limpia')).toBeDefined();
    expect(screen.getByText('Meta Business Suite')).toBeDefined();
    expect(screen.getByText('Vincular con ViajaPro')).toBeDefined();

    // Regresar al estado conectado
    fireEvent.click(botonAlternar);
    expect(screen.getByText('Conexión Saludable')).toBeDefined();
    expect(screen.queryByTestId('estado-whatsapp-no-conectado')).toBeNull();
  });

  it('renderiza el estado desconectado inicialmente si se pasa en props', () => {
    render(<BloqueConexionWhatsapp datosIniciales={DATOS_WHATSAPP_DESCONECTADO_DEFAULT} />);

    expect(screen.getByText('Canal No Conectado')).toBeDefined();
    expect(screen.getByTestId('estado-whatsapp-no-conectado')).toBeDefined();
  });

  it('explica la ventana de 24 horas con lenguaje de agencia de viajes', () => {
    render(<BloqueConexionWhatsapp />);

    expect(screen.getByText('¿Cómo Funciona la Ventana de 24 Horas de WhatsApp?')).toBeDefined();
    expect(screen.getByText('VENTANA ABIERTA')).toBeDefined();
    expect(screen.getByText('VENTANA CERRADA')).toBeDefined();
    expect(screen.getByText('Conversación Libre con el Viajero')).toBeDefined();
    expect(screen.getByText('Requiere Plantilla Aprobada (HSM)')).toBeDefined();
    expect(screen.getByText(/Envío de cotizaciones personalizadas/)).toBeDefined();
    expect(screen.getByText(/Solo se pueden enviar plantillas pre-autorizadas/)).toBeDefined();
  });

  it('funciona el simulador interactivo de ventana de 24 horas', () => {
    render(<BloqueConexionWhatsapp />);

    expect(screen.getByTestId('simulador-ventana-24h')).toBeDefined();

    // Botón de 18 horas (por vencer)
    const btn18h = screen.getByRole('button', { name: /Hace 18 horas/i });
    fireEvent.click(btn18h);

    expect(screen.getByText(/Ventana Abierta \(6h 0m restantes\)/)).toBeDefined();
    expect(screen.getByText(/6h restantes/i)).toBeDefined();

    // Botón de 26 horas (vencida)
    const btn26h = screen.getByRole('button', { name: /Hace 26 horas/i });
    fireEvent.click(btn26h);

    expect(screen.getByText(/Ventana Cerrada \(\+24 horas sin respuesta\)/)).toBeDefined();
    expect(screen.getByText('Cerrada')).toBeDefined();
    expect(screen.getByText(/debes enviar una plantilla pre-aprobada por WhatsApp/)).toBeDefined();

    // Volver a 2 horas
    const btn2h = screen.getByRole('button', { name: /Hace 2 horas/i });
    fireEvent.click(btn2h);

    expect(screen.getByText(/Ventana Abierta \(22h 0m restantes\)/)).toBeDefined();
    expect(screen.getByText(/22h restantes/i)).toBeDefined();
  });

  it('muestra el catálogo completo de plantillas oficiales aprobadas de la agencia', () => {
    render(<BloqueConexionWhatsapp />);

    expect(screen.getByText('Plantillas Oficiales de Reenganche (HSM)')).toBeDefined();
    expect(screen.getByText(`${PLANTILLAS_OFICIALES_AGENCIA.length} Aprobadas`)).toBeDefined();

    for (const plantilla of PLANTILLAS_OFICIALES_AGENCIA) {
      expect(screen.getByText(plantilla.nombreVisible)).toBeDefined();
      expect(screen.getByText(`«${plantilla.ejemploTexto}»`)).toBeDefined();
    }
  });

  it('cumple con accesibilidad y tamaños táctiles mínimos de 44 px en botones de control', () => {
    render(<BloqueConexionWhatsapp />);

    const btnAlternar = screen.getByTestId('btn-alternar-modo-conexion');
    expect(btnAlternar.className).toContain('min-h-[44px]');

    const btnCopiar = screen.getByRole('button', { name: /Copiar URL/i });
    expect(btnCopiar.className).toContain('min-h-[44px]');

    const btnSimulador = screen.getByRole('button', { name: /Hace 2 horas/i });
    expect(btnSimulador.className).toContain('min-h-[44px]');
  });
});
