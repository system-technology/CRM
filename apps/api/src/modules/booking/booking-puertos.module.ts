/**
 * Lo que `booking` ofrece a los demás contextos, y nada más. Mismo esquema que `CrmPuertosModule` y
 * `QuotingPuertosModule`: `@Global()` para que `notifications` inyecte el símbolo sin importar
 * `booking` (R4); lo único que comparten es el token, que vive en `shared/puertos/`.
 *
 * Sin `PrismaService`: el puerto usa la transacción del llamador.
 */
import { Global, Module } from '@nestjs/common';
import { PuertoArchivoDeUnAviso } from '../../shared/puertos/puertos-para-avisos.js';
import { ArchivoDeUnAvisoDeBooking } from './infrastructure/archivo-de-un-aviso.prisma.js';

@Global()
@Module({
  providers: [{ provide: PuertoArchivoDeUnAviso, useClass: ArchivoDeUnAvisoDeBooking }],
  exports: [PuertoArchivoDeUnAviso],
})
export class BookingPuertosModule {}
