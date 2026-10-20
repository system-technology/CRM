/**
 * Lo que `crm` ofrece a los demás contextos, y nada más.
 *
 * Es un módulo aparte de `CrmModule` por una razón de proceso, no de estilo: el trabajador del
 * webhook necesita estos puertos pero NO debe construir `CrmController` ni nada que dependa de
 * `PrismaService` (el rol `viajapro_app`). Con este módulo, ambos procesos lo importan en su raíz.
 *
 * `@Global()` para que `inbox` y `quoting` inyecten el símbolo sin importar `crm` (R4): lo único
 * que comparten es el token, que vive en `shared/puertos/`.
 */
import { Global, Module } from '@nestjs/common';
import {
  PuertoContactos,
  PuertoNotasDeConversacion,
  PuertoReferenciasDeCrm,
} from '../../shared/puertos/puertos-hacia-crm.js';
import {
  ContactosDeCrm,
  NotasDeConversacionDeCrm,
  ReferenciasDeCrm,
} from './infrastructure/puertos-de-crm.prisma.js';

@Global()
@Module({
  providers: [
    { provide: PuertoContactos, useClass: ContactosDeCrm },
    { provide: PuertoReferenciasDeCrm, useClass: ReferenciasDeCrm },
    { provide: PuertoNotasDeConversacion, useClass: NotasDeConversacionDeCrm },
  ],
  exports: [PuertoContactos, PuertoReferenciasDeCrm, PuertoNotasDeConversacion],
})
export class CrmPuertosModule {}
