import { Module } from '@nestjs/common';
import { CotizarPaqueteUseCase } from './application/cotizar-paquete.use-case.js';
import { CotizarSalidaUseCase } from './application/cotizar-salida.use-case.js';
import { ListarPaquetesUseCase } from './application/listar-paquetes.use-case.js';
import { ListarSalidasUseCase } from './application/listar-salidas.use-case.js';
import { CotizacionesUseCase } from './application/cotizaciones.use-case.js';
import { CotizacionesController } from './interface/cotizaciones.controller.js';
import { CatalogoController } from './interface/catalogo.controller.js';
import { SalidasController } from './interface/salidas.controller.js';

/**
 * Contexto de cotización: catálogo de paquetes y cálculo de precio.
 *
 * No importa ningún otro módulo de negocio. Cuando necesite algo de `crm` o `booking`,
 * será por evento de dominio o por un puerto declarado aquí. Regla R4.
 */
@Module({
  controllers: [CatalogoController, SalidasController, CotizacionesController],
  providers: [
    ListarPaquetesUseCase,
    CotizarPaqueteUseCase,
    ListarSalidasUseCase,
    CotizacionesUseCase,
    CotizarSalidaUseCase,
  ],
  exports: [CotizarPaqueteUseCase],
})
export class QuotingModule {}
