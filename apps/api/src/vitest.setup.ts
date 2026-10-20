/**
 * Preparación común de las pruebas de `apps/api`.
 *
 * `BETTER_AUTH_SECRET` firma las cookies de sesión y la API se niega a arrancar sin él. Las
 * pruebas que ensamblan la aplicación entera (`AppModule`) lo necesitan aunque no hablen de
 * autenticación, y pedirle a cada desarrollador que lo ponga en su `.env` solo para correr una
 * prueba de cotizaciones sería una fricción sin ningún beneficio de seguridad.
 *
 * Por eso, si la prueba no trae uno, se fabrica uno **efímero y aleatorio**, que vive lo que dura
 * el proceso de prueba y no se escribe en ninguna parte. Si el entorno ya trae uno (el CI lo
 * genera por job), se respeta. No es un valor por omisión: dos corridas nunca comparten secreto.
 */
import { randomBytes } from 'node:crypto';

if (!process.env['BETTER_AUTH_SECRET']) {
  process.env['BETTER_AUTH_SECRET'] = randomBytes(48).toString('base64');
}
