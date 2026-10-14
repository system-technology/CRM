/**
 * @viajapro/domain — value objects puros del dominio.
 *
 * CERO dependencias de framework. Cero I/O. Cero acceso a reloj o red.
 * Todo lo que vive aquí se puede probar con una función y un `expect`.
 *
 * Si algo necesita la base de datos, NestJS o la hora actual, no pertenece a este paquete.
 */

export * from './errors.js';
export * from './money.js';
export * from './ocupacion.js';
export * from './precio-de-venta.js';
