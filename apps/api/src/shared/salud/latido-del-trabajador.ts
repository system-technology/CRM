/**
 * Latido del trabajador (T-194). El trabajador no sirve HTTP, así que en Render no tiene sonda:
 * si muere, la bandeja deja de procesar y nadie se entera hasta que un cliente escribe. Aquí el
 * trabajador escribe en Redis `SET latido <json> EX 60` cada 15 s, y `/salud/listo` de la API lo
 * lee. Sin tabla ni migración: el dato es efímero y si Redis cae la cola ya está caída.
 *
 * Varios trabajadores comparten la clave: basta con que UNO esté vivo para que el latido sea fresco.
 */
import { Redis } from 'ioredis';

export const CLAVE_DEL_LATIDO = 'viajapro:trabajador:latido';
export const INTERVALO_DEL_LATIDO_S = 15;
/** Tres latidos perdidos. La clave además caduca a los 60 s. */
export const LATIDO_VIEJO_TRAS_S = 45;
const CADUCIDAD_S = 60;

export type EstadoDelTrabajador =
  | { estado: 'ok'; edadSegundos: number }
  | { estado: 'viejo'; edadSegundos: number }
  | { estado: 'sin_latido' }
  | { estado: 'sin_verificar' };

/** Lado trabajador: escribe el latido hasta que se detiene. Nunca lanza: un latido perdido se ve en la API. */
export class LatidoDelTrabajador {
  private readonly conexion: Redis;
  private temporizador: NodeJS.Timeout | null = null;

  constructor(
    url: string,
    private readonly registrar: (mensaje: string) => void = () => undefined,
  ) {
    this.conexion = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: false });
    // Sin escucha, ioredis imprime cada error de conexión por su cuenta.
    this.conexion.on('error', () => undefined);
  }

  async iniciar(): Promise<void> {
    await this.latir();
    this.temporizador = setInterval(() => void this.latir(), INTERVALO_DEL_LATIDO_S * 1000);
    this.temporizador.unref();
  }

  async latir(): Promise<void> {
    try {
      const valor = JSON.stringify({ en: new Date().toISOString(), pid: process.pid });
      await this.conexion.set(CLAVE_DEL_LATIDO, valor, 'EX', CADUCIDAD_S);
    } catch {
      // Solo el hecho: el mensaje de un error de Redis puede traer la URL con su clave.
      this.registrar('No se pudo escribir el latido en Redis; se reintenta.');
    }
  }

  detener(): Promise<void> {
    if (this.temporizador) clearInterval(this.temporizador);
    this.conexion.disconnect();
    return Promise.resolve();
  }
}

/** Lado API: lo que lee `/salud/listo`. */
export abstract class LectorDelLatido {
  abstract leer(): Promise<EstadoDelTrabajador>;
}

export class LectorDelLatidoRedis extends LectorDelLatido {
  private conexion: Redis | null = null;

  constructor(private readonly url: string) {
    super();
  }

  async leer(): Promise<EstadoDelTrabajador> {
    try {
      this.conexion ??= this.abrir();
      const crudo = await this.conexion.get(CLAVE_DEL_LATIDO);
      if (crudo === null) return { estado: 'sin_latido' };
      const { en } = JSON.parse(crudo) as { en?: unknown };
      const marca = typeof en === 'string' ? Date.parse(en) : Number.NaN;
      if (Number.isNaN(marca)) return { estado: 'sin_verificar' };
      return estadoPorEdad((Date.now() - marca) / 1000);
    } catch {
      return { estado: 'sin_verificar' };
    }
  }

  private abrir(): Redis {
    const r = new Redis(this.url, { maxRetriesPerRequest: 1, commandTimeout: 2_000 });
    r.on('error', () => undefined);
    return r;
  }
}

export function estadoPorEdad(edadS: number): EstadoDelTrabajador {
  const edadSegundos = Math.max(0, Math.round(edadS));
  return edadSegundos > LATIDO_VIEJO_TRAS_S
    ? { estado: 'viejo', edadSegundos }
    : { estado: 'ok', edadSegundos };
}

/** El latido solo se exige donde hay trabajador aparte: Redis configurado y modo `escalado`. */
export function seExigeElLatido(entorno: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(entorno['REDIS_URL']) && entorno['MODO_DESPLIEGUE'] !== 'unico';
}
