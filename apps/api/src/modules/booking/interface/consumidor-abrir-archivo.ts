/**
 * `booking.abrir_archivo`: el consumidor de `quoting.cotizacion_aceptada` (ADR-0024 §3.1).
 *
 * Se registra en el despachador del contenedor de la API desde `onModuleInit`; el despachador le
 * entrega cada evento dentro de SU transacción (con `app.current_tenant` ya fijado a
 * `outbox.tenant_id`). Aquí solo se valida la forma del evento con el esquema compartido de
 * `@viajapro/contracts` y se llama al caso de uso.
 */
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { CotizacionAceptadaV1, TIPO_COTIZACION_ACEPTADA } from '@viajapro/contracts';
import type {
  ConsumidorDeEventos,
  EventoEntregado,
} from '../../../shared/eventos/consumidor-de-eventos.js';
import { RegistroDeConsumidores } from '../../../shared/eventos/registro-de-consumidores.js';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import { AbrirArchivoDeViajeUseCase } from '../application/abrir-archivo-de-viaje.use-case.js';
import { EventoDeAceptacionInvalidoError } from '../domain/errors.js';

export const CONSUMIDOR_ABRIR_ARCHIVO = 'booking.abrir_archivo';

@Injectable()
export class ConsumidorAbrirArchivo implements ConsumidorDeEventos, OnModuleInit {
  readonly nombre = CONSUMIDOR_ABRIR_ARCHIVO;
  readonly tipoEvento = TIPO_COTIZACION_ACEPTADA;

  constructor(
    @Inject(AbrirArchivoDeViajeUseCase) private readonly abrir: AbrirArchivoDeViajeUseCase,
    @Inject(RegistroDeConsumidores) private readonly registro: RegistroDeConsumidores,
  ) {}

  onModuleInit(): void {
    this.registro.registrar(this);
  }

  async consumir(tx: ClienteTenant, evento: EventoEntregado): Promise<void> {
    const payload = CotizacionAceptadaV1.safeParse(evento.payload);
    if (!payload.success) {
      // Solo el motivo estructural, nunca los valores.
      throw new EventoDeAceptacionInvalidoError(
        payload.error.issues.map((i) => i.path.join('.')).join(', '),
      );
    }
    // El agregado del outbox y la cotización del payload deben ser la misma.
    if (payload.data.cotizacionId !== evento.agregadoId) {
      throw new EventoDeAceptacionInvalidoError('cotizacionId no coincide con el agregado');
    }
    // El tenant es el de la FILA del outbox, no el del payload (que no lo trae).
    await this.abrir.ejecutar(tx, evento.tenantId, payload.data);
  }
}
