/**
 * Quién despierta a los despachadores (ADR-0024 §1). Vive en `AppModule`: el contenedor de la API
 * tanto en modo `unico` (sin Redis) como en `escalado`. Nunca en el trabajador.
 *
 *   · el camino normal es el AVISO en memoria: quien escribe el evento, ya confirmado, avisa de su
 *     agencia y se despacha enseguida;
 *   · la red es el barrido con `tenants_con_eventos_por_entregar`, una vez al ARRANCAR (lo que un
 *     reinicio dejó) y luego cada `DESPACHO_INTERVALO_MS` (60 min por defecto: como el barrido de
 *     seguridad del inbox, para no impedir que Neon se suspenda).
 *
 * Nunca lanza hacia fuera: un despacho fallido se registra y no tumba al proceso. Varias réplicas
 * pueden correrlo a la vez sin duplicar nada: el reclamo de cada entrega es atómico.
 */
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PuertoAvisoDeEventosDeDominio } from '../puertos/puertos-de-eventos-de-dominio.js';
import { codigoDeError, DespachadorDeConsumidor } from './despachador-de-consumidor.js';
import { RegistroDeConsumidores } from './registro-de-consumidores.js';

const POR_DEFECTO_MS = 60 * 60 * 1000;
const MINIMO_MS = 1_000;

/** `DESPACHO_INTERVALO_MS`: entero ≥ 1000. Ausente = 60 min; presente e inválido = no arranca. */
/**
 * `DESPACHO_BARRIDO`: `inerte` apaga el barrido al arrancar y el periódico; el aviso en memoria
 * sigue. Ausente = activo; otro valor = no arranca. Lo usan las e2e, que comparten base: el
 * barrido de un proceso de pruebas entregaría eventos de los fixtures de otro archivo.
 */
export function barridoDeDespachoActivo(entorno: Record<string, string | undefined>): boolean {
  const crudo = entorno['DESPACHO_BARRIDO'];
  if (crudo === undefined || crudo === '') return true;
  if (crudo === 'inerte') return false;
  throw new Error(`DESPACHO_BARRIDO='${crudo}' no es válido: solo 'inerte' o ausente.`);
}

export function intervaloDeDespacho(entorno: Record<string, string | undefined>): number {
  const crudo = entorno['DESPACHO_INTERVALO_MS'];
  if (crudo === undefined || crudo === '') return POR_DEFECTO_MS;
  const n = Number(crudo);
  if (!Number.isInteger(n) || n < MINIMO_MS) {
    throw new Error(`DESPACHO_INTERVALO_MS='${crudo}' no es válido: entero ≥ ${MINIMO_MS}.`);
  }
  return n;
}

@Injectable()
export class PlanificadorDeDespacho
  extends PuertoAvisoDeEventosDeDominio
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly log = new Logger(PlanificadorDeDespacho.name);
  private despachadores: DespachadorDeConsumidor[] = [];
  private temporizador: NodeJS.Timeout | null = null;
  private enCurso: Promise<void> | null = null;
  private cerrado = false;
  /** Avisos en vuelo por agencia; un aviso que llega mientras otro corre pide UNA repetición. */
  private readonly avisos = new Map<string, { corriendo: Promise<void>; repetir: boolean }>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RegistroDeConsumidores) private readonly registro: RegistroDeConsumidores,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    this.despachadores = this.registro
      .todos()
      .map((c) => new DespachadorDeConsumidor(this.prisma, c));
    if (this.despachadores.length === 0) return;
    if (!barridoDeDespachoActivo(process.env)) {
      this.log.log(
        'Barrido de eventos de dominio inerte (DESPACHO_BARRIDO=inerte): solo el aviso.',
      );
      return;
    }
    const intervalo = intervaloDeDespacho(process.env);
    this.temporizador = setInterval(() => void this.pasada(), intervalo);
    // El proceso lo retiene el servidor HTTP, no este temporizador.
    this.temporizador.unref();
    this.log.log(
      `Despacho de eventos de dominio (${this.despachadores.map((d) => d.nombre).join(', ')}) ` +
        `al arrancar y cada ${intervalo} ms.`,
    );
    void this.pasada();
  }

  /** La pista en memoria. No espera ni lanza. */
  avisar(tenantId: string): void {
    if (this.cerrado || this.despachadores.length === 0) return;
    const previo = this.avisos.get(tenantId);
    if (previo) {
      previo.repetir = true;
      return;
    }
    const estado = { corriendo: Promise.resolve(), repetir: false };
    estado.corriendo = this.despacharAvisado(tenantId, estado).finally(() => {
      this.avisos.delete(tenantId);
    });
    this.avisos.set(tenantId, estado);
  }

  private async despacharAvisado(tenantId: string, estado: { repetir: boolean }): Promise<void> {
    do {
      estado.repetir = false;
      for (const d of this.despachadores) {
        try {
          await d.despacharTenant(tenantId);
        } catch (error) {
          this.log.error(`El despacho avisado de ${d.nombre} falló (${codigoDeError(error)}).`);
        }
      }
    } while (estado.repetir && !this.cerrado);
  }

  /** Una pasada completa por todos los consumidores. Si ya hay una, no se apila otra. */
  pasada(): Promise<void> {
    if (this.cerrado) return Promise.resolve();
    if (this.enCurso) return this.enCurso;
    this.enCurso = this.correr().finally(() => {
      this.enCurso = null;
    });
    return this.enCurso;
  }

  private async correr(): Promise<void> {
    for (const d of this.despachadores) {
      try {
        await d.barrer();
      } catch (error) {
        this.log.error(`El barrido de ${d.nombre} falló (${codigoDeError(error)}).`);
      }
    }
  }

  /**
   * Deja de despachar y espera lo que está en vuelo. Es el cierre ordenado; también lo usan las
   * pruebas que quieren controlar a mano cuándo se despacha.
   */
  async detener(): Promise<void> {
    this.cerrado = true;
    if (this.temporizador) clearInterval(this.temporizador);
    this.temporizador = null;
    await this.enCurso;
    await Promise.all([...this.avisos.values()].map((a) => a.corriendo));
  }

  async onModuleDestroy(): Promise<void> {
    await this.detener();
  }
}
