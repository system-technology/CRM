/**
 * Solo para pruebas: el servicio real, con la clave que el CI (o `vitest.setup.ts`) deja en el
 * entorno. Los fixtures que escriben columnas cifradas usan la misma primitiva que el código de
 * producción, no una copia: así una prueba de ida y vuelta prueba lo que corre de verdad.
 */
import { CifradoDeCampos, clavesDeCamposDesdeEntorno } from './cifrado-de-campos.js';
import {
  columnasDeNombreDeArchivo,
  columnasDePreferencias,
  columnasDeTexto,
  columnasDeUltimoMensaje,
} from './columnas-de-prisma.js';
import { COLUMNAS_CIFRADAS } from './puerto-de-cifrado.js';
import { uuidV7 } from './uuid-v7.js';

export function cifradoDePrueba(): CifradoDeCampos {
  return new CifradoDeCampos(clavesDeCamposDesdeEntorno(process.env));
}

/*
 * Fixtures: los campos de una fila nueva con su columna cifrada, INCLUIDO el `id` (va en el AAD y
 * por eso se genera antes del INSERT, como en producción). Se esparcen en el `data` de un
 * `create`: `admin.mensaje.create({ data: { tenantId, ...mensajeConTexto(tenantId, 'hola'), … } })`.
 */

export function mensajeConTexto(tenantId: string, texto: string) {
  const id = uuidV7();
  return {
    id,
    ...columnasDeTexto(
      cifradoDePrueba().cifrar(COLUMNAS_CIFRADAS.MENSAJES_TEXTO, tenantId, id, texto),
    ),
  };
}

export function conversacionConVistaPrevia(tenantId: string, texto: string) {
  const id = uuidV7();
  return {
    id,
    ...columnasDeUltimoMensaje(
      cifradoDePrueba().cifrar(
        COLUMNAS_CIFRADAS.CONVERSACIONES_ULTIMO_MENSAJE_TEXTO,
        tenantId,
        id,
        texto.slice(0, 200),
      ),
    ),
  };
}

export function notaConTexto(tenantId: string, texto: string) {
  const id = uuidV7();
  return {
    id,
    ...columnasDeTexto(
      cifradoDePrueba().cifrar(COLUMNAS_CIFRADAS.NOTAS_INTERNAS_TEXTO, tenantId, id, texto),
    ),
  };
}

export function adjuntoConNombre(tenantId: string, nombre: string) {
  const id = uuidV7();
  return {
    id,
    ...columnasDeNombreDeArchivo(
      cifradoDePrueba().cifrar(COLUMNAS_CIFRADAS.ADJUNTOS_NOMBRE_ARCHIVO, tenantId, id, nombre),
    ),
  };
}

export function contactoConPreferencias(tenantId: string, preferencias: string) {
  const id = uuidV7();
  return {
    id,
    ...columnasDePreferencias(
      cifradoDePrueba().cifrar(
        COLUMNAS_CIFRADAS.CONTACTOS_PREFERENCIAS,
        tenantId,
        id,
        preferencias,
      ),
    ),
  };
}
