/**
 * La configuración HTTP de la API, común a `main.ts` (modo `escalado`) y `main-unico.ts`.
 * Un solo sitio: dos arranques que configuraran Express por separado acabarían divergiendo en lo
 * que más duele (el cuerpo crudo de los webhooks, la confianza en el proxy, el CORS).
 */
import type { NestExpressApplication } from '@nestjs/platform-express';
import { cuerpoCrudoDeWebhooks } from './shared/red/cuerpo-crudo-de-webhooks.js';
import {
  cuerpoDeImportaciones,
  RUTA_DE_IMPORTACIONES,
} from './shared/red/cuerpo-de-importaciones.js';
import { leerProxyDeConfianza } from './shared/red/proxy-de-confianza.js';
import { DominioExcepcionFilter } from './shared/filtros/dominio-excepcion.filter.js';

export function configurarApi(app: NestExpressApplication): void {
  app.useGlobalFilters(new DominioExcepcionFilter());

  // Sin saltos de confianza por defecto: `req.ip` es la del socket y `x-forwarded-for` se ignora.
  app.set('trust proxy', leerProxyDeConfianza(process.env));

  // Sin ValidationPipe global: validamos con los esquemas Zod de @viajapro/contracts,
  // uno por ruta. El pipe de Nest exige class-validator y duplicaria la definicion de cada
  // forma de datos — justo lo que la regla R3 evita.

  // Los webhooks de Meta se firman sobre el CUERPO CRUDO: cualquier middleware que parsee
  // JSON antes rompe la verificación de la firma. Es el error número uno de esta integración.
  app.use('/webhooks', cuerpoCrudoDeWebhooks());

  // Tope de 2 MB solo para las importaciones de catálogo (el resto sigue con el de Nest).
  app.use(RUTA_DE_IMPORTACIONES, cuerpoDeImportaciones());

  app.enableCors({
    origin: process.env['WEB_PUBLIC_URL'] ?? 'http://localhost:3000',
    credentials: true,
  });
}
