/**
 * Los cuatro consumidores de `notifications` del despachador (ADR-0024 §1): uno por tipo de evento
 * de aviso de plazo (`booking.time_limit_proximo|vencido`, `booking.pago_total_proximo|vencido`).
 * No importa `booking` (R4): comparte con él solo el esquema `AvisoDePlazoV1` de contracts.
 *
 * Cada uno corre DENTRO de la transacción del despachador (tenant fijado a `outbox.tenant_id`, que
 * es el único tenant que se usa: el payload no lo trae). Si el evento no tiene la forma esperada o
 * el archivo no existe, lanza un error tipado: el despachador revierte, cuenta el intento y a los 10
 * abandona.
 */
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { AvisoDePlazoV1 } from '@viajapro/contracts';
import type {
  ConsumidorDeEventos,
  EventoEntregado,
} from '../../../shared/eventos/consumidor-de-eventos.js';
import { RegistroDeConsumidores } from '../../../shared/eventos/registro-de-consumidores.js';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import { RegistrarAvisoDePlazoUseCase } from '../application/registrar-aviso-de-plazo.use-case.js';
import { AVISOS_DE_PLAZO, type TipoDeAvisoDePlazo } from '../domain/aviso-de-plazo.js';
import { EventoDeAvisoInvalidoError } from '../domain/errors-de-avisos.js';

const log = new Logger('AvisosDePlazo');

export function crearConsumidorDeAviso(
  tipo: TipoDeAvisoDePlazo,
  registrar: RegistrarAvisoDePlazoUseCase,
): ConsumidorDeEventos {
  return {
    nombre: tipo.consumidor,
    tipoEvento: tipo.tipoEvento,
    async consumir(tx: ClienteTenant, evento: EventoEntregado): Promise<void> {
      const payload = AvisoDePlazoV1.safeParse(evento.payload);
      if (!payload.success) {
        // Solo el motivo estructural, nunca los valores.
        throw new EventoDeAvisoInvalidoError(
          payload.error.issues.map((i) => i.path.join('.')).join(', '),
        );
      }
      // El agregado del outbox es la reserva (ver `eventoDeAvisoDePlazo` de booking).
      if (payload.data.reservaId !== evento.agregadoId) {
        throw new EventoDeAvisoInvalidoError('reservaId no coincide con el agregado');
      }
      const r = await registrar.ejecutar(tx, evento.tenantId, evento.outboxId, tipo, payload.data);
      if (r.destinatarios === 0) {
        // Sin PII: solo el recuento. La pantalla Reservas sigue mostrando el semáforo.
        log.warn(`Aviso ${tipo.tipo} sin destinatarios: nadie activo puede operar archivos.`);
      }
    },
  };
}

@Injectable()
export class ConsumidoresDeAvisosDePlazo implements OnModuleInit {
  constructor(
    @Inject(RegistrarAvisoDePlazoUseCase) private readonly registrar: RegistrarAvisoDePlazoUseCase,
    @Inject(RegistroDeConsumidores) private readonly registro: RegistroDeConsumidores,
  ) {}

  onModuleInit(): void {
    for (const tipo of AVISOS_DE_PLAZO) {
      this.registro.registrar(crearConsumidorDeAviso(tipo, this.registrar));
    }
  }
}
