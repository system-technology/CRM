/**
 * Puerto `SugeridorDeMapeo` (ADR-0017 §4.2): dados los encabezados de una hoja, propone qué
 * columna es cada clave de la plantilla. Solo sugiere; la persona confirma el mapeo.
 *
 * Clase abstracta para servir de token de inyección. Hoy lo implementa una tabla de sinónimos en
 * `infrastructure/`; ninguna implementación llama a un servicio externo.
 */

import type { PeticionDeSugerenciaDeMapeo, SugerenciaDeMapeo } from '@viajapro/contracts';

export abstract class SugeridorDeMapeo {
  abstract sugerir(peticion: PeticionDeSugerenciaDeMapeo): SugerenciaDeMapeo;
}
