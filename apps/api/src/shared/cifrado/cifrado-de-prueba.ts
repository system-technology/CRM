/**
 * Solo para pruebas e2e: el servicio real, con la clave que el CI (o `generar-secretos-locales`)
 * deja en el entorno. Los fixtures que escriben columnas cifradas usan la misma primitiva que el
 * código de producción, no una copia: así una prueba de ida y vuelta prueba lo que corre de verdad.
 */
import { CifradoDeCampos, clavesDeCamposDesdeEntorno } from './cifrado-de-campos.js';

export function cifradoDePrueba(): CifradoDeCampos {
  return new CifradoDeCampos(clavesDeCamposDesdeEntorno(process.env));
}
