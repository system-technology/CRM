/**
 * Qué adaptadores de envío usa el trabajador, decidido por el entorno. ADR-0018 §7.
 *
 * - El adaptador de red es siempre el real (`EnvioWhatsappGraph`); el falso solo existe en pruebas.
 * - La credencial: con `META_SYSTEM_USER_TOKEN` y `META_PHONE_NUMBER_ID_PRUEBA`, la de prueba, que
 *   solo sirve a ese número. Sin ellas, ninguna: cada mensaje queda `FALLIDO` y explicado, y el
 *   arranque lo avisa. **El token jamás se registra.**
 */
import { Logger } from '@nestjs/common';
import type {
  PuertoCredencialesWhatsapp,
  PuertoEnvioWhatsapp,
} from '../application/puertos-de-envio.js';
import {
  CredencialesDePrueba,
  CredencialesNoConfiguradas,
} from './credenciales-whatsapp.entorno.js';
import { EnvioWhatsappGraph, VERSION_DE_GRAPH } from './envio-whatsapp.graph.js';

type Entorno = Record<string, string | undefined>;

export function crearEnvioWhatsapp(entorno: Entorno = process.env): PuertoEnvioWhatsapp {
  return new EnvioWhatsappGraph({
    baseUrl: entorno['META_GRAPH_BASE_URL'] || 'https://graph.facebook.com',
    version: entorno['META_GRAPH_VERSION'] || VERSION_DE_GRAPH,
  });
}

export function crearCredencialesWhatsapp(
  entorno: Entorno = process.env,
): PuertoCredencialesWhatsapp {
  const token = entorno['META_SYSTEM_USER_TOKEN'];
  const numero = entorno['META_PHONE_NUMBER_ID_PRUEBA'];
  if (token && numero) return new CredencialesDePrueba(token, numero);
  new Logger('EnvioWhatsapp').warn(
    'Sin META_SYSTEM_USER_TOKEN y META_PHONE_NUMBER_ID_PRUEBA: los mensajes salientes quedarán FALLIDOS.',
  );
  return new CredencialesNoConfiguradas();
}
