import { Module } from '@nestjs/common';
import { LeerCobroUseCase } from './application/leer-cobro.use-case.js';
import { PlazosYParametrosUseCase } from './application/plazos-y-parametros.use-case.js';
import { RepositorioDeCobros } from './application/puertos-de-cobro.js';
import { RegistrarMovimientoUseCase } from './application/registrar-movimiento.use-case.js';
import { RepositorioDeCobrosPrisma } from './infrastructure/cobros.prisma.js';
import { CobrosController, PagosDeArchivoController } from './interface/cobros.controller.js';

/**
 * Contexto de cobros (`payments`, ADR-0034): el libro de movimientos de cobro del viajero, su saldo
 * y la vista «quién pagó y quién debe».
 *
 * No importa ningún otro módulo de negocio (R4). Lee el archivo de viaje por `PuertoArchivoParaCobro`
 * (token en `shared/puertos/`, implementado por `BookingPuertosModule`, que es `@Global()`). Solo se
 * carga en el contenedor de la API (`AppModule`): necesita `viajapro_app`, y el trabajador no puede
 * construir `PrismaService`. Sin consumidores de eventos en el MVP (los escribe al outbox, ADR-0034 §7).
 */
@Module({
  controllers: [PagosDeArchivoController, CobrosController],
  providers: [
    { provide: RepositorioDeCobros, useClass: RepositorioDeCobrosPrisma },
    LeerCobroUseCase,
    RegistrarMovimientoUseCase,
    PlazosYParametrosUseCase,
  ],
})
export class PaymentsModule {}
