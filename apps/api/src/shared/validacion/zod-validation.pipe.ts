/**
 * Valida la entrada con los esquemas de `@viajapro/contracts`.
 *
 * Nada entra a un caso de uso sin pasar por aquí. Y lo que valida es el MISMO esquema que usa
 * el formulario de la web: si divergieran, el usuario vería un formulario que acepta algo que
 * la API rechaza, o al revés.
 */

import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { ZodError, type ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly esquema: ZodSchema) {}

  transform(valor: unknown): unknown {
    try {
      return this.esquema.parse(valor);
    } catch (error) {
      if (error instanceof ZodError) {
        // Se devuelve campo por campo. Un "datos inválidos" a secas obliga al asesor a
        // adivinar cuál de los ocho campos del formulario está mal.
        throw new BadRequestException({
          error: {
            code: 'ENTRADA_INVALIDA',
            message: 'Hay datos que no cumplen el formato esperado.',
            details: Object.fromEntries(
              error.issues.map((i) => [i.path.join('.') || '(raíz)', i.message]),
            ),
          },
        });
      }
      throw error;
    }
  }
}
