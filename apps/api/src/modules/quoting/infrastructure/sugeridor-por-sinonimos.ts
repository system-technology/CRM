/**
 * `SugeridorDeMapeo` por sinónimos y por marcador de plantilla. Puro: sin red, sin dependencias.
 *
 * - Con marcador `#viajapro;plantilla=<formato>;version=<n>` de un formato conocido, un
 *   encabezado igual a la etiqueta o a la clave de una columna se asigna con confianza 1.
 * - Sin marcador, o para los encabezados que no coinciden: coincidencia exacta con la etiqueta
 *   (0.9) o con un sinónimo (0.7). Cada clave recibe a lo sumo un encabezado, y cada encabezado
 *   a lo sumo una clave. Lo que no casa queda en `sinMapear`.
 */

import { Injectable } from '@nestjs/common';
import type { PeticionDeSugerenciaDeMapeo, SugerenciaDeMapeo } from '@viajapro/contracts';
import { plantillaDeSistema } from '../domain/tabla-a-propuesta.js';
import { normalizarNombre } from '../domain/validar-y-planificar.js';
import { SugeridorDeMapeo } from '../application/sugeridor-de-mapeo.js';

export const FORMATO_POR_DEFECTO = 'excursion-un-dia';

const SINONIMOS: Readonly<Record<string, readonly string[]>> = {
  codigo: ['codigo', 'cod', 'ref', 'referencia', 'sku'],
  nombre: ['tour', 'producto', 'paquete', 'nombre', 'plan', 'servicio', 'excursion'],
  destino: ['destino', 'ciudad', 'lugar'],
  dias: ['dias', 'duracion dias'],
  noches: ['noches'],
  vigencia_desde: ['fecha salida', 'fecha de salida', 'fecha', 'salida', 'desde', 'inicio'],
  vigencia_hasta: ['hasta', 'fecha fin', 'fecha final', 'fin', 'regreso'],
  tarifa_nombre: ['tipo de tarifa', 'tipo tarifa', 'categoria', 'pasajero', 'tipo de pasajero'],
  precio_neto: ['neto', 'precio neto', 'costo', 'tarifa neta'],
  precio_venta: ['precio', 'pvp', 'valor', 'precio venta', 'precio de venta', 'precio publico'],
  precio_lista: ['precio lista', 'precio de lista', 'precio antes'],
  moneda: ['moneda', 'divisa'],
  mayorista: ['mayorista', 'operador', 'proveedor'],
  inclusiones: ['incluye', 'inclusiones', 'incluido'],
  exclusiones: ['no incluye', 'exclusiones', 'excluye'],
  opcion_salida: ['opcion', 'turno', 'opcion de salida'],
  hora_salida: ['hora salida', 'hora de salida', 'hora'],
  hora_regreso: ['hora regreso', 'hora de regreso'],
  punto_encuentro: ['punto de encuentro', 'punto encuentro', 'encuentro'],
  plan_alimentacion: ['plan', 'alimentacion', 'plan de alimentacion'],
};

function leerMarcador(marcador: string | undefined): { formato: string; version: number } | null {
  if (!marcador) return null;
  const partes = (marcador.charCodeAt(0) === 0xfeff ? marcador.slice(1) : marcador)
    .trim()
    .split(/[;,]/)
    .map((p) => p.trim());
  if (partes[0] !== '#viajapro') return null;
  const formato = partes.find((p) => p.startsWith('plantilla='))?.slice('plantilla='.length);
  const version = Number(partes.find((p) => p.startsWith('version='))?.slice('version='.length));
  if (!formato || !Number.isInteger(version) || version < 1) return null;
  return { formato, version };
}

@Injectable()
export class SugeridorPorSinonimos extends SugeridorDeMapeo {
  sugerir(peticion: PeticionDeSugerenciaDeMapeo): SugerenciaDeMapeo {
    const marcador = leerMarcador(peticion.marcador);
    const plantilla =
      (marcador && plantillaDeSistema(marcador.formato)) ||
      plantillaDeSistema(peticion.formato ?? FORMATO_POR_DEFECTO) ||
      plantillaDeSistema(FORMATO_POR_DEFECTO);
    if (!plantilla) throw new Error('la plantilla por defecto debe existir');
    const conMarcador = marcador !== null && plantilla.formato === marcador.formato;

    const encabezados = peticion.encabezados.map(normalizarNombre);
    const columnas: Record<string, { indice: number; confianza: number }> = {};
    const usados = new Set<number>();

    const asignar = (clave: string, indice: number, confianza: number): void => {
      columnas[clave] = { indice, confianza };
      usados.add(indice);
    };

    // 1. Exacto con etiqueta o clave de la plantilla.
    for (const c of plantilla.columnas) {
      const indice = encabezados.findIndex(
        (e, i) =>
          !usados.has(i) && (e === normalizarNombre(c.etiqueta) || e === normalizarNombre(c.clave)),
      );
      if (indice !== -1) asignar(c.clave, indice, conMarcador ? 1 : 0.9);
    }
    // 2. Sinónimos, para lo que falta.
    for (const c of plantilla.columnas) {
      if (columnas[c.clave]) continue;
      const sinonimos = SINONIMOS[c.clave] ?? [];
      const indice = encabezados.findIndex((e, i) => !usados.has(i) && sinonimos.includes(e));
      if (indice !== -1) asignar(c.clave, indice, 0.7);
    }

    return {
      formato: plantilla.formato,
      version: conMarcador ? marcador.version : plantilla.version,
      columnas,
      sinMapear: encabezados.map((_, i) => i).filter((i) => !usados.has(i)),
    };
  }
}
