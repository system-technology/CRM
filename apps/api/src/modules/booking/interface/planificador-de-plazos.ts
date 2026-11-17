/**
 * Quién despierta a la vigilancia de plazos (ADR-0024 §3.6). Vive en `BookingModule`, que solo
 * carga `AppModule`: el contenedor de la API, en modo `unico` (sin Redis) y en `escalado`. Nunca en
 * el trabajador (el rol `viajapro_webhook` no toca las tablas de `booking`).
 *
 * Una pasada al ARRANCAR (lo que un reinicio dejó) y luego cada `PLAZOS_INTERVALO_MS` (60 min por
 * defecto: como el barrido del despachador, para no impedir que Neon se suspenda; el umbral es de
 * 24 h, así que una hora de resolución sobra). `PLAZOS_VIGILANCIA=inerte` la apaga (pruebas).
 *
 * Nunca lanza hacia fuera: una pasada fallida se registra y no tumba al proceso. Varias réplicas
 * pueden correrla a la vez sin duplicar nada: la marca de cada aviso se gana con
 * `UPDATE … WHERE aviso_… IS NULL`.
 */
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { VigilarPlazosUseCase } from '../application/vigilar-plazos.use-case.js';

const POR_DEFECTO_MS = 60 * 60 * 1000;
const MINIMO_MS = 1_000;

/** `PLAZOS_INTERVALO_MS`: entero ≥ 1000. Ausente = 60 min; presente e inválido = no arranca. */
export function intervaloDeVigilancia(entorno: Record<string, string | undefined>): number {
  const crudo = entorno['PLAZOS_INTERVALO_MS'];
  if (crudo === undefined || crudo === '') return POR_DEFECTO_MS;
  const n = Number(crudo);
  if (!Number.isInteger(n) || n < MINIMO_MS) {
    throw new Error(`PLAZOS_INTERVALO_MS='${crudo}' no es válido: entero ≥ ${MINIMO_MS}.`);
  }
  return n;
}

/** `PLAZOS_VIGILANCIA`: ausente = activa; `inerte` = apagada; cualquier otro valor no arranca. */
export function vigilanciaActiva(entorno: Record<string, string | undefined>): boolean {
  const crudo = entorno['PLAZOS_VIGILANCIA'];
  if (crudo === undefined || crudo === '') return true;
  if (crudo === 'inerte') return false;
  throw new Error(`PLAZOS_VIGILANCIA='${crudo}' no es válido: solo 'inerte' (o ausente).`);
}

@Injectable()
export class PlanificadorDePlazos implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(PlanificadorDePlazos.name);
  private temporizador: NodeJS.Timeout | null = null;
  private enCurso: Promise<void> | null = null;
  private cerrado = false;

  constructor(@Inject(VigilarPlazosUseCase) private readonly vigilar: VigilarPlazosUseCase) {}

  onApplicationBootstrap(): void {
    if (!vigilanciaActiva(process.env)) return;
    const intervalo = intervaloDeVigilancia(process.env);
    this.temporizador = setInterval(() => void this.pasada(), intervalo);
    // El proceso lo retiene el servidor HTTP, no este temporizador.
    this.temporizador.unref();
    this.log.log(`Vigilancia de plazos al arrancar y cada ${intervalo} ms.`);
    void this.pasada();
  }

  /** Una pasada. Si ya hay una en curso no se apila otra. Nunca lanza. */
  pasada(): Promise<void> {
    if (this.cerrado) return Promise.resolve();
    if (this.enCurso) return this.enCurso;
    this.enCurso = this.correr().finally(() => {
      this.enCurso = null;
    });
    return this.enCurso;
  }

  private async correr(): Promise<void> {
    try {
      await this.vigilar.ejecutar(new Date());
    } catch (error) {
      const clase = error instanceof Error ? error.constructor.name : 'ERROR_DESCONOCIDO';
      this.log.error(`La vigilancia de plazos falló (${clase}); se reintenta en la siguiente.`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.cerrado = true;
    if (this.temporizador) clearInterval(this.temporizador);
    this.temporizador = null;
    await this.enCurso;
  }
}
