import { test as base, expect } from '@playwright/test';

/**
 * Aserciones globales: ninguna pagina visitada puede producir un error de consola (la
 * hidratacion incluida: React la reporta con `console.error`), una excepcion sin capturar ni una
 * respuesta 5xx. Se aplica a TODOS los tests (fixture `auto`) y se evalua al final de cada uno,
 * de modo que el mensaje lista todo lo ocurrido y no solo lo primero.
 *
 * Unica tolerancia: la linea que Chrome escribe en consola por un 4xx de red («Failed to load
 * resource: the server responded with a status of 401»). Un 401 antes de ingresar o un 404 de un
 * recurso opcional no es un defecto de la pagina; cualquier otra falla de red (conexion rechazada,
 * CORS) y cualquier 5xx SI cuentan.
 */
const ERROR_DE_RED_4XX = /^Failed to load resource: the server responded with a status of 4\d\d/;

export const test = base.extend<{ vigilante: void }>({
  vigilante: [
    async ({ page }, use) => {
      const problemas: string[] = [];
      page.on('console', (mensaje) => {
        if (mensaje.type() !== 'error') return;
        if (ERROR_DE_RED_4XX.test(mensaje.text())) return;
        problemas.push(`consola: ${mensaje.text()} [${mensaje.location().url}]`);
      });
      page.on('pageerror', (error) => {
        problemas.push(`excepcion sin capturar: ${error.message}`);
      });
      page.on('response', (respuesta) => {
        if (respuesta.status() >= 500) {
          problemas.push(
            `HTTP ${respuesta.status()} ${respuesta.request().method()} ${respuesta.url()}`,
          );
        }
      });

      await use();

      expect(
        problemas,
        'errores de consola, excepciones o respuestas 5xx durante la prueba',
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
