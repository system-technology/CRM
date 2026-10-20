/**
 * Lo que `inbox` ofrece a los demás contextos, y nada más. Mismo esquema que `CrmPuertosModule`:
 * `@Global()` para que `identity` inyecte el símbolo sin importar `inbox` (R4); lo único que
 * comparten es el token, que vive en `shared/puertos/`.
 */
import { Global, Module } from '@nestjs/common';
import { PuertoConversacionesDeMiembro } from '../../shared/puertos/puertos-hacia-inbox.js';
import { ConversacionesDeMiembroDeInbox } from './infrastructure/conversaciones-de-miembro.prisma.js';

@Global()
@Module({
  providers: [{ provide: PuertoConversacionesDeMiembro, useClass: ConversacionesDeMiembroDeInbox }],
  exports: [PuertoConversacionesDeMiembro],
})
export class InboxPuertosModule {}
