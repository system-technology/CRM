import { Module } from '@nestjs/common';
import { CotizarSalidaUseCase } from './application/cotizar-salida.use-case.js';
import { ListarPaquetesUseCase } from './application/listar-paquetes.use-case.js';
import { ListarSalidasUseCase } from './application/listar-salidas.use-case.js';
import { CotizacionesUseCase } from './application/cotizaciones.use-case.js';
import { AplicadorDeCatalogo } from './application/aplicador-de-catalogo.js';
import { UnidadDeTrabajoDeCatalogo } from './application/puertos-de-catalogo.js';
import { UnidadDeTrabajoDeCatalogoPrisma } from './infrastructure/catalogo.prisma.js';
import { CatalogoGestionController } from './interface/catalogo-gestion.controller.js';
import { ImportacionesController } from './interface/importaciones.controller.js';
import { PrevisualizarImportacionUseCase } from './application/previsualizar-importacion.use-case.js';
import { SugeridorDeMapeo } from './application/sugeridor-de-mapeo.js';
import { SugeridorPorSinonimos } from './infrastructure/sugeridor-por-sinonimos.js';
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
  controllers: [
    CatalogoController,
    CatalogoGestionController,
    ImportacionesController,
    SalidasController,
    CotizacionesController,
  ],
  providers: [
    ListarPaquetesUseCase,
    ListarSalidasUseCase,
    CotizacionesUseCase,
    CotizarSalidaUseCase,
    AplicadorDeCatalogo,
    PrevisualizarImportacionUseCase,
    { provide: SugeridorDeMapeo, useClass: SugeridorPorSinonimos },
    { provide: UnidadDeTrabajoDeCatalogo, useClass: UnidadDeTrabajoDeCatalogoPrisma },
  ],
  exports: [],
})
export class QuotingModule {}
