/**
 * Dos consumidores sobre el MISMO envío (el arrendamiento de 2 min venció antes de que el primero
 * reservara). Pruebas de comportamiento con puertos de mentira: no hace falta base de datos.
 *
 * Lo que la garantía R5 exige, y se comprueba aquí:
 *   · Meta recibe UNA sola petición, gane quien gane la reserva.
 *
 * Lo que hoy NO se cumple, y queda documentado con `it.fails` (auditoría del PR #220, hallazgo Q2,
 * BAJO, dueño `backend`): el perdedor de la reserva marca «sin confirmar» (`FALLIDO`) un envío que
 * el ganador SIGUE haciendo. No hay duplicado, pero el estado del mensaje es falso mientras dura la
 * llamada, y si Meta rechaza de forma definitiva el código se pierde (`registrarFallo` exige
 * `PENDIENTE`). Corrección propuesta por la auditoría: el reclamo devuelve un testigo
 * (`envio_intentos`) y `reservar` lo exige; un perdedor con arrendamiento ajeno no marca nada.
 * Cuando se corrija, `it.fails` pasará a fallar y habrá que quitarle el `.fails`.
 */
import { describe, expect, it } from 'vitest';
import { EnviarMensajeSaliente } from './enviar-mensaje-saliente.js';
import {
  type CredencialDeEnvio,
  type MensajePorEnviar,
  type PedidoDeTexto,
  PuertoCredencialesWhatsapp,
  PuertoEnvioWhatsapp,
  PuertoMensajesSalientes,
  PuertoReservaDeEnvio,
} from './puertos-de-envio.js';

const TENANT = '01932000-0000-7000-8000-00000000000a';
const MENSAJE = '01932000-0000-7000-8000-0000000000aa';

class MensajesFalsos extends PuertoMensajesSalientes {
  estado: 'PENDIENTE' | 'FALLIDO' = 'PENDIENTE';
  wamid: string | null = null;
  fallosEscritos = 0;

  leerParaEnviar(): Promise<MensajePorEnviar | null> {
    return Promise.resolve({
      mensajeId: MENSAJE,
      conversacionId: '01932000-0000-7000-8000-0000000000cc',
      estado: this.estado,
      aceptadoPorMeta: this.wamid !== null,
      tipo: 'TEXTO',
      texto: 'Hola, te comparto el plan.',
      destinoE164: '+573001234567',
      canalId: '01932000-0000-7000-8000-0000000000bb',
      phoneNumberId: '106540352242922',
      canalActivo: true,
      consentimientoRevocado: false,
      ultimoMensajeClienteEn: new Date(),
    });
  }
  registrarAceptado(_t: string, _m: string, wamid: string): Promise<void> {
    this.wamid ??= wamid;
    return Promise.resolve();
  }
  registrarFallo(): Promise<boolean> {
    if (this.estado !== 'PENDIENTE' || this.wamid !== null) return Promise.resolve(false);
    this.estado = 'FALLIDO';
    this.fallosEscritos += 1;
    return Promise.resolve(true);
  }
}

class ReservaUnica extends PuertoReservaDeEnvio {
  private reservado = false;
  reservar(): Promise<boolean> {
    if (this.reservado) return Promise.resolve(false);
    this.reservado = true;
    return Promise.resolve(true);
  }
  liberar(): Promise<void> {
    this.reservado = false;
    return Promise.resolve();
  }
}

class Credenciales extends PuertoCredencialesWhatsapp {
  paraCanal(): Promise<CredencialDeEnvio> {
    return Promise.resolve({ phoneNumberId: '106540352242922', token: 'token-de-prueba' });
  }
}

/** Meta que se queda esperando hasta que la prueba la suelte: «la llamada sigue en vuelo». */
class MetaEnVuelo extends PuertoEnvioWhatsapp {
  peticiones = 0;
  private soltar: (wamid: string) => void = () => undefined;
  private readonly respuesta = new Promise<string>((r) => {
    this.soltar = r;
  });
  enviarTexto(_pedido: PedidoDeTexto): Promise<{ wamid: string }> {
    this.peticiones += 1;
    return this.respuesta.then((wamid) => ({ wamid }));
  }
  responder(wamid: string): void {
    this.soltar(wamid);
  }
}

const tick = (): Promise<void> => new Promise((r) => setImmediate(r));

function dosConsumidores() {
  const mensajes = new MensajesFalsos();
  const meta = new MetaEnVuelo();
  const reservas = new ReservaUnica();
  const mk = (): EnviarMensajeSaliente =>
    new EnviarMensajeSaliente(mensajes, new Credenciales(), meta, reservas);
  return { mensajes, meta, a: mk(), b: mk() };
}

describe('dos consumidores del mismo envío (arrendamiento vencido antes de reservar)', () => {
  it('Meta recibe UNA sola petición y el mensaje queda aceptado', async () => {
    const { mensajes, meta, a, b } = dosConsumidores();
    const ganador = a.ejecutar(TENANT, MENSAJE, false);
    await tick();
    const perdedor = await b.ejecutar(TENANT, MENSAJE, false);
    meta.responder('wamid.UNICO');

    expect(await ganador).toEqual({ estado: 'ACEPTADO', wamid: 'wamid.UNICO' });
    expect(perdedor.estado).toBe('FALLIDO');
    expect(meta.peticiones).toBe(1);
    expect(mensajes.wamid).toBe('wamid.UNICO');
  });

  // Q2 (BAJO, backend). Hoy el perdedor escribe FALLIDO mientras el ganador sigue enviando. Lo
  // correcto: quien no reservó no marca nada, porque no sabe si el ganador sigue vivo.
  it.fails(
    'Q2: el perdedor de la reserva NO marca «sin confirmar» un envío que el ganador sigue haciendo',
    async () => {
      const { mensajes, meta, a, b } = dosConsumidores();
      const ganador = a.ejecutar(TENANT, MENSAJE, false);
      await tick();
      await b.ejecutar(TENANT, MENSAJE, false);

      // La llamada del ganador sigue en vuelo: el mensaje no puede estar ya FALLIDO.
      expect(mensajes.estado).toBe('PENDIENTE');
      expect(mensajes.fallosEscritos).toBe(0);

      meta.responder('wamid.UNICO');
      await ganador;
    },
  );
});
