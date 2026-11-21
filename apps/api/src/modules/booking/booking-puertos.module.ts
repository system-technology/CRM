/**
 * Lo que `booking` ofrece a los demás contextos, y nada más. Mismo esquema que `CrmPuertosModule` y
 * `QuotingPuertosModule`: `@Global()` para que `notifications` inyecte el símbolo sin importar
 * `booking` (R4); lo único que comparten es el token, que vive en `shared/puertos/`.
 *
 * Sin `PrismaService`: el puerto usa la transacción del llamador.
 */
import { Global, Module } from '@nestjs/common';
import { PuertoArchivoDeUnAviso } from '../../shared/puertos/puertos-para-avisos.js';
import { PuertoArchivoParaCobro } from '../../shared/puertos/puertos-hacia-booking.js';
import { ArchivoDeUnAvisoDeBooking } from './infrastructure/archivo-de-un-aviso.prisma.js';
import { ArchivoParaCobroDeBooking } from './infrastructure/archivo-para-cobro.prisma.js';

@Global()
@Module({
  providers: [
    { provide: PuertoArchivoDeUnAviso, useClass: ArchivoDeUnAvisoDeBooking },
    // T-330 (ADR-0034 §1): `payments` lee el total y el estado del archivo por este puerto.
    { provide: PuertoArchivoParaCobro, useClass: ArchivoParaCobroDeBooking },
  ],
  exports: [PuertoArchivoDeUnAviso, PuertoArchivoParaCobro],
})
export class BookingPuertosModule {}
