import { Module } from '@nestjs/common';
import { AbrirArchivoDeViajeUseCase } from './application/abrir-archivo-de-viaje.use-case.js';
import { RepositorioDeArchivos } from './application/puertos-de-archivos.js';
import { RepositorioDeArchivosPrisma } from './infrastructure/archivos.prisma.js';
import { ConsumidorAbrirArchivo } from './interface/consumidor-abrir-archivo.js';

/**
 * Contexto de reservas (`booking`): el archivo de viaje y sus reservas con los mayoristas.
 *
 * No importa ningún otro módulo de negocio (R4). Habla con `quoting` por el puerto
 * `PuertoVersionAceptada` (token en `shared/puertos/`, implementado por `QuotingPuertosModule`) y
 * se entera de las aceptaciones por el evento `quoting.cotizacion_aceptada`. Solo se carga en el
 * contenedor de la API (`AppModule`): el consumidor necesita `viajapro_app`, y el trabajador no
 * puede construir `PrismaService`.
 */
@Module({
  providers: [
    AbrirArchivoDeViajeUseCase,
    { provide: RepositorioDeArchivos, useClass: RepositorioDeArchivosPrisma },
    ConsumidorAbrirArchivo,
  ],
})
export class BookingModule {}
