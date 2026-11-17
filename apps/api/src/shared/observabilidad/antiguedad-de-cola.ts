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
 * Dos colas, medidas por separado (una no tumba la medida de la otra):
 *   - ENTRADA: webhooks de Meta recibidos y sin procesar (`listar_changes_pendientes`).
 *   - SALIDA (T-223): envíos salientes pendientes, sin wamid. Viven en `mensajes` bajo RLS; los
 *     mide `medir_cola_de_salida()` (migración 20261115140000), `SECURITY DEFINER` que suma todas
 *     las agencias y devuelve solo dos enteros (antigüedad y conteo), ni ids ni tenant ni texto.
 */
import { Redis } from 'ioredis';

export const CLAVE_DE_COLA = 'viajapro:cola:antiguedad';
/** T-223: la de salida, aparte, con la misma forma y la misma caducidad. */
export const CLAVE_DE_COLA_DE_SALIDA = 'viajapro:cola-salida:antiguedad';
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
  /** La cola de entrada (webhooks sin procesar). */
  abstract leer(): Promise<EstadoDeCola>;
  /** T-223: la cola de salida (envíos pendientes sin wamid). */
  abstract leerSalida(): Promise<EstadoDeCola>;
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

  /** Las dos colas, cada una por su lado: si falla una, la otra se publica igual. */
  async medir(): Promise<void> {
    await Promise.all([this.medirEntrada(), this.medirSalida()]);
  }

  private async medirEntrada(): Promise<void> {
    try {
      // Antigüedad mínima 0 y tope de intentos máximo: queremos TODO lo pendiente, también lo que
      // el barrido ya abandonó (eso es justo lo que más importa ver).
      const filas = await this.prisma.$queryRaw<Array<{ antiguedad_s: number }>>`
        SELECT antiguedad_s
          FROM public.listar_changes_pendientes(0::integer, ${LIMITE_DE_LECTURA}::integer, 32767::integer)`;
      const masViejaS = filas.reduce((m, f) => Math.max(m, f.antiguedad_s), 0);
      await this.publicar(CLAVE_DE_COLA, masViejaS, filas.length);
    } catch {
      // Solo el hecho: el mensaje de un error de Redis puede traer la URL con su clave.
      this.registrar('No se pudo medir la antigüedad de la cola; se reintenta.');
    }
  }

  private async medirSalida(): Promise<void> {
    try {
      const [fila] = await this.prisma.$queryRaw<
        Array<{ mas_vieja_s: number; pendientes: number }>
      >`
        SELECT mas_vieja_s, pendientes FROM public.medir_cola_de_salida()`;
      if (!fila) throw new Error('medir_cola_de_salida no devolvió fila');
      await this.publicar(
        CLAVE_DE_COLA_DE_SALIDA,
        Number(fila.mas_vieja_s),
        Number(fila.pendientes),
      );
    } catch {
      // Sin la migración 20261115140000 la función no existe: la API lo verá `sin_verificar`.
      this.registrar('No se pudo medir la antigüedad de la cola de salida; se reintenta.');
    }
  }

  private async publicar(clave: string, masViejaS: number, pendientes: number): Promise<void> {
    await this.conexion.set(
      clave,
      JSON.stringify({ en: new Date().toISOString(), masViejaS, pendientes }),
      'EX',
      CADUCIDAD_S,
    );
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

  leer(): Promise<EstadoDeCola> {
    return this.leerClave(CLAVE_DE_COLA);
  }

  leerSalida(): Promise<EstadoDeCola> {
    return this.leerClave(CLAVE_DE_COLA_DE_SALIDA);
  }

  private async leerClave(clave: string): Promise<EstadoDeCola> {
    try {
      this.conexion ??= this.abrir();
      const crudo = await this.conexion.get(clave);
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
