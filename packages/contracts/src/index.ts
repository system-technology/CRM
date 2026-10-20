/**
 * @viajapro/contracts — la fuente de verdad de los contratos entre la API y la web.
 *
 * Regla R3: nadie redefine un tipo que viva aquí. La API valida con estos esquemas; la web
 * deriva sus tipos de ellos y usa los mismos para validar formularios.
 *
 * Solo esquemas Zod y los tipos que se infieren de ellos. Cero lógica, cero I/O.
 */

export * from './comunes.js';
export * from './catalogo.js';
export * from './crm.js';
export * from './inbox.js';
export * from './plantillas.js';
export * from './politica-de-precio.js';
export * from './vigencias.js';
export * from './cotizaciones.js';
export * from './identidad.js';
