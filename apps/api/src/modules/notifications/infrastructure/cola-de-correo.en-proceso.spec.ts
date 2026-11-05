import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MensajeDeCorreo } from '../../../shared/puertos/puerto-de-correo.js';
import { ErrorDeCorreoDefinitivo, ErrorDeCorreoTransitorio } from '../domain/errores-de-correo.js';
import type { PuertoCorreo } from '../domain/puerto-correo.js';
import { ColaDeCorreoEnProceso } from './cola-de-correo.en-proceso.js';

const MENSAJE: MensajeDeCorreo = {
  para: 'viajera.secreta@ejemplo.com',
  asunto: 'Tu codigo',
  texto: 'Tu codigo es 482913',
};

class CorreoFalso implements PuertoCorreo {
  enviados: MensajeDeCorreo[] = [];
  fallos: Array<Error | null> = [];
  intentos = 0;
  enviar(mensaje: MensajeDeCorreo): Promise<void> {
    this.intentos += 1;
    const fallo = this.fallos.shift();
    if (fallo) return Promise.reject(fallo);
    this.enviados.push(mensaje);
    return Promise.resolve();
  }
}

describe('ColaDeCorreoEnProceso', () => {
  let escrito: string[];
  beforeEach(() => {
    vi.useFakeTimers();
    escrito = [];
    const guardar = (m: unknown): void => void escrito.push(String(m));
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(guardar);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(guardar);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('envía por el puerto sin esperar al proveedor', async () => {
    const correo = new CorreoFalso();
    const cola = new ColaDeCorreoEnProceso(correo);
    await cola.encolar(MENSAJE, 'otp-1');
    await vi.advanceTimersByTimeAsync(0);
    expect(correo.enviados).toEqual([MENSAJE]);
  });

  it('un fallo transitorio se reintenta con espera exponencial desde 5 s', async () => {
    const correo = new CorreoFalso();
    correo.fallos = [new ErrorDeCorreoTransitorio('x', 500, 503), null];
    const cola = new ColaDeCorreoEnProceso(correo);
    await cola.encolar(MENSAJE, 'otp-1');
    await vi.advanceTimersByTimeAsync(4_999);
    expect(correo.intentos).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(correo.intentos).toBe(2);
    expect(correo.enviados).toHaveLength(1);
  });

  it('un 4xx del proveedor no se reintenta', async () => {
    const correo = new CorreoFalso();
    correo.fallos = [new ErrorDeCorreoDefinitivo('x', 406, 422)];
    const cola = new ColaDeCorreoEnProceso(correo);
    await cola.encolar(MENSAJE, 'otp-1');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(correo.intentos).toBe(1);
  });

  it('cinco intentos y se abandona', async () => {
    const correo = new CorreoFalso();
    correo.fallos = Array.from({ length: 9 }, () => new ErrorDeCorreoTransitorio('x', null, null));
    const cola = new ColaDeCorreoEnProceso(correo);
    await cola.encolar(MENSAJE, 'otp-1');
    await vi.advanceTimersByTimeAsync(5_000 + 10_000 + 20_000 + 40_000 + 1);
    expect(correo.intentos).toBe(5);
    expect(escrito.some((l) => l.includes('abandonado'))).toBe(true);
  });

  it('deduplica por clave de idempotencia, también tras enviarse (R5)', async () => {
    const correo = new CorreoFalso();
    const cola = new ColaDeCorreoEnProceso(correo);
    await cola.encolar(MENSAJE, 'invitacion-abc');
    await vi.advanceTimersByTimeAsync(0);
    await cola.encolar(MENSAJE, 'invitacion-abc');
    await vi.advanceTimersByTimeAsync(0);
    expect(correo.enviados).toHaveLength(1);
    await cola.encolar(MENSAJE, 'otra-clave');
    await vi.advanceTimersByTimeAsync(0);
    expect(correo.enviados).toHaveLength(2);
  });

  it('rechaza una clave con caracteres fuera de [A-Za-z0-9_-]', async () => {
    const cola = new ColaDeCorreoEnProceso(new CorreoFalso());
    await expect(cola.encolar(MENSAJE, 'con espacio')).rejects.toThrow();
  });

  it('R10: ni el destinatario ni el texto llegan al registro, ni siquiera al fallar', async () => {
    const correo = new CorreoFalso();
    correo.fallos = [
      new ErrorDeCorreoTransitorio(`fallo con ${MENSAJE.para} y ${MENSAJE.texto}`, 300, 500),
      new ErrorDeCorreoDefinitivo(`fallo con ${MENSAJE.para}`, 406, 422),
    ];
    const cola = new ColaDeCorreoEnProceso(correo);
    await cola.encolar(MENSAJE, 'otp-clave-larga-1234');
    await vi.advanceTimersByTimeAsync(10_000);
    const todo = escrito.join('\n');
    expect(todo).toContain('codigo=300');
    expect(todo).not.toContain('viajera.secreta');
    expect(todo).not.toContain('482913');
  });

  it('cierre ordenado: deja terminar el envío en curso y descarta los reintentos', async () => {
    const correo = new CorreoFalso();
    correo.fallos = [new ErrorDeCorreoTransitorio('x', null, null)];
    const cola = new ColaDeCorreoEnProceso(correo);
    await cola.encolar(MENSAJE, 'otp-1');
    await vi.advanceTimersByTimeAsync(0); // falló y espera 5 s
    await cola.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(correo.intentos).toBe(1); // el reintento pendiente se pierde: decisión aceptada
    expect(correo.enviados).toHaveLength(0);
  });
});
