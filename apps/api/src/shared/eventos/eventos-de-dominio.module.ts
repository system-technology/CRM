import { Global, Module } from '@nestjs/common';
import { PuertoAvisoDeEventosDeDominio } from '../puertos/puertos-de-eventos-de-dominio.js';
import { PlanificadorDeDespacho } from './planificador-de-despacho.js';
import { RegistroDeConsumidores } from './registro-de-consumidores.js';

/**
 * El despacho de eventos de dominio a sus consumidores (ADR-0024 §1). Global, como los puertos:
 * los productores inyectan `PuertoAvisoDeEventosDeDominio` y los consumidores el registro, sin
 * importarse entre sí (R4).
 *
 * Solo lo importa `AppModule` (el contenedor de la API, en `unico` y en `escalado`): ningún módulo
 * del trabajador, que no puede construir `PrismaService`.
 */
@Global()
@Module({
  providers: [
    RegistroDeConsumidores,
    PlanificadorDeDespacho,
    { provide: PuertoAvisoDeEventosDeDominio, useExisting: PlanificadorDeDespacho },
  ],
  exports: [RegistroDeConsumidores, PlanificadorDeDespacho, PuertoAvisoDeEventosDeDominio],
})
export class EventosDeDominioModule {}
