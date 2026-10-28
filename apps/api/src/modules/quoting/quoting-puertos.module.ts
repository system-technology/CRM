/**
 * Lo que `quoting` ofrece a los demás contextos, y nada más. Mismo esquema que `CrmPuertosModule`:
 * `@Global()` para que `crm` inyecte el símbolo sin importar `quoting` (R4); lo único que
 * comparten es el token, que vive en `shared/puertos/`.
 */
import { Global, Module } from '@nestjs/common';
import { PuertoExistenciaDePaquete } from '../../shared/puertos/puertos-hacia-quoting.js';
import { ExistenciaDePaqueteDeQuoting } from './infrastructure/puertos-de-quoting.prisma.js';

@Global()
@Module({
  providers: [{ provide: PuertoExistenciaDePaquete, useClass: ExistenciaDePaqueteDeQuoting }],
  exports: [PuertoExistenciaDePaquete],
})
export class QuotingPuertosModule {}
