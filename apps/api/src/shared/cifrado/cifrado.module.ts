import { Global, Module } from '@nestjs/common';
import { CifradoDeCampos, clavesDeCamposDesdeEntorno } from './cifrado-de-campos.js';
import { PuertoCifradoDeCampos } from './puerto-de-cifrado.js';

/**
 * Lo importan la API (por `SharedModule`) y el trabajador (`WorkerModule` y el contexto
 * trabajador del modo `unico`): son los únicos procesos con la clave (ADR-0015, concreción 4). La
 * web nunca. La fábrica lanza si falta la clave o su versión, y Nest instancia los proveedores al
 * crear el contexto: el proceso aborta al arrancar, no en la primera escritura.
 */
@Global()
@Module({
  providers: [
    {
      provide: PuertoCifradoDeCampos,
      useFactory: (): PuertoCifradoDeCampos =>
        new CifradoDeCampos(clavesDeCamposDesdeEntorno(process.env)),
    },
  ],
  exports: [PuertoCifradoDeCampos],
})
export class CifradoModule {}
