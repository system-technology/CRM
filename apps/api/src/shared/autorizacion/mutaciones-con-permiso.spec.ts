/**
 * T-089: ninguna ruta que modifica datos de negocio queda sin `@RequierePermiso`. El guard global
 * hace cumplir la metadata (`permisos.spec.ts` lo prueba); aquí se fija que cada mutación la
 * declare, y que una ruta nueva sin permiso rompa esta prueba en vez de quedar abierta.
 */
import 'reflect-metadata';

import { RequestMethod } from '@nestjs/common';
import type { Permiso } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import { ArchivosController } from '../../modules/booking/interface/archivos.controller.js';
import { AgenciaAjustesController } from '../../modules/identity/interface/agencia-ajustes.controller.js';
import { CrmController } from '../../modules/crm/interface/crm.controller.js';
import { EtiquetasController } from '../../modules/inbox/interface/etiquetas.controller.js';
import { ConversacionesController } from '../../modules/inbox/interface/conversaciones.controller.js';
import { NotificacionesController } from '../../modules/notifications/interface/notificaciones.controller.js';
import { CotizacionesController } from '../../modules/quoting/interface/cotizaciones.controller.js';
import { CLAVE_PERMISOS_REQUERIDOS } from './permiso.decorator.js';

const MUTACIONES = new Set<number>([
  RequestMethod.POST,
  RequestMethod.PUT,
  RequestMethod.PATCH,
  // T-325: quitar una etiqueta es un DELETE; sin esto una ruta de borrado quedaría sin vigilar.
  RequestMethod.DELETE,
]);

/**
 * Mutaciones que NO exigen permiso, con su razón. `leida` es el estado de lectura de quien mira:
 * un usuario de solo lectura debe poder abrir una conversación sin recibir 403.
 */
const SIN_PERMISO = new Set(['ConversacionesController.leida']);

const CONTROLADORES: ReadonlyArray<readonly [abstract new (...args: never[]) => object, Permiso]> =
  [
    [ConversacionesController, 'bandeja.operar'],
    // T-325: las mutaciones del catálogo (la lectura, `GET`, la ve cualquier usuario de la agencia).
    [EtiquetasController, 'etiquetas.administrar'],
    [CrmController, 'crm.escribir'],
    [CotizacionesController, 'cotizacion.escribir'],
    [AgenciaAjustesController, 'usuarios.administrar'],
    // ADR-0024 §3.7, T-249. El literal, no la constante: cambiarla debe romper esta prueba.
    [ArchivosController, 'archivo.operar'],
  ];

describe('mutaciones con permiso (T-089)', () => {
  for (const [controlador, permiso] of CONTROLADORES) {
    describe(controlador.name, () => {
      const proto = controlador.prototype as Record<string, unknown>;
      const rutas = Object.getOwnPropertyNames(proto).filter(
        (n) => n !== 'constructor' && typeof proto[n] === 'function',
      );
      const mutaciones = rutas.filter((n) =>
        MUTACIONES.has(Reflect.getMetadata('method', proto[n] as object) as number),
      );

      it('tiene rutas de mutación que comprobar', () => {
        expect(mutaciones.length).toBeGreaterThan(0);
      });

      for (const nombre of mutaciones) {
        const clave = `${controlador.name}.${nombre}`;
        if (SIN_PERMISO.has(clave)) continue;
        it(`${nombre} exige ${permiso}`, () => {
          const requeridos = Reflect.getMetadata(
            CLAVE_PERMISOS_REQUERIDOS,
            proto[nombre] as object,
          );
          expect(requeridos, clave).toEqual([permiso]);
        });
      }
    });
  }

  it('notificaciones: su única mutación es marcarLeida y no exige permiso (T-254)', () => {
    // Cada usuario marca solo las suyas (404 en lo ajeno) y a quién avisar se decide al crearla.
    // Una mutación nueva en este controlador rompe esta prueba y obliga a decidir su permiso.
    const proto = NotificacionesController.prototype as unknown as Record<string, unknown>;
    const mutaciones = Object.getOwnPropertyNames(proto).filter(
      (n) =>
        n !== 'constructor' &&
        typeof proto[n] === 'function' &&
        MUTACIONES.has(Reflect.getMetadata('method', proto[n] as object) as number),
    );
    expect(mutaciones).toEqual(['marcarLeida']);
    expect(
      Reflect.getMetadata(CLAVE_PERMISOS_REQUERIDOS, proto.marcarLeida as object),
    ).toBeUndefined();
  });

  it('las lecturas y la excepción documentada no exigen permiso de escritura', () => {
    const proto = ConversacionesController.prototype as unknown as Record<string, unknown>;
    expect(Reflect.getMetadata(CLAVE_PERMISOS_REQUERIDOS, proto.leida as object)).toBeUndefined();
  });

  it('las lecturas del archivo de viaje exigen archivo.ver (T-249: hay datos de menores)', () => {
    const proto = ArchivosController.prototype as unknown as Record<string, unknown>;
    // Todos los GET del controlador, no una lista fija: un GET nuevo sin permiso rompe esta prueba.
    const lecturas = Object.getOwnPropertyNames(proto).filter(
      (n) =>
        n !== 'constructor' &&
        typeof proto[n] === 'function' &&
        Reflect.getMetadata('method', proto[n] as object) === RequestMethod.GET,
    );
    expect(lecturas.length).toBeGreaterThan(0);
    for (const nombre of lecturas) {
      expect(
        Reflect.getMetadata(CLAVE_PERMISOS_REQUERIDOS, proto[nombre] as object),
        nombre,
      ).toEqual(['archivo.ver']);
    }
  });

  it('el controlador del archivo de viaje exige archivo.ver en toda ruta, mutaciones incluidas', () => {
    // Las mutaciones devuelven el detalle con pasajeros: archivo.operar sin archivo.ver no lee.
    expect(Reflect.getMetadata(CLAVE_PERMISOS_REQUERIDOS, ArchivosController)).toEqual([
      'archivo.ver',
    ]);
  });
});
