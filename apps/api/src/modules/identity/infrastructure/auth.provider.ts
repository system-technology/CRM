/**
 * Cómo se construye la instancia de Better Auth dentro de Nest.
 *
 * Una sola instancia por proceso, con el cliente de Prisma del pool de identidad. Las variables
 * de entorno se leen aquí, una vez, y sin valores por omisión para los secretos.
 */
import { Logger, type Provider } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { origenesDeConfianzaDeLaWeb } from '../../../shared/red/origen.js';
import { PuertoColaDeCorreo } from '../../../shared/puertos/puerto-de-correo.js';
import { type AuthDeViajaPro, crearAuth, leerSecretoDeAutenticacion } from './crear-auth.js';
import { PrismaIdentidadService } from './prisma-identidad.service.js';

export const AUTH = Symbol('AUTH_DE_BETTER_AUTH');

export const origenesDeConfianza = origenesDeConfianzaDeLaWeb;

export const proveedorDeAuth: Provider = {
  provide: AUTH,
  // `@inyeccion-manual`: es una fábrica; su `inject` declara los tokens.
  useFactory: (prisma: PrismaIdentidadService, correo: PuertoColaDeCorreo): AuthDeViajaPro =>
    crearAuth({
      prisma,
      secreto: leerSecretoDeAutenticacion(process.env),
      baseUrl:
        process.env['API_PUBLIC_URL'] ?? `http://localhost:${process.env['API_PORT'] ?? '3333'}`,
      origenesDeConfianza: origenesDeConfianza(process.env),
      // Encola (R5), sin esperar al envío. Clave aleatoria: cada petición es un código distinto.
      enviarCodigo: (destino, codigo) =>
        correo
          .encolar(
            {
              para: destino,
              asunto: 'Tu código de acceso a ViajaPro',
              texto:
                `Tu código de acceso es ${codigo}.

Caduca en 5 minutos y sirve una sola vez. ` + 'Si no lo pediste, ignora este correo.',
            },
            `otp-${randomUUID()}`,
          )
          .catch((error: unknown) => {
            // Sin el correo ni el código en el registro.
            new Logger('Identidad').error(
              `No se pudo encolar el código por correo (${error instanceof Error ? error.name : 'Error'}).`,
            );
          }),
    }),
  inject: [PrismaIdentidadService, PuertoColaDeCorreo],
};
