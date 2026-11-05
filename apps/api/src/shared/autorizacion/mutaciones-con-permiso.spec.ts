/**
 * T-089: ninguna ruta que modifica datos de negocio queda sin `@RequierePermiso`. El guard global
 * hace cumplir la metadata (`permisos.spec.ts` lo prueba); aquí se fija que cada mutación la
 * declare, y que una ruta nueva sin permiso rompa esta prueba en vez de quedar abierta.
 */
import 'reflect-metadata';

import { RequestMethod } from '@nestjs/common';
import type { Permiso } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import { CrmController } from '../../modules/crm/interface/crm.controller.js';
import { ConversacionesController } from '../../modules/inbox/interface/conversaciones.controller.js';
import { CotizacionesController } from '../../modules/quoting/interface/cotizaciones.controller.js';
import { CLAVE_PERMISOS_REQUERIDOS } from './permiso.decorator.js';

const MUTACIONES = new Set<number>([RequestMethod.POST, RequestMethod.PUT, RequestMethod.PATCH]);

/**
 * Mutaciones que NO exigen permiso, con su razón. `leida` es el estado de lectura de quien mira:
 * un usuario de solo lectura debe poder abrir una conversación sin recibir 403.
 */
const SIN_PERMISO = new Set(['ConversacionesController.leida']);

const CONTROLADORES: ReadonlyArray<readonly [abstract new (...args: never[]) => object, Permiso]> =
  [
    [ConversacionesController, 'bandeja.operar'],
    [CrmController, 'crm.escribir'],
    [CotizacionesController, 'cotizacion.escribir'],
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

  it('las lecturas y la excepción documentada no exigen permiso de escritura', () => {
    const proto = ConversacionesController.prototype as unknown as Record<string, unknown>;
    expect(Reflect.getMetadata(CLAVE_PERMISOS_REQUERIDOS, proto.leida as object)).toBeUndefined();
  });
});
