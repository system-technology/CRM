/**
 * Logger JSON propio para Nest (T-203). Una línea por evento, a stdout, con `tenant_id`, `trace_id`
 * y `user_id` tomados de `ContextoTenant` (el middleware de tenant ya fija `trazaId` desde
 * `x-request-id`). Sin dependencia nueva: Nest ya llama a `LoggerService` en todo el código
 * (`new Logger(X).warn(...)`), así que basta con instalarlo con `app.useLogger(...)`.
 *
 * Fuera de una petición (arranque, barrido) los tres campos salen `null`: es honesto, no un fallo.
 * Todo pasa por `redactarValor`: ver `redaccion.ts` y R10.
 */
import type { LoggerService } from '@nestjs/common';
import { ContextoTenant } from '../tenant/contexto-tenant.js';
import { redactarTexto, redactarValor } from './redaccion.js';

type Nivel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
const ORDEN: Record<Nivel, number> = { fatal: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 };

export type Salida = (linea: string) => void;

export class LoggerJson implements LoggerService {
  private readonly umbral: number;

  constructor(
    private readonly salida: Salida = (l) => void process.stdout.write(`${l}\n`),
    nivelMinimo: string = process.env['LOG_LEVEL'] ?? 'info',
  ) {
    this.umbral = ORDEN[nivelMinimo as Nivel] ?? ORDEN.info;
  }

  log(mensaje: unknown, ...resto: unknown[]): void {
    this.emitir('info', mensaje, resto);
  }
  error(mensaje: unknown, ...resto: unknown[]): void {
    this.emitir('error', mensaje, resto);
  }
  warn(mensaje: unknown, ...resto: unknown[]): void {
    this.emitir('warn', mensaje, resto);
  }
  debug(mensaje: unknown, ...resto: unknown[]): void {
    this.emitir('debug', mensaje, resto);
  }
  verbose(mensaje: unknown, ...resto: unknown[]): void {
    this.emitir('trace', mensaje, resto);
  }
  fatal(mensaje: unknown, ...resto: unknown[]): void {
    this.emitir('fatal', mensaje, resto);
  }

  private emitir(nivel: Nivel, mensaje: unknown, resto: unknown[]): void {
    if (ORDEN[nivel] > this.umbral) return;
    // Convención de Nest: el último argumento de tipo cadena es el contexto (nombre de la clase).
    let contexto: string | null = null;
    const datos = [...resto];
    if (datos.length > 0 && typeof datos[datos.length - 1] === 'string') {
      contexto = datos.pop() as string;
    }
    const ctx = ContextoTenant.obtenerONulo();
    const registro: Record<string, unknown> = {
      level: nivel,
      time: new Date().toISOString(),
      context: contexto,
      tenant_id: ctx?.tenantId ?? null,
      trace_id: ctx?.trazaId ?? null,
      user_id: ctx?.usuarioId ?? null,
      msg: typeof mensaje === 'string' ? redactarTexto(mensaje) : redactarValor(mensaje),
    };
    if (datos.length > 0) registro['data'] = datos.map((d) => redactarValor(d));
    try {
      this.salida(JSON.stringify(registro));
    } catch {
      // Un log que no se puede serializar no debe tumbar la petición.
      this.salida(
        JSON.stringify({ level: 'error', time: registro['time'], msg: 'log no serializable' }),
      );
    }
  }
}
