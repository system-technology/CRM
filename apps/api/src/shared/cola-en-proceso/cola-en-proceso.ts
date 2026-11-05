/**
 * Una cola de trabajos DENTRO del proceso, para el modo `unico` (ADR-0019 §1.2). Sin Redis.
 *
 * Lo que da: despacho inmediato, un tope de trabajos a la vez, reintentos con espera exponencial,
 * deduplicación por clave mientras el trabajo está vivo y cierre ordenado.
 *
 * Lo que NO da: durabilidad. Un reinicio pierde lo que esperaba reintento. Cada uso lo compensa a
 * su manera: los changes viven `PENDIENTE` en la base y los recupera el barrido; el correo se
 * acepta perdido (ADR-0019 §3, punto 4).
 *
 * **No registra nada.** Los datos pueden llevar PII o secretos; quien la usa decide qué se dice,
 * por los ganchos `alFallar` y `alAgotar`, que reciben la clave y el error pero nunca el dato.
 *
 * **Aislamiento de contexto asíncrono (C3 de la auditoría de #211).** Un trabajo se despacha desde
 * quien lo encola (una petición HTTP, un temporizador) y heredaría su `AsyncLocalStorage`: el
 * tenant, el usuario o la traza de OTRA ejecución. Cada trabajo corre, en cambio, en el contexto
 * capturado cuando se CONSTRUYÓ la cola (el arranque del proceso), que no lleva nada. La cola se
 * construye al arrancar, nunca dentro de una petición.
 */
import { AsyncResource } from 'node:async_hooks';

export interface ContextoDeIntento {
  /** 1 para el primer intento. */
  intento: number;
  /** `true` si, de fallar, ya no se vuelve a intentar. */
  ultimoIntento: boolean;
}

export interface OpcionesDeColaEnProceso<T> {
  /** Cuántos trabajos a la vez, como mucho. */
  concurrencia: number;
  /** Intentos totales, el primero incluido. */
  intentos: number;
  /** La espera tras el intento n es `esperaBaseMs * 2^(n-1)`. */
  esperaBaseMs: number;
  /** Si devuelve `true`, el error no se reintenta. */
  esDefinitivo?: ((error: unknown) => boolean) | undefined;
  /** Tras un intento fallido (reintentable o no). */
  alFallar?: ((clave: string, contexto: ContextoDeIntento, error: unknown) => void) | undefined;
  /** El trabajo se dio por perdido: agotó los intentos o el error era definitivo. */
  alAgotar?: ((clave: string, dato: T, error: unknown) => void) | undefined;
  /**
   * Cuánto se recuerda la clave de un trabajo que TERMINÓ bien, para no repetirlo si lo piden de
   * nuevo (el correo). 0 = se olvida al terminar.
   */
  recordarExitosMs?: number | undefined;
  /** Tope de claves recordadas; las más antiguas se olvidan primero. */
  maxRecordadas?: number | undefined;
}

export type Procesador<T> = (dato: T, contexto: ContextoDeIntento) => Promise<void>;

interface Entrada<T> {
  clave: string;
  dato: T;
  intentosHechos: number;
}

export class ColaEnProceso<T> {
  private procesar: Procesador<T> | null;
  private readonly vivas = new Set<string>();
  private readonly esperando: Entrada<T>[] = [];
  private readonly activos = new Map<number, { clave: string; corrida: Promise<void> }>();
  private contador = 0;
  private readonly reintentos = new Map<string, NodeJS.Timeout>();
  private readonly recordadas = new Map<string, number>();
  private cerrada = false;
  /** Ejecuta una función en el contexto asíncrono de la construcción de la cola (C3). */
  private readonly aislar: (fn: () => Promise<void>) => Promise<void> = AsyncResource.bind(
    (fn: () => Promise<void>) => fn(),
  );

  constructor(
    private readonly opciones: OpcionesDeColaEnProceso<T>,
    procesar: Procesador<T> | null = null,
  ) {
    if (opciones.concurrencia < 1 || opciones.intentos < 1 || opciones.esperaBaseMs < 0) {
      throw new RangeError('Opciones de cola inválidas.');
    }
    this.procesar = procesar;
  }

  /**
   * Conecta quien procesa. Puede ocurrir después de encolar: lo encolado antes espera. Sirve
   * cuando el productor y el consumidor viven en contenedores de inyección distintos.
   */
  conectar(procesar: Procesador<T>): void {
    this.procesar = procesar;
    this.bombear();
  }

  /** `true` si el trabajo está esperando, en curso o esperando un reintento. */
  estaViva(clave: string): boolean {
    return this.vivas.has(clave);
  }

