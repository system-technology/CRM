/**
 * Lo que `inbox` ofrece a los demás contextos, y nada más. Mismo esquema que `CrmPuertosModule`:
 * `@Global()` para que `identity` y `crm` inyecten el símbolo sin importar `inbox` (R4); lo único
 * que comparten es el token, que vive en `shared/puertos/`.
 */
import { Global, Module } from '@nestjs/common';
import {
  PuertoConversacionesDeMiembro,
  PuertoConversacionesVisibles,
} from '../../shared/puertos/puertos-hacia-inbox.js';
import { PuertoRespuestaParaReportes } from '../../shared/puertos/puertos-de-reportes.js';
import { RespuestaParaReportesPrisma } from './infrastructure/respuesta-para-reportes.prisma.js';
import { ConversacionesDeMiembroDeInbox } from './infrastructure/conversaciones-de-miembro.prisma.js';
import { ConversacionesVisiblesDeInbox } from './infrastructure/conversaciones-visibles.prisma.js';

@Global()
@Module({
  providers: [
    { provide: PuertoConversacionesDeMiembro, useClass: ConversacionesDeMiembroDeInbox },
    { provide: PuertoConversacionesVisibles, useClass: ConversacionesVisiblesDeInbox },
    { provide: PuertoRespuestaParaReportes, useClass: RespuestaParaReportesPrisma },
  ],
  exports: [
    PuertoConversacionesDeMiembro,
    PuertoConversacionesVisibles,
    PuertoRespuestaParaReportes,
  ],
})
export class InboxPuertosModule {}
