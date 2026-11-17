import { Module } from '@nestjs/common';
import { AbrirArchivoDeViajeUseCase } from './application/abrir-archivo-de-viaje.use-case.js';
import { OperarArchivoUseCase } from './application/operar-archivo.use-case.js';
import { RepositorioDeArchivos } from './application/puertos-de-archivos.js';
import { RepositorioDeOperacionDeArchivos } from './application/puertos-de-operacion.js';
import { RepositorioDeArchivosPrisma } from './infrastructure/archivos.prisma.js';
import { RepositorioDeOperacionDeArchivosPrisma } from './infrastructure/operacion-de-archivos.prisma.js';
import { ArchivosController } from './interface/archivos.controller.js';
import { ConsumidorAbrirArchivo } from './interface/consumidor-abrir-archivo.js';

/**
 * Contexto de reservas (`booking`): el archivo de viaje y sus reservas con los mayoristas.
 *
 * No importa ningún otro módulo de negocio (R4). Habla con `quoting` por el puerto
 * `PuertoVersionAceptada` (token en `shared/puertos/`, implementado por `QuotingPuertosModule`) y
 * se entera de las aceptaciones por el evento `quoting.cotizacion_aceptada`. Solo se carga en el
 * contenedor de la API (`AppModule`): el consumidor necesita `viajapro_app`, y el trabajador no
 * puede construir `PrismaService`.
 *
 * Dos mitades: la apertura (el consumidor del evento, dentro de la transacción del despachador) y
 * la operación (`ArchivosController`, T-242: listar, ver, avanzar reservas, pasajeros, cancelar).
 */
@Module({
  controllers: [ArchivosController],
  providers: [
    AbrirArchivoDeViajeUseCase,
    { provide: RepositorioDeArchivos, useClass: RepositorioDeArchivosPrisma },
    ConsumidorAbrirArchivo,
    OperarArchivoUseCase,
    { provide: RepositorioDeOperacionDeArchivos, useClass: RepositorioDeOperacionDeArchivosPrisma },
  ],
})
export class BookingModule {}
