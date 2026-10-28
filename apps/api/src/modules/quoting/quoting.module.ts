import { Module } from '@nestjs/common';
import { CotizarSalidaUseCase } from './application/cotizar-salida.use-case.js';
import { ListarPaquetesUseCase } from './application/listar-paquetes.use-case.js';
import { ListarPaquetesGestionUseCase } from './application/listar-paquetes-gestion.use-case.js';
import { CatalogoListadoController } from './interface/catalogo-listado.controller.js';
import { ListarSalidasUseCase } from './application/listar-salidas.use-case.js';
import { CotizacionesUseCase } from './application/cotizaciones.use-case.js';
import { AplicadorDeCatalogo } from './application/aplicador-de-catalogo.js';
import { UnidadDeTrabajoDeCatalogo } from './application/puertos-de-catalogo.js';
import { UnidadDeTrabajoDeCatalogoPrisma } from './infrastructure/catalogo.prisma.js';
import { AplicadorPorId } from './application/aplicador-por-id.js';
import { UnidadDeTrabajoDeGestion } from './application/puertos-de-gestion.js';
import { UnidadDeTrabajoDeGestionPrisma } from './infrastructure/gestion-por-id.prisma.js';
import { CatalogoVigenciasController } from './interface/catalogo-vigencias.controller.js';
import { CatalogoGestionController } from './interface/catalogo-gestion.controller.js';
import { FormatosController } from './interface/formatos.controller.js';
import { FormatosUseCase } from './application/formatos.use-case.js';
import { ImportacionesController } from './interface/importaciones.controller.js';
import { PrevisualizarImportacionUseCase } from './application/previsualizar-importacion.use-case.js';
import { ConfirmarImportacionUseCase } from './application/confirmar-importacion.use-case.js';
import { SugeridorDeMapeo } from './application/sugeridor-de-mapeo.js';
import { SugeridorPorSinonimos } from './infrastructure/sugeridor-por-sinonimos.js';
import { HistorialDePreciosController } from './interface/historial-de-precios.controller.js';
import { HistorialDePreciosUseCase } from './application/historial-de-precios.use-case.js';
import { LectorDeHistorial } from './application/puertos-de-historial.js';
import { LectorDeHistorialPrisma } from './infrastructure/historial.prisma.js';
import { CotizacionesController } from './interface/cotizaciones.controller.js';
import { CatalogoController } from './interface/catalogo.controller.js';
import { SalidasController } from './interface/salidas.controller.js';
import { CatalogoAjustesController } from './interface/catalogo-ajustes.controller.js';
import { AjustesDeCatalogoUseCase } from './application/ajustes-de-catalogo.use-case.js';

/**
 * Contexto de cotización: catálogo de paquetes y cálculo de precio.
 *
 * No importa ningún otro módulo de negocio. Cuando necesite algo de `crm` o `booking`,
 * será por evento de dominio o por un puerto declarado aquí. Regla R4.
 */
@Module({
  controllers: [
    CatalogoController,
    CatalogoAjustesController,
    CatalogoGestionController,
    CatalogoListadoController,
    CatalogoVigenciasController,
    FormatosController,
    HistorialDePreciosController,
    ImportacionesController,
    SalidasController,
    CotizacionesController,
  ],
  providers: [
    AjustesDeCatalogoUseCase,
    ListarPaquetesUseCase,
    ListarPaquetesGestionUseCase,
    ListarSalidasUseCase,
    CotizacionesUseCase,
    CotizarSalidaUseCase,
    AplicadorDeCatalogo,
    FormatosUseCase,
    PrevisualizarImportacionUseCase,
    ConfirmarImportacionUseCase,
    { provide: SugeridorDeMapeo, useClass: SugeridorPorSinonimos },
    { provide: UnidadDeTrabajoDeCatalogo, useClass: UnidadDeTrabajoDeCatalogoPrisma },
    AplicadorPorId,
    HistorialDePreciosUseCase,
    { provide: LectorDeHistorial, useClass: LectorDeHistorialPrisma },
    { provide: UnidadDeTrabajoDeGestion, useClass: UnidadDeTrabajoDeGestionPrisma },
  ],
  exports: [],
})
export class QuotingModule {}
