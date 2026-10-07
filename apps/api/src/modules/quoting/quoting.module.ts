import { Module } from '@nestjs/common';
import { CotizarPaqueteUseCase } from './application/cotizar-paquete.use-case.js';
import { ListarPaquetesUseCase } from './application/listar-paquetes.use-case.js';
import { CatalogoController } from './interface/catalogo.controller.js';

/**
 * Contexto de cotización: catálogo de paquetes y cálculo de precio.
 *
 * No importa ningún otro módulo de negocio. Cuando necesite algo de `crm` o `booking`,
 * será por evento de dominio o por un puerto declarado aquí. Regla R4.
 */
@Module({
  controllers: [CatalogoController],
  providers: [ListarPaquetesUseCase, CotizarPaqueteUseCase],
  exports: [CotizarPaqueteUseCase],
})
export class QuotingModule {}
