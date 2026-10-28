/**
 * Lo que `quoting` ofrece a los demás contextos, y nada más. Mismo esquema que `CrmPuertosModule`:
 * `@Global()` para que `inbox` inyecte el símbolo sin importar `quoting` (R4).
 */
import { Global, Module } from '@nestjs/common';
import { PuertoCotizacionParaWhatsapp } from '../../shared/puertos/puertos-hacia-quoting.js';
import { CotizacionParaWhatsappPrisma } from './infrastructure/cotizacion-para-whatsapp.prisma.js';

@Global()
@Module({
  providers: [{ provide: PuertoCotizacionParaWhatsapp, useClass: CotizacionParaWhatsappPrisma }],
  exports: [PuertoCotizacionParaWhatsapp],
})
export class QuotingPuertosModule {}
