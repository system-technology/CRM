/**
 * El contexto del TRABAJADOR del inbox en modo `unico` (ADR-0019 §1.1): el mismo caso de uso y los
 * mismos adaptadores de base de datos que `InboxWorkerModule`, pero con las colas, el bus y el
 * aviso al relay EN PROCESO y compartidos con el contexto HTTP. No necesita `REDIS_URL`.
 *
 * Sigue siendo un contenedor de inyección APARTE del HTTP: `PrismaWebhookService` solo existe aquí.
 */
import { type DynamicModule, Logger, Module } from '@nestjs/common';
import {
  PuertoCoordinacionDelBarrido,
  PuertoReencolador,
} from './application/puertos-de-barrido.js';
import {
  PuertoAvisoDeOutbox,
  PuertoPublicadorDeEventos,
} from './application/puertos-de-eventos.js';
import { PuertoColaDeEnvios, PuertoReservaDeEnvio } from './application/puertos-de-envio.js';
import { PrismaWebhookService } from '../../shared/prisma/prisma-webhook.service.js';
import { BarridoEnProceso } from './infrastructure/barrido.en-proceso.js';
import { ColaDeChangesEnProceso } from './infrastructure/cola-de-changes.en-proceso.js';
import {
  ColaDeEnviosEnMemoriaTemporal,
  ReservaDeEnvioEnMemoriaTemporal,
} from './infrastructure/cola-de-envios.en-memoria-temporal.js';
import {
  COMPARTIDO_DEL_INBOX,
  type CompartidoDelInbox,
} from './infrastructure/compartido-en-proceso.js';
import { PROVEEDORES_COMUNES_DEL_TRABAJADOR } from './inbox-worker-comun.js';
import {
  ConsumidorDeChangesEnProceso,
  ConsumidorDeEnviosEnProceso,
} from './interface/consumidores-en-proceso.js';
import { OPCIONES_DEL_RELAY, PlanificadorDeRelay } from './interface/planificador-de-relay.js';
import { sanearErrorDeEnvio } from './interface/consumidor-de-envios.js';
import { PlanificadorDeSeguridad } from './interface/planificador-de-seguridad.js';

@Module({})
export class InboxWorkerUnicoModule {
  static forRoot(compartido: CompartidoDelInbox): DynamicModule {
    return {
      module: InboxWorkerUnicoModule,
      providers: [
        ...PROVEEDORES_COMUNES_DEL_TRABAJADOR,
        { provide: COMPARTIDO_DEL_INBOX, useValue: compartido },
        { provide: PuertoAvisoDeOutbox, useValue: compartido.avisos },
        { provide: PuertoPublicadorDeEventos, useValue: compartido.bus },
        { provide: ColaDeChangesEnProceso, useValue: compartido.colaDeChanges },
        ConsumidorDeChangesEnProceso,
        {
          provide: BarridoEnProceso,
          useFactory: (cola: ColaDeChangesEnProceso, prisma: PrismaWebhookService) =>
            new BarridoEnProceso(cola, prisma),
          inject: [ColaDeChangesEnProceso, PrismaWebhookService],
        },
        { provide: PuertoReencolador, useExisting: BarridoEnProceso },
        { provide: PuertoCoordinacionDelBarrido, useExisting: BarridoEnProceso },
        // El relay solo atiende avisos; el barrido de 15 s lo sustituye el de seguridad.
        { provide: OPCIONES_DEL_RELAY, useValue: { barridoMs: 0 } },
        PlanificadorDeRelay,
        PlanificadorDeSeguridad,
        // TEMPORAL-PASO-4: envíos y reserva en memoria hasta la cola sobre Postgres.
        {
          provide: ColaDeEnviosEnMemoriaTemporal,
          useFactory: (): ColaDeEnviosEnMemoriaTemporal => {
            const log = new Logger('ColaDeEnviosEnMemoriaTemporal');
            return new ColaDeEnviosEnMemoriaTemporal((clave, contexto, error) =>
              // Clase y código, nunca el mensaje: puede traer el número del viajero (R10).
              log.error(
                `Envío ${clave.slice(0, 14)} falló (intento ${contexto.intento}): ${sanearErrorDeEnvio(error).codigo}`,
              ),
            );
          },
        },
        { provide: PuertoColaDeEnvios, useExisting: ColaDeEnviosEnMemoriaTemporal },
        { provide: PuertoReservaDeEnvio, useClass: ReservaDeEnvioEnMemoriaTemporal },
        ConsumidorDeEnviosEnProceso,
      ],
    };
  }
}
