import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { BloqueConexionWhatsapp } from './bloque-conexion-whatsapp';
import { ventanaDesdeUltimaRecepcion } from '../../lib/canal-whatsapp-api';

const canal = {
  id: '11111111-1111-4111-8111-111111111111',
  numeroE164: '+573001112233',
  nombreVisible: 'JD Tours',
  estado: 'ACTIVO',
  estadoCuenta: 'ACTIVO',
  conectado: true,
  conectadoDesde: '2026-10-01T10:00:00.000Z',
  ultimaRecepcionEn: null,
  ultimoEnvioFallido: null,
};

function responder(cuerpo: unknown, status = 200) {
  return vi
    .fn()
    .mockResolvedValue({ ok: status < 400, status, json: () => Promise.resolve(cuerpo) });
}

describe('BloqueConexionWhatsapp (estado real del canal)', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => cleanup());

  it('muestra esqueleto mientras carga', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    );
    render(<BloqueConexionWhatsapp />);
    expect(screen.getByTestId('whatsapp-cargando')).toBeDefined();
  });

  it('muestra el canal conectado, la ventana de 24 h y sin envíos fallidos', async () => {
    vi.stubGlobal('fetch', responder({ conectado: true, canales: [canal] }));
    render(<BloqueConexionWhatsapp />);
    await waitFor(() => expect(screen.getByTestId('canal-whatsapp')).toBeDefined());
    expect(screen.getByText('+573001112233')).toBeDefined();
    expect(screen.getByTestId('canal-conectado').textContent).toBe('Conectado');
    expect(screen.getByTestId('canal-ventana').textContent).toMatch(/24 horas/);
    expect(screen.getByText('Ningún envío ha fallado.')).toBeDefined();
    expect(screen.queryByText(/calidad|tier|token/i)).toBeNull();
  });

  it('muestra legible el último envío fallido', async () => {
    const fallido = {
      ocurridoEn: '2026-11-01T15:00:00.000Z',
      motivo: 'El cliente no escribió en las últimas 24 horas.',
      codigoErrorMeta: 131047,
    };
    vi.stubGlobal(
      'fetch',
      responder({
        conectado: false,
        canales: [
          { ...canal, conectado: false, estado: 'SUSPENDIDO', ultimoEnvioFallido: fallido },
        ],
      }),
    );
    render(<BloqueConexionWhatsapp />);
    await waitFor(() => expect(screen.getByTestId('canal-ultimo-fallo')).toBeDefined());
    expect(screen.getByTestId('canal-ultimo-fallo').textContent).toMatch(/últimas 24 horas/);
    expect(screen.getByTestId('canal-ultimo-fallo').textContent).toMatch(/131047/);
    expect(screen.getByTestId('canal-conectado').textContent).toBe('No operativo');
    expect(screen.getByText('Suspendido')).toBeDefined();
  });

  it('sin canales muestra el estado no conectado', async () => {
    vi.stubGlobal('fetch', responder({ conectado: false, canales: [] }));
    render(<BloqueConexionWhatsapp />);
    await waitFor(() => expect(screen.getByTestId('estado-whatsapp-no-conectado')).toBeDefined());
  });

  it('error con reintento que recupera', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve(null) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ conectado: true, canales: [canal] }),
      });
    vi.stubGlobal('fetch', f);
    render(<BloqueConexionWhatsapp />);
    await waitFor(() => expect(screen.getByTestId('whatsapp-error')).toBeDefined());
    fireEvent.click(screen.getByTestId('btn-reintentar-whatsapp'));
    await waitFor(() => expect(screen.getByTestId('canal-whatsapp')).toBeDefined());
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('respuesta con formato inválido es un error, no datos', async () => {
    vi.stubGlobal('fetch', responder({ foo: 1 }));
    render(<BloqueConexionWhatsapp />);
    await waitFor(() => expect(screen.getByTestId('whatsapp-error')).toBeDefined());
  });
});

describe('ventanaDesdeUltimaRecepcion', () => {
  const ahora = Date.parse('2026-11-05T12:00:00Z');
  it('sin recepción: cerrada', () => {
    expect(ventanaDesdeUltimaRecepcion(null, ahora).abierta).toBe(false);
  });
  it('hace 2 h: abierta, quedan 22 h', () => {
    const v = ventanaDesdeUltimaRecepcion('2026-11-05T10:00:00Z', ahora);
    expect(v.abierta).toBe(true);
    expect(v.texto).toMatch(/22 h 0 min/);
  });
  it('hace 25 h: cerrada', () => {
    expect(ventanaDesdeUltimaRecepcion('2026-11-04T11:00:00Z', ahora).abierta).toBe(false);
  });
});
