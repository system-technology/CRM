/**
 * Abrir el archivo de viaje de una cotización aceptada (ADR-0024 §3.1). Lo invoca el consumidor
 * `booking.abrir_archivo` DENTRO de la transacción del despachador.
 *
 * Pide la versión aceptada a `quoting` por un puerto (R4: no lo importa) con el `tenantId` de la
 * FILA del outbox, no del payload; si no existe en esa agencia, lanza un error tipado (el
 * despachador reintenta y a los 10 abandona). Idempotente: una cotización abre un solo archivo.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { CotizacionAceptadaV1 } from '@viajapro/contracts';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import { PuertoVersionAceptada } from '../../../shared/puertos/puertos-hacia-quoting.js';
import { abrirArchivoDeViaje } from '../domain/archivo-de-viaje.js';
import { VersionAceptadaNoEncontradaError } from '../domain/errors.js';
import { RepositorioDeArchivos, type ResultadoDeApertura } from './puertos-de-archivos.js';

@Injectable()
export class AbrirArchivoDeViajeUseCase {
  // `@Inject` explícito: sin él, bajo `tsx`, Nest construye esto con cero dependencias.
  constructor(
    @Inject(PuertoVersionAceptada) private readonly versiones: PuertoVersionAceptada,
    @Inject(RepositorioDeArchivos) private readonly archivos: RepositorioDeArchivos,
  ) {}

  async ejecutar(
    tx: ClienteTenant,
    tenantId: string,
    evento: CotizacionAceptadaV1,
  ): Promise<ResultadoDeApertura> {
    const aceptada = await this.versiones.leer(tx, tenantId, evento.cotizacionId, evento.version);
    if (!aceptada) throw new VersionAceptadaNoEncontradaError(evento.cotizacionId, evento.version);

    return this.archivos.abrir(tx, tenantId, abrirArchivoDeViaje(aceptada));
  }
}
