import { Global, Module, type Provider } from '@nestjs/common';
import { PuertoColaDeCorreo } from '../../shared/puertos/puerto-de-correo.js';
import { PuertoCorreo } from './domain/puerto-correo.js';
import { resolverClaveDeCorreo } from './domain/sellado-de-correo.js';
import { ColaDeCorreoBullmq } from './infrastructure/cola-de-correo.bullmq.js';
import { ColaDeCorreoEnMemoria } from './infrastructure/cola-de-correo.en-memoria.js';
import { CorreoEnMemoria } from './infrastructure/correo.en-memoria.js';
import { validarConfiguracionDeCorreo } from './infrastructure/crear-correo.js';

/**
 * Notificaciones, lado API: solo el PRODUCTOR de la cola de correo. La API no envía nada.
 *
 * Con `COLA_CORREO=memoria` (pruebas y CI) se compone además el doble del puerto de correo, que
 * las pruebas piden por su clase para leer lo «enviado». En cualquier otro caso hace falta
 * `REDIS_URL` y un trabajador (`NotificationsWorkerModule`) que envíe.
 */
const enMemoria = process.env['COLA_CORREO'] === 'memoria';

const proveedores: Provider[] = enMemoria
  ? [
      CorreoEnMemoria,
      { provide: PuertoCorreo, useExisting: CorreoEnMemoria },
      {
        provide: PuertoColaDeCorreo,
        useFactory: (correo: PuertoCorreo): PuertoColaDeCorreo => new ColaDeCorreoEnMemoria(correo),
        inject: [PuertoCorreo],
      },
    ]
  : [
      {
        provide: PuertoColaDeCorreo,
        useFactory: (): PuertoColaDeCorreo => {
          validarConfiguracionDeCorreo(process.env);
          const url = process.env['REDIS_URL'];
          if (!url) throw new Error('Falta REDIS_URL (o COLA_CORREO=memoria en pruebas).');
          return new ColaDeCorreoBullmq(url, resolverClaveDeCorreo(process.env));
        },
      },
    ];

/**
 * Global: otros módulos piden `PuertoColaDeCorreo` por su símbolo sin importar este módulo (R4).
 */
@Global()
@Module({
  providers: proveedores,
  exports: [PuertoColaDeCorreo, ...(enMemoria ? [CorreoEnMemoria] : [])],
})
export class NotificationsModule {}
