import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BloqueRnt } from './bloque-rnt';
import * as api from '../../lib/agencia-api';

const BASE = { nombre: 'Agencia', paisIso: 'CO', monedaIso: 'COP', zonaHoraria: 'America/Bogota' };
const SIN_RNT = { ...BASE, rnt: null, rntVerificado: false };
const PENDIENTE = { ...BASE, rnt: '48213', rntVerificado: false };
const VERIFICADO = { ...BASE, rnt: '48213', rntVerificado: true };

const escribir = (valor: string) =>
  fireEvent.change(screen.getByTestId('campo-rnt'), { target: { value: valor } });
const botonGuardar = () => screen.getByTestId<HTMLButtonElement>('guardar-rnt');

describe('BloqueRnt', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('estados', () => {
    beforeEach(() => {
      vi.spyOn(api, 'obtenerAjustesDeAgencia').mockResolvedValue(SIN_RNT);
    });

    it('muestra esqueleto y luego «aún no registraste el RNT», con guardar apagado', async () => {
      render(<BloqueRnt />);
      expect(screen.getByTestId('cargando-rnt')).toBeDefined();
      const estado = await screen.findByTestId('estado-rnt');
      expect(estado.textContent).toContain('Aún no registraste el RNT');
      expect(estado.textContent).toContain('sale sin él');
      expect(botonGuardar().disabled).toBe(true);
    });

    it('con RNT sin verificar dice que todavía no sale en la propuesta', async () => {
      vi.spyOn(api, 'obtenerAjustesDeAgencia').mockResolvedValue(PENDIENTE);
      render(<BloqueRnt />);
      const estado = await screen.findByTestId('estado-rnt');
      expect(estado.textContent).toContain('Pendiente de verificación');
      expect(estado.textContent).toContain('48213');
      expect(estado.textContent).toContain('todavía no sale');
      expect(screen.getByTestId<HTMLInputElement>('campo-rnt').value).toBe('48213');
      expect(screen.queryByTestId('aviso-reverificar')).toBeNull();
    });

    it('con RNT verificado dice que sale en la propuesta', async () => {
      vi.spyOn(api, 'obtenerAjustesDeAgencia').mockResolvedValue(VERIFICADO);
      render(<BloqueRnt />);
      const estado = await screen.findByTestId('estado-rnt');
      expect(estado.textContent).toContain('Verificado');
      expect(estado.textContent).toContain('sale en la propuesta');
    });

    it('si el servidor no trae los campos del RNT, no inventa uno', async () => {
      vi.spyOn(api, 'obtenerAjustesDeAgencia').mockResolvedValue(BASE);
      render(<BloqueRnt />);
      expect((await screen.findByTestId('estado-rnt')).textContent).toContain('Aún no registraste');
    });

    it('si la carga falla, ofrece reintentar', async () => {
      const obtener = vi
        .spyOn(api, 'obtenerAjustesDeAgencia')
        .mockRejectedValueOnce(new Error('x'))
        .mockResolvedValue(PENDIENTE);
      render(<BloqueRnt />);
      const alerta = await screen.findByRole('alert');
      expect(alerta.textContent).toContain('No se pudo cargar el RNT');
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
      await screen.findByTestId('estado-rnt');
      expect(obtener).toHaveBeenCalledTimes(2);
    });
  });

  describe('guardar', () => {
    it('un RNT válido se envía, confirma y queda pendiente de verificación', async () => {
      vi.spyOn(api, 'obtenerAjustesDeAgencia').mockResolvedValue(SIN_RNT);
      const patch = vi.spyOn(api, 'actualizarRntApi').mockResolvedValue(PENDIENTE);
      render(<BloqueRnt />);
      await screen.findByTestId('campo-rnt');
      escribir(' 48213 ');
      expect(botonGuardar().disabled).toBe(false);
      fireEvent.click(botonGuardar());
      await screen.findByTestId('exito-rnt');
      expect(patch).toHaveBeenCalledWith('48213');
      expect(screen.getByTestId('estado-rnt').textContent).toContain('Pendiente de verificación');
    });

    it.each(['ABC', '12 34', '48.213', '12345678901'])(
      'un RNT inválido (%j) no se envía y el campo lo explica',
      async (malo) => {
        vi.spyOn(api, 'obtenerAjustesDeAgencia').mockResolvedValue(SIN_RNT);
        const patch = vi.spyOn(api, 'actualizarRntApi');
        render(<BloqueRnt />);
        await screen.findByTestId('campo-rnt');
        fireEvent.change(screen.getByTestId('campo-rnt'), { target: { value: malo } });
        expect(screen.getByTestId('ayuda-rnt').textContent).toContain('solo dígitos');
        expect(screen.getByTestId('campo-rnt').getAttribute('aria-invalid')).toBe('true');
        expect(botonGuardar().disabled).toBe(true);
        fireEvent.submit(screen.getByTestId('bloque-rnt'));
        expect(patch).not.toHaveBeenCalled();
      },
    );

    it('vaciar el campo guarda null y quita el RNT', async () => {
      vi.spyOn(api, 'obtenerAjustesDeAgencia').mockResolvedValue(PENDIENTE);
      const patch = vi.spyOn(api, 'actualizarRntApi').mockResolvedValue(SIN_RNT);
      render(<BloqueRnt />);
      await screen.findByTestId('campo-rnt');
      escribir('');
      fireEvent.click(botonGuardar());
      await screen.findByTestId('exito-rnt');
      expect(patch).toHaveBeenCalledWith(null);
      expect(screen.getByTestId('estado-rnt').textContent).toContain('Aún no registraste');
    });

    it('sin cambios no se puede guardar', async () => {
      vi.spyOn(api, 'obtenerAjustesDeAgencia').mockResolvedValue(PENDIENTE);
      render(<BloqueRnt />);
      await screen.findByTestId('campo-rnt');
      expect(botonGuardar().disabled).toBe(true);
    });

    it('cambiar un RNT verificado avisa antes de guardar y, al guardar, queda sin verificar', async () => {
      vi.spyOn(api, 'obtenerAjustesDeAgencia').mockResolvedValue(VERIFICADO);
      vi.spyOn(api, 'actualizarRntApi').mockResolvedValue({
        ...BASE,
        rnt: '48214',
        rntVerificado: false,
      });
      render(<BloqueRnt />);
      await screen.findByTestId('campo-rnt');
      expect(screen.queryByTestId('aviso-reverificar')).toBeNull();
      escribir('48214');
      expect(screen.getByTestId('aviso-reverificar').textContent).toContain(
        'tendrá que verificarse de nuevo',
      );
      fireEvent.click(botonGuardar());
      await screen.findByTestId('exito-rnt');
      const estado = screen.getByTestId('estado-rnt').textContent ?? '';
      expect(estado).toContain('Pendiente de verificación');
      expect(estado).toContain('48214');
      expect(screen.queryByTestId('aviso-reverificar')).toBeNull();
    });

    it('403 dice que solo el dueño o un administrador puede cambiarlo', async () => {
      vi.spyOn(api, 'obtenerAjustesDeAgencia').mockResolvedValue(SIN_RNT);
      vi.spyOn(api, 'actualizarRntApi').mockRejectedValue(
        new api.ErrorAjustesAgenciaApi('PERMISO_DENEGADO', 'x', 403),
      );
      render(<BloqueRnt />);
      await screen.findByTestId('campo-rnt');
      escribir('48213');
      fireEvent.click(botonGuardar());
      const e = await screen.findByTestId('error-rnt');
      expect(e.textContent).toContain('dueño o un administrador');
    });

    it('400 y la falta de conexión tienen su mensaje; el resto, uno genérico', async () => {
      vi.spyOn(api, 'obtenerAjustesDeAgencia').mockResolvedValue(SIN_RNT);
      const patch = vi.spyOn(api, 'actualizarRntApi');
      render(<BloqueRnt />);
      await screen.findByTestId('campo-rnt');
      const casos: Array<[unknown, string]> = [
        [new api.ErrorAjustesAgenciaApi('VALIDACION', 'x', 400), 'solo dígitos'],
        [new api.ErrorAjustesAgenciaApi('ERROR_CONEXION', 'x'), 'No hay conexión'],
        [new Error('x'), 'No se pudo guardar el RNT'],
      ];
      for (const [error, texto] of casos) {
        patch.mockRejectedValueOnce(error);
        escribir('48213');
        fireEvent.click(botonGuardar());
        await waitFor(() => expect(screen.getByTestId('error-rnt').textContent).toContain(texto));
        // Un cambio en el campo borra el error anterior.
        escribir('48214');
        expect(screen.queryByTestId('error-rnt')).toBeNull();
      }
    });
  });
});
