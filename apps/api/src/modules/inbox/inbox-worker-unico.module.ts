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
import {
  PuertoColaDeEnvios,
  PuertoEnviosSinResolver,
  PuertoReservaDeEnvio,
} from './application/puertos-de-envio.js';
import { RecuperarEnviosSinResolver } from './application/recuperar-envios-sin-resolver.js';
import { PrismaWebhookService } from '../../shared/prisma/prisma-webhook.service.js';
import { BarridoEnProceso } from './infrastructure/barrido.en-proceso.js';
import { ColaDeChangesEnProceso } from './infrastructure/cola-de-changes.en-proceso.js';
import { ColaDeEnviosPostgres } from './infrastructure/cola-de-envios.postgres.js';
import { ReservaDeEnvioPostgres } from './infrastructure/reserva-de-envio.postgres.js';
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
        // Envíos sobre Postgres (ADR-0019 §1.2): reclamo con arrendamiento y reserva durable en la
        // fila del mensaje, bajo RLS y con el pool del trabajador.
        {
          provide: ColaDeEnviosPostgres,
          useFactory: (prisma: PrismaWebhookService): ColaDeEnviosPostgres => {
            const log = new Logger('ColaDeEnviosPostgres');
            return new ColaDeEnviosPostgres(prisma, (clave, contexto, error) =>
              // Clase y código, nunca el mensaje: puede traer el número del viajero (R10).
              log.error(
                `Envío ${clave.slice(0, 14)} falló (intento ${contexto.intento}): ${sanearErrorDeEnvio(error).codigo}`,
              ),
            );
          },
          inject: [PrismaWebhookService],
        },
        { provide: PuertoColaDeEnvios, useExisting: ColaDeEnviosPostgres },
        { provide: PuertoEnviosSinResolver, useExisting: ColaDeEnviosPostgres },
        { provide: PuertoReservaDeEnvio, useClass: ReservaDeEnvioPostgres },
        RecuperarEnviosSinResolver,
        ConsumidorDeEnviosEnProceso,
      ],
    };
  }
}
