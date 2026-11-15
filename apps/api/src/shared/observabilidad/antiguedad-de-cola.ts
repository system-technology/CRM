/**
 * Antigüedad del trabajo pendiente más viejo (T-203). «Una cola que crece es el primer síntoma de
 * todo»: esto convierte ese síntoma en un campo de `/salud/listo` que un monitor externo puede mirar.
 *
 * **Por qué lo mide el trabajador y no la API.** La API no puede (ni debe) ver entre agencias: usa
 * `viajapro_app`, bajo RLS, y no puede construir `PrismaWebhookService`. El trabajador SÍ tiene el
 * rol `viajapro_webhook` y la función `listar_changes_pendientes`, que devuelve solo identificadores
 * y antigüedad (nunca payload ni tenant). El trabajador publica el resultado en Redis con caducidad
 * y la API lo lee, igual que el latido (T-194). Sin migración, sin tabla, sin rol nuevo.
 *
 * Alcance: la cola de ENTRADA (webhooks de Meta recibidos y sin procesar). Los envíos salientes
 * pendientes viven en `mensajes` bajo RLS; medirlos entre agencias exige una función
 * `SECURITY DEFINER` nueva (migración): ver la cola de `roadmap/tasks.yaml`.
 */
import { Redis } from 'ioredis';

export const CLAVE_DE_COLA = 'viajapro:cola:antiguedad';
export const INTERVALO_DE_MEDICION_S = 30;
const CADUCIDAD_S = 120;
/** Por encima de esto, la cola se considera atascada. Configurable con `COLA_ALERTA_MIN`. */
export const UMBRAL_POR_DEFECTO_MIN = 5;
/** `listar_changes_pendientes` acepta 1..1000: con tope, «pendientes» significa «al menos». */
const LIMITE_DE_LECTURA = 1000;

export type EstadoDeCola =
  | { estado: 'ok'; masViejaS: number; pendientes: number }
  | { estado: 'atascada'; masViejaS: number; pendientes: number; umbralMin: number }
  | { estado: 'sin_verificar' };

export abstract class LectorDeCola {
  abstract leer(): Promise<EstadoDeCola>;
}

/** Lo único que el medidor necesita de la base: el pool del trabajador. */
export interface ClienteDeMedicion {
  $queryRaw<T = unknown>(consulta: TemplateStringsArray, ...valores: unknown[]): Promise<T>;
}

export function umbralDeColaMin(entorno: NodeJS.ProcessEnv = process.env): number {
  const n = Number(entorno['COLA_ALERTA_MIN']);
  return Number.isFinite(n) && n > 0 ? n : UMBRAL_POR_DEFECTO_MIN;
}

export function estadoDeCola(
  masViejaS: number,
  pendientes: number,
  umbralMin: number,
): EstadoDeCola {
  return masViejaS > umbralMin * 60
    ? { estado: 'atascada', masViejaS, pendientes, umbralMin }
    : { estado: 'ok', masViejaS, pendientes };
}

/** Lado trabajador. Nunca lanza: una medición perdida se ve en la API como `sin_verificar`. */
export class MedidorDeCola {
  private readonly conexion: Redis;
  private temporizador: NodeJS.Timeout | null = null;

  constructor(
    url: string,
    private readonly prisma: ClienteDeMedicion,
    private readonly registrar: (mensaje: string) => void = () => undefined,
  ) {
    this.conexion = new Redis(url, { maxRetriesPerRequest: 1 });
    this.conexion.on('error', () => undefined);
  }

  async iniciar(): Promise<void> {
    await this.medir();
    this.temporizador = setInterval(() => void this.medir(), INTERVALO_DE_MEDICION_S * 1000);
    this.temporizador.unref();
  }

  async medir(): Promise<void> {
    try {
      // Antigüedad mínima 0 y tope de intentos máximo: queremos TODO lo pendiente, también lo que
      // el barrido ya abandonó (eso es justo lo que más importa ver).
      const filas = await this.prisma.$queryRaw<Array<{ antiguedad_s: number }>>`
        SELECT antiguedad_s
          FROM public.listar_changes_pendientes(0::integer, ${LIMITE_DE_LECTURA}::integer, 32767::integer)`;
      const masViejaS = filas.reduce((m, f) => Math.max(m, f.antiguedad_s), 0);
      await this.conexion.set(
        CLAVE_DE_COLA,
        JSON.stringify({ en: new Date().toISOString(), masViejaS, pendientes: filas.length }),
        'EX',
        CADUCIDAD_S,
      );
    } catch {
      // Solo el hecho: el mensaje de un error de Redis puede traer la URL con su clave.
      this.registrar('No se pudo medir la antigüedad de la cola; se reintenta.');
    }
  }

  detener(): Promise<void> {
    if (this.temporizador) clearInterval(this.temporizador);
    this.conexion.disconnect();
    return Promise.resolve();
  }
}

/** Lado API: lo que lee `/salud/listo`. */
export class LectorDeColaRedis extends LectorDeCola {
  private conexion: Redis | null = null;

  constructor(
    private readonly url: string,
    private readonly umbralMin: number = umbralDeColaMin(),
  ) {
    super();
  }

  async leer(): Promise<EstadoDeCola> {
    try {
      this.conexion ??= this.abrir();
      const crudo = await this.conexion.get(CLAVE_DE_COLA);
      // Sin clave: el trabajador no midió en 2 min (o nunca). El latido ya avisa de ese caso.
      if (crudo === null) return { estado: 'sin_verificar' };
      const v = JSON.parse(crudo) as { masViejaS?: unknown; pendientes?: unknown };
      if (typeof v.masViejaS !== 'number' || typeof v.pendientes !== 'number') {
        return { estado: 'sin_verificar' };
      }
      return estadoDeCola(v.masViejaS, v.pendientes, this.umbralMin);
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
