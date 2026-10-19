/**
 * Adaptador de persistencia de recepciones.
 *
 * Llama a `registrar_recepcion`, que es `SECURITY DEFINER`: la tabla no es escribible
 * directamente por ningún rol de aplicación. El rol que ejecuta esta función es
 * `viajapro_app` —así está concedida en la migración—, el mismo con el que corre la API.
 *
 * La función hace dos cosas en una transacción: inserta la recepción con `ON CONFLICT DO
 * NOTHING` y, solo si insertó, crea una fila `PENDIENTE` por cada `change`. Por eso devuelve
 * boolean y no se comprueba antes con un `SELECT`: comprobar y luego insertar es una carrera.
 */

import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { PuertoRecepciones, type RecepcionAGuardar } from '../application/puerto-recepciones.js';

@Injectable()
export class RecepcionesPrisma extends PuertoRecepciones {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async registrar(r: RecepcionAGuardar): Promise<boolean> {
    // Sin contexto de tenant a propósito: todavía no se sabe de qué agencia es el mensaje.
    // Ése es el problema que el ADR-0008 resuelve, y la razón de que esta tabla no lleve RLS.
    //
    // **Declarada**, no a pelo. La variante ruidosa emitiría un `warn` por cada mensaje que
    // entre, y el primer día de volumen real alguien bajaría el nivel del registro — perdiendo
    // el aviso también donde sí importa. El porqué vive en `operaciones-de-plataforma.ts`.
    return this.prisma.sinTenantDeclarado('inbox/registrar-recepcion', async (tx) => {
      const filas = await tx.$queryRaw<Array<{ registrada: boolean }>>`
          SELECT public.registrar_recepcion(
            ${r.recepcionId}::bytea,
            ${r.cifrado}::bytea,
            ${r.nonce}::bytea,
            ${r.tag}::bytea,
            ${r.claveVersion}::smallint,
            ${r.totalChanges}::smallint
          ) AS registrada
        `;
      return filas[0]?.registrada === true;
    });
  }
}
