import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { type Contacto } from '@viajapro/contracts';
import {
  TEXTOS_LEGALES_CONSENTIMIENTO,
  construirCuerpoOtorgarConsentimiento,
  construirCuerpoRevocarConsentimiento,
  calcularEstadoFinalidad,
  calcularEstadosConsentimiento,
  obtenerTextoAvisoPorDefecto,
  obtenerVersionAvisoPorDefecto,
  otorgarConsentimiento,
  revocarConsentimiento,
  limpiarMetadatosConsentimientoEnMemoria,
} from './consentimientos-logica';
import { PanelConsentimientosContacto } from '../components/crm/consentimientos';
import * as crmApi from './crm-api';

const CONTACTO_BASE: Contacto = {
  id: '00000000-0002-4000-8000-000000000001',
  nombre: 'Valeria Gómez',
  telefono: '+573001234567',
  correo: 'valeria@ejemplo.co',
  etiquetas: ['VIP', 'Caribe'],
  preferencias: 'Hoteles frente al mar',
  consentimientos: ['TRANSACCIONAL'],
  creadoEn: '2026-10-15T10:00:00.000Z',
  ultimoContactoEn: '2026-10-24T15:30:00.000Z',
};

describe('Lógica de Consentimientos Ley 1581 (T-116)', () => {
  beforeEach(() => {
    limpiarMetadatosConsentimientoEnMemoria();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('1. Textos y versiones legales (PENDIENTE_REVISION_LEGAL)', () => {
    it('la versión y textos legales están estrictamente marcados con PENDIENTE_REVISION_LEGAL', () => {
      expect(TEXTOS_LEGALES_CONSENTIMIENTO.VERSION_AVISO_PENDIENTE_REVISION_LEGAL).toContain(
        'PENDIENTE_REVISION_LEGAL',
      );
      expect(
        TEXTOS_LEGALES_CONSENTIMIENTO.TEXTO_MOSTRADO_TRANSACCIONAL_PENDIENTE_REVISION_LEGAL,
      ).toContain('PENDIENTE_REVISION_LEGAL');
      expect(
        TEXTOS_LEGALES_CONSENTIMIENTO.TEXTO_MOSTRADO_PROMOCIONAL_PENDIENTE_REVISION_LEGAL,
      ).toContain('PENDIENTE_REVISION_LEGAL');

      expect(obtenerVersionAvisoPorDefecto()).toBe(
        TEXTOS_LEGALES_CONSENTIMIENTO.VERSION_AVISO_PENDIENTE_REVISION_LEGAL,
      );
      expect(obtenerTextoAvisoPorDefecto('TRANSACCIONAL')).toBe(
        TEXTOS_LEGALES_CONSENTIMIENTO.TEXTO_MOSTRADO_TRANSACCIONAL_PENDIENTE_REVISION_LEGAL,
      );
      expect(obtenerTextoAvisoPorDefecto('PROMOCIONAL')).toBe(
        TEXTOS_LEGALES_CONSENTIMIENTO.TEXTO_MOSTRADO_PROMOCIONAL_PENDIENTE_REVISION_LEGAL,
      );
    });
  });

  describe('2. Construcción y validación de contratos (Otorgar y Revocar)', () => {
    it('construirCuerpoOtorgarConsentimiento genera un contrato válido con Zod', () => {
      const cuerpo = construirCuerpoOtorgarConsentimiento({
        finalidad: 'TRANSACCIONAL',
        canal: 'whatsapp',
        prueba: 'whatsapp:wamid.123',
      });

      expect(cuerpo.finalidad).toBe('TRANSACCIONAL');
      expect(cuerpo.canal).toBe('whatsapp');
      expect(cuerpo.prueba).toBe('whatsapp:wamid.123');
      expect(cuerpo.versionAviso).toBe(
        TEXTOS_LEGALES_CONSENTIMIENTO.VERSION_AVISO_PENDIENTE_REVISION_LEGAL,
      );
      expect(cuerpo.textoMostrado).toContain('PENDIENTE_REVISION_LEGAL');
    });

    it('construirCuerpoRevocarConsentimiento genera el contrato con la finalidad', () => {
      const rev = construirCuerpoRevocarConsentimiento('PROMOCIONAL');
      expect(rev).toEqual({ finalidad: 'PROMOCIONAL' });
    });
  });

  describe('3. Cálculo de estado por finalidad', () => {
    it('identifica correctamente finalidades vigentes y revocadas / no otorgadas', () => {
      const estados = calcularEstadosConsentimiento(CONTACTO_BASE);
      expect(estados).toHaveLength(2);

      const transaccional = estados.find((e) => e.finalidad === 'TRANSACCIONAL');
      const promocional = estados.find((e) => e.finalidad === 'PROMOCIONAL');

      expect(transaccional?.vigente).toBe(true);
      expect(transaccional?.titulo).toContain('Transaccional');
      expect(transaccional?.versionAviso).toBe(
        TEXTOS_LEGALES_CONSENTIMIENTO.VERSION_AVISO_PENDIENTE_REVISION_LEGAL,
      );

      expect(promocional?.vigente).toBe(false);
      expect(promocional?.titulo).toContain('Promocional');
    });

    it('soporta metadatos específicos de otorgamiento y revocación', () => {
      const estado = calcularEstadoFinalidad(CONTACTO_BASE, 'PROMOCIONAL', {
        canal: 'presencial',
        prueba: 'formulario-fisico-01',
        revocadoEn: '2026-10-25T11:00:00.000Z',
      });

      expect(estado.vigente).toBe(false);
      expect(estado.canal).toBe('presencial');
      expect(estado.prueba).toBe('formulario-fisico-01');
      expect(estado.revocadoEn).toBe('2026-10-25T11:00:00.000Z');
    });
  });

  describe('4. Flujo de llamadas de API (Otorgar y Revocar)', () => {
    it('otorgarConsentimiento llama a otorgarConsentimientoContactoApi y actualiza en memoria', async () => {
      const contactoActualizado: Contacto = {
        ...CONTACTO_BASE,
        consentimientos: ['TRANSACCIONAL', 'PROMOCIONAL'],
      };
      const spy = vi
        .spyOn(crmApi, 'otorgarConsentimientoContactoApi')
        .mockResolvedValueOnce(contactoActualizado);

      const res = await otorgarConsentimiento(CONTACTO_BASE.id, 'PROMOCIONAL', {
        canal: 'formulario-web',
        prueba: 'test-prueba-1',
      });

      expect(spy).toHaveBeenCalledWith(
        CONTACTO_BASE.id,
        expect.objectContaining({
          finalidad: 'PROMOCIONAL',
          canal: 'formulario-web',
          prueba: 'test-prueba-1',
        }),
      );
      expect(res.consentimientos).toContain('PROMOCIONAL');

      const estadoRevisado = calcularEstadoFinalidad(res, 'PROMOCIONAL');
      expect(estadoRevisado.vigente).toBe(true);
      expect(estadoRevisado.canal).toBe('formulario-web');
      expect(estadoRevisado.prueba).toBe('test-prueba-1');
    });

    it('revocarConsentimiento llama a revocarConsentimientoContactoApi y registra revocación', async () => {
      const contactoRevocado: Contacto = {
        ...CONTACTO_BASE,
        consentimientos: [],
      };
      const spy = vi
        .spyOn(crmApi, 'revocarConsentimientoContactoApi')
        .mockResolvedValueOnce(contactoRevocado);

      const res = await revocarConsentimiento(CONTACTO_BASE.id, 'TRANSACCIONAL');

      expect(spy).toHaveBeenCalledWith(CONTACTO_BASE.id, { finalidad: 'TRANSACCIONAL' });
      expect(res.consentimientos).not.toContain('TRANSACCIONAL');

      const estadoRevisado = calcularEstadoFinalidad(res, 'TRANSACCIONAL');
      expect(estadoRevisado.vigente).toBe(false);
      expect(estadoRevisado.revocadoEn).toBeDefined();
    });
  });

  describe('5. Componente PanelConsentimientosContacto (Pantalla e Interacción)', () => {
    it('renderiza las dos finalidades con sus badges de estado y botones', () => {
      render(React.createElement(PanelConsentimientosContacto, { contacto: CONTACTO_BASE }));

      expect(screen.getByTestId('seccion-consentimientos')).toBeDefined();
      expect(screen.getByTestId('item-consentimiento-transaccional')).toBeDefined();
      expect(screen.getByTestId('item-consentimiento-promocional')).toBeDefined();

      expect(screen.getByTestId('badge-estado-transaccional').textContent).toContain('Vigente');
      expect(screen.getByTestId('badge-estado-promocional').textContent).toContain('Revocado');

      expect(screen.getByTestId('btn-revocar-transaccional')).toBeDefined();
      expect(screen.getByTestId('btn-otorgar-promocional')).toBeDefined();
    });

    it('abre el modal y muestra el texto exacto con la marca PENDIENTE_REVISION_LEGAL al hacer clic en "Ver texto mostrado"', async () => {
      render(React.createElement(PanelConsentimientosContacto, { contacto: CONTACTO_BASE }));

      const btnVerTexto = screen.getByTestId('btn-ver-texto-transaccional');
      fireEvent.click(btnVerTexto);

      expect(screen.getByTestId('modal-texto-mostrado')).toBeDefined();
      const bloqueTexto = screen.getByTestId('bloque-texto-mostrado');
      expect(bloqueTexto.textContent).toContain('PENDIENTE_REVISION_LEGAL');

      // Cerrar modal
      const btnCerrar = screen.getByTestId('btn-cerrar-modal-texto');
      fireEvent.click(btnCerrar);

      await waitFor(() => {
        expect(screen.queryByTestId('modal-texto-mostrado')).toBeNull();
      });
    });

    it('permite otorgar consentimiento y emite el contacto actualizado', async () => {
      const mockActualizado: Contacto = {
        ...CONTACTO_BASE,
        consentimientos: ['TRANSACCIONAL', 'PROMOCIONAL'],
      };
      vi.spyOn(crmApi, 'otorgarConsentimientoContactoApi').mockResolvedValueOnce(mockActualizado);
      const onActualizado = vi.fn();

      render(
        React.createElement(PanelConsentimientosContacto, {
          contacto: CONTACTO_BASE,
          onContactoActualizado: onActualizado,
        }),
      );

      const btnOtorgar = screen.getByTestId('btn-otorgar-promocional');
      fireEvent.click(btnOtorgar);

      await waitFor(() => {
        expect(onActualizado).toHaveBeenCalledWith(mockActualizado);
      });
    });

    it('pide confirmación antes de revocar consentimiento y emite el contacto revocado', async () => {
      const mockRevocado: Contacto = {
        ...CONTACTO_BASE,
        consentimientos: [],
      };
      vi.spyOn(crmApi, 'revocarConsentimientoContactoApi').mockResolvedValueOnce(mockRevocado);
      const onActualizado = vi.fn();

      render(
        React.createElement(PanelConsentimientosContacto, {
          contacto: CONTACTO_BASE,
          onContactoActualizado: onActualizado,
        }),
      );

      const btnRevocar = screen.getByTestId('btn-revocar-transaccional');
      fireEvent.click(btnRevocar);

      // Ahora aparece el botón de confirmación
      const btnConfirmar = screen.getByTestId('btn-confirmar-revocar-transaccional');
      fireEvent.click(btnConfirmar);

      await waitFor(() => {
        expect(onActualizado).toHaveBeenCalledWith(mockRevocado);
      });
    });

    it('muestra alerta accesible de error si la API falla', async () => {
      vi.spyOn(crmApi, 'otorgarConsentimientoContactoApi').mockRejectedValueOnce(
        new Error('Error de conexión con el servicio CRM'),
      );

      render(React.createElement(PanelConsentimientosContacto, { contacto: CONTACTO_BASE }));

      const btnOtorgar = screen.getByTestId('btn-otorgar-promocional');
      fireEvent.click(btnOtorgar);

      await waitFor(() => {
        expect(screen.getByTestId('alerta-error-consentimiento')).toBeDefined();
        expect(screen.getByTestId('alerta-error-consentimiento').textContent).toContain(
          'Error de conexión',
        );
      });
    });
  });
});