  /** Cuántos trabajos hay vivos. */
  get pendientes(): number {
    return this.vivas.size;
  }

  /**
   * Deja un trabajo. Devuelve `false` si no se aceptó: ya estaba vivo, ya terminó y se recuerda, o
   * la cola está cerrada. Nunca lanza ni espera al trabajo.
   */
  encolar(clave: string, dato: T): boolean {
    if (this.cerrada) return false;
    if (this.vivas.has(clave) || this.recuerda(clave)) return false;
    this.vivas.add(clave);
    this.esperando.push({ clave, dato, intentosHechos: 0 });
    this.bombear();
    return true;
  }

  /**
   * Cierre ordenado: no acepta más, descarta los reintentos y lo que esperaba turno, y espera a
   * que terminen los trabajos en curso (hasta `esperaMaximaMs`). Devuelve cuántos trabajos
   * quedaron sin terminar.
   */
  async cerrar(esperaMaximaMs = 10_000): Promise<number> {
    this.cerrada = true;
    for (const t of this.reintentos.values()) clearTimeout(t);
    let sinHacer = this.reintentos.size + this.esperando.length;
    this.reintentos.clear();
    this.esperando.length = 0;
    const enCurso = new Set([...this.activos.values()].map((a) => a.clave));
    for (const clave of [...this.vivas]) if (!enCurso.has(clave)) this.vivas.delete(clave);

    if (this.activos.size > 0) {
      let reloj: NodeJS.Timeout | undefined;
      const limite = new Promise<void>((resolver) => {
        reloj = setTimeout(resolver, esperaMaximaMs);
      });
      await Promise.race([
        Promise.allSettled([...this.activos.values()].map((a) => a.corrida)),
        limite,
      ]);
      if (reloj) clearTimeout(reloj);
      sinHacer += this.activos.size;
    }
    return sinHacer;
  }

  private bombear(): void {
    if (this.cerrada || !this.procesar) return;
    while (this.activos.size < this.opciones.concurrencia) {
      const entrada = this.esperando.shift();
      if (!entrada) return;
      const id = ++this.contador;
      const corrida = this.aislar(() => this.correr(entrada)).finally(() => {
        this.activos.delete(id);
        this.bombear();
      });
      this.activos.set(id, { clave: entrada.clave, corrida });
    }
  }

  private async correr(entrada: Entrada<T>): Promise<void> {
    const procesar = this.procesar;
    if (!procesar) return;
    const intento = entrada.intentosHechos + 1;
    const ultimoIntento = intento >= this.opciones.intentos;
    try {
      await procesar(entrada.dato, { intento, ultimoIntento });
      this.terminar(entrada.clave, true);
    } catch (error) {
      entrada.intentosHechos = intento;
      this.opciones.alFallar?.(entrada.clave, { intento, ultimoIntento }, error);
      const definitivo = this.opciones.esDefinitivo?.(error) === true;
      if (definitivo || ultimoIntento) {
        this.terminar(entrada.clave, false);
        this.opciones.alAgotar?.(entrada.clave, entrada.dato, error);
        return;
      }
      this.programarReintento(entrada);
    }
  }

  private programarReintento(entrada: Entrada<T>): void {
    if (this.cerrada) {
      this.vivas.delete(entrada.clave);
      return;
    }
    const espera = this.opciones.esperaBaseMs * 2 ** (entrada.intentosHechos - 1);
    const temporizador = setTimeout(() => {
      this.reintentos.delete(entrada.clave);
      this.esperando.push(entrada);
      this.bombear();
    }, espera);
    // Un reintento pendiente no debe retener un proceso que ya se está cerrando.
    temporizador.unref();
    this.reintentos.set(entrada.clave, temporizador);
  }

  private terminar(clave: string, exito: boolean): void {
    this.vivas.delete(clave);
    const retener = this.opciones.recordarExitosMs ?? 0;
    if (!exito || retener <= 0) return;
    this.recordadas.set(clave, Date.now() + retener);
    const tope = this.opciones.maxRecordadas ?? 10_000;
    while (this.recordadas.size > tope) {
      const masAntigua = this.recordadas.keys().next().value;
      if (masAntigua === undefined) break;
      this.recordadas.delete(masAntigua);
    }
  }

  private recuerda(clave: string): boolean {
    const hasta = this.recordadas.get(clave);
    if (hasta === undefined) return false;
    if (hasta > Date.now()) return true;
    this.recordadas.delete(clave);
    return false;
  }
}
