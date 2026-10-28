/**
 * Lo que `quoting` ofrece a los demás contextos, y nada más. Mismo esquema que `CrmPuertosModule`:
 * `@Global()` para que `crm` e `inbox` inyecten los símbolos sin importar `quoting` (R4); lo único
 * que comparten son los tokens, que viven en `shared/puertos/`.
 */
import { Global, Module } from '@nestjs/common';
import {
  PuertoCotizacionParaWhatsapp,
  PuertoExistenciaDePaquete,
} from '../../shared/puertos/puertos-hacia-quoting.js';
import { CotizacionParaWhatsappPrisma } from './infrastructure/cotizacion-para-whatsapp.prisma.js';
import { ExistenciaDePaqueteDeQuoting } from './infrastructure/puertos-de-quoting.prisma.js';

@Global()
@Module({
  providers: [
    { provide: PuertoExistenciaDePaquete, useClass: ExistenciaDePaqueteDeQuoting },
    { provide: PuertoCotizacionParaWhatsapp, useClass: CotizacionParaWhatsappPrisma },
  ],
  exports: [PuertoExistenciaDePaquete, PuertoCotizacionParaWhatsapp],
})
export class QuotingPuertosModule {}
