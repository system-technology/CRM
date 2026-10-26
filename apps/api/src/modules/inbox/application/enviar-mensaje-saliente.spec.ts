/**
 * El caso de uso del envío, con base, Meta y reserva de mentira. Lo que se comprueba es la
 * garantía de R5: **un mensaje nunca se manda dos veces a Meta**, reintente quien reintente, y
 * ningún mensaje se queda «pendiente» para siempre sin explicación.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CredencialInvalidaError,
  CredencialNoDisponibleError,
  EnvioSinConfirmarError,
  FueraDeVentanaError,
  LimiteDeTasaError,
  type ErrorDeEnvioWhatsapp,
} from '../domain/errores-de-envio.js';
import { CredencialesDePrueba } from '../infrastructure/credenciales-whatsapp.entorno.js';
import {
  EnvioWhatsappFalso,
  ReservaDeEnvioEnMemoria,
} from '../infrastructure/envio-whatsapp.falso.js';
import { EnviarMensajeSaliente } from './enviar-mensaje-saliente.js';
import { type MensajePorEnviar, PuertoMensajesSalientes } from './puertos-de-envio.js';

const TENANT = '01932000-0000-7000-8000-00000000000a';
const MENSAJE = '01932000-0000-7000-8000-0000000000aa';
const NUMERO_DE_PRUEBA = '106540352242922';
const AHORA = new Date('2026-10-26T15:00:00.000Z');
const HORA = 3_600_000;

class MensajesFalsos extends PuertoMensajesSalientes {
  fila: MensajePorEnviar | null;
  fallos: Array<{ codigoMeta: number | null; message: string }> = [];
  constructor(fila: Partial<MensajePorEnviar> = {}) {
    super();
    this.fila = {
      mensajeId: MENSAJE,
      conversacionId: '01932000-0000-7000-8000-0000000000cc',
      estado: 'PENDIENTE',
      aceptadoPorMeta: false,
      tipo: 'TEXTO',
      texto: 'Hola Sofía, te comparto el plan a San Andrés.',
      destinoE164: '+573001234567',
      canalId: '01932000-0000-7000-8000-0000000000bb',
      phoneNumberId: NUMERO_DE_PRUEBA,
      canalActivo: true,
      ultimoMensajeClienteEn: new Date(AHORA.getTime() - 2 * HORA),
      ...fila,
    };
  }
  leerParaEnviar(): Promise<MensajePorEnviar | null> {
    return Promise.resolve(this.fila ? { ...this.fila } : null);
  }
  registrarAceptado(_t: string, _m: string, _wamid: string): Promise<void> {
    if (this.fila && !this.fila.aceptadoPorMeta) this.fila.aceptadoPorMeta = true;
    return Promise.resolve();
  }
  registrarFallo(
    _t: string,
    _m: string,
    e: Pick<ErrorDeEnvioWhatsapp, 'codigoMeta' | 'message'>,
  ): Promise<boolean> {
    if (!this.fila || this.fila.estado !== 'PENDIENTE' || this.fila.aceptadoPorMeta) {
      return Promise.resolve(false);
    }
    this.fila.estado = 'FALLIDO';
    this.fallos.push({ codigoMeta: e.codigoMeta, message: e.message });
    return Promise.resolve(true);
  }
}

function montar(meta: EnvioWhatsappFalso, fila: Partial<MensajePorEnviar> = {}) {
  const mensajes = new MensajesFalsos(fila);
  const reservas = new ReservaDeEnvioEnMemoria();
  const caso = new EnviarMensajeSaliente(
    mensajes,
    new CredencialesDePrueba('token-de-prueba', NUMERO_DE_PRUEBA),
    meta,
    reservas,
  );
  return { mensajes, reservas, caso };
}

describe('EnviarMensajeSaliente — el camino feliz', () => {
  it('envía el texto con la credencial del canal y nuestra referencia, y guarda el wamid', async () => {
    const meta = new EnvioWhatsappFalso({ wamid: 'wamid.OK' });
    const { caso, mensajes } = montar(meta);
    const r = await caso.ejecutar(TENANT, MENSAJE, false, AHORA);
    expect(r).toEqual({ estado: 'ACEPTADO', wamid: 'wamid.OK' });
    expect(meta.pedidos).toHaveLength(1);
    expect(meta.pedidos[0]).toMatchObject({
      credencial: { phoneNumberId: NUMERO_DE_PRUEBA, token: 'token-de-prueba' },
      para: '+573001234567',
      referencia: MENSAJE,
    });
    expect(mensajes.fila?.aceptadoPorMeta).toBe(true);
  });
});

describe('EnviarMensajeSaliente — idempotencia (R5)', () => {
  let meta: EnvioWhatsappFalso;
  beforeEach(() => {
    meta = new EnvioWhatsappFalso({ wamid: 'wamid.OK' });
  });

  it('un reintento de BullMQ tras el éxito no vuelve a llamar a Meta', async () => {
    const { caso } = montar(meta);
    await caso.ejecutar(TENANT, MENSAJE, false, AHORA);
    expect(await caso.ejecutar(TENANT, MENSAJE, false, AHORA)).toEqual({ estado: 'YA_RESUELTO' });
    expect(meta.pedidos).toHaveLength(1);
  });

  it('un mensaje que ya no está PENDIENTE no se envía', async () => {
    const { caso } = montar(meta, { estado: 'FALLIDO' });
    expect(await caso.ejecutar(TENANT, MENSAJE, false, AHORA)).toEqual({ estado: 'YA_RESUELTO' });
    expect(meta.pedidos).toHaveLength(0);
  });

  it('un mensaje de otro tenant (o inexistente) no se envía', async () => {
    const { caso, mensajes } = montar(meta);
    mensajes.fila = null;
    expect(await caso.ejecutar(TENANT, MENSAJE, false, AHORA)).toEqual({
      estado: 'NO_ENCONTRADO',
    });
    expect(meta.pedidos).toHaveLength(0);
  });

  it('si un intento anterior murió a mitad de la llamada, NO se reenvía: queda sin confirmar', async () => {
    const { caso, reservas, mensajes } = montar(meta);
    await reservas.reservar(MENSAJE); // el proceso murió después de reservar y antes de registrar
    const r = await caso.ejecutar(TENANT, MENSAJE, false, AHORA);
    expect(r).toMatchObject({ estado: 'FALLIDO', codigo: 'WHATSAPP_ENVIO_SIN_CONFIRMAR' });
    expect(meta.pedidos).toHaveLength(0);
    expect(mensajes.fallos[0]?.message).toMatch(/No pudimos confirmar/);
  });

  it('un timeout queda sin confirmar, conserva la reserva, y el reintento no reenvía', async () => {
    const lento = new EnvioWhatsappFalso(new EnvioSinConfirmarError());
    const { caso, reservas } = montar(lento);
    const r = await caso.ejecutar(TENANT, MENSAJE, false, AHORA);
    expect(r).toMatchObject({ estado: 'FALLIDO', codigo: 'WHATSAPP_ENVIO_SIN_CONFIRMAR' });
    expect(reservas.reservados.has(MENSAJE)).toBe(true);
    expect(await caso.ejecutar(TENANT, MENSAJE, false, AHORA)).toEqual({ estado: 'YA_RESUELTO' });
    expect(lento.pedidos).toHaveLength(1);
  });
});

describe('EnviarMensajeSaliente — la ventana de 24 h y el canal', () => {
  it('si la ventana se cerró mientras esperaba en la cola, no llama a Meta', async () => {
    const meta = new EnvioWhatsappFalso();
    const { caso, mensajes } = montar(meta, {
      ultimoMensajeClienteEn: new Date(AHORA.getTime() - 25 * HORA),
    });
    const r = await caso.ejecutar(TENANT, MENSAJE, false, AHORA);
    expect(r).toMatchObject({ estado: 'FALLIDO', codigo: 'VENTANA_CERRADA' });
    expect(meta.pedidos).toHaveLength(0);
    expect(mensajes.fallos[0]?.message).toMatch(/solo se pueden enviar plantillas/);
  });

  it('un canal suspendido o revocado no envía', async () => {
    const meta = new EnvioWhatsappFalso();
    const { caso } = montar(meta, { canalActivo: false });
    expect(await caso.ejecutar(TENANT, MENSAJE, false, AHORA)).toMatchObject({
      estado: 'FALLIDO',
      codigo: 'CANAL_NO_ACTIVO',
    });
    expect(meta.pedidos).toHaveLength(0);
  });

  it('un canal que no es el número de prueba no recibe el token de la plataforma', async () => {
    const meta = new EnvioWhatsappFalso();
    const { caso } = montar(meta, { phoneNumberId: '999999999999999' });
    expect(await caso.ejecutar(TENANT, MENSAJE, false, AHORA)).toMatchObject({
      estado: 'FALLIDO',
      codigo: new CredencialNoDisponibleError().code,
    });
    expect(meta.pedidos).toHaveLength(0);
  });
});

describe('EnviarMensajeSaliente — los errores de Meta', () => {
  it('131047 de Meta: FALLIDO con el código crudo y sin reintento', async () => {
    const meta = new EnvioWhatsappFalso(new FueraDeVentanaError());
    const { caso, mensajes } = montar(meta);
    expect(await caso.ejecutar(TENANT, MENSAJE, false, AHORA)).toMatchObject({
      estado: 'FALLIDO',
      codigoMeta: 131047,
    });
    expect(mensajes.fallos[0]?.codigoMeta).toBe(131047);
  });

  it('190 de Meta: FALLIDO, el asesor sabe que hay que reconectar', async () => {
    const meta = new EnvioWhatsappFalso(new CredencialInvalidaError(190));
    const { caso, mensajes } = montar(meta);
    await caso.ejecutar(TENANT, MENSAJE, false, AHORA);
    expect(mensajes.fallos[0]).toMatchObject({ codigoMeta: 190 });
    expect(mensajes.fallos[0]?.message).toMatch(/reconecte/);
  });

  it('130429: suelta la reserva y relanza para que la cola reintente; luego sale', async () => {
    const meta = new EnvioWhatsappFalso(new LimiteDeTasaError(130429), { wamid: 'wamid.2' });
    const { caso, reservas, mensajes } = montar(meta);
    await expect(caso.ejecutar(TENANT, MENSAJE, false, AHORA)).rejects.toBeInstanceOf(
      LimiteDeTasaError,
    );
    expect(reservas.reservados.has(MENSAJE)).toBe(false);
    expect(mensajes.fila?.estado).toBe('PENDIENTE');
    expect(await caso.ejecutar(TENANT, MENSAJE, false, AHORA)).toEqual({
      estado: 'ACEPTADO',
      wamid: 'wamid.2',
    });
  });

  it('en el ÚLTIMO intento, un fallo pasajero queda FALLIDO y no «pendiente» para siempre', async () => {
    const meta = new EnvioWhatsappFalso(new LimiteDeTasaError(130429));
    const { caso, mensajes } = montar(meta);
    expect(await caso.ejecutar(TENANT, MENSAJE, true, AHORA)).toMatchObject({
      estado: 'FALLIDO',
      codigoMeta: 130429,
    });
    expect(mensajes.fila?.estado).toBe('FALLIDO');
  });
});
