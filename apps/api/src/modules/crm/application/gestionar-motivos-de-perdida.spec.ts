import 'reflect-metadata';

import type { MotivoDePerdida } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import { CLAVE_PERMISOS_REQUERIDOS } from '../../../shared/autorizacion/permiso.decorator.js';
import { MotivoDePerdidaNoEncontradoError } from '../domain/errors.js';
import { CrmController } from '../interface/crm.controller.js';
import { GestionarMotivosDePerdida } from './gestionar-motivos-de-perdida.js';
import type { PuertoMotivosDePerdida } from './puerto-motivos-de-perdida.js';

const MOTIVO: MotivoDePerdida = {
  id: '01932000-0000-7000-8000-00000000000b',
  clave: null,
  etiqueta: 'Visa negada',
  orden: 7,
  activo: true,
  exigeNota: false,
};

function armar(actualizado: MotivoDePerdida | null): {
  uc: GestionarMotivosDePerdida;
  listados: boolean[];
  actores: Array<string | null>;
} {
  const listados: boolean[] = [];
  const actores: Array<string | null> = [];
  const puerto: PuertoMotivosDePerdida = {
    listar: (incluir) => {
      listados.push(incluir);
      return Promise.resolve([MOTIVO]);
    },
    buscar: () => Promise.resolve(MOTIVO),
    crear: (_d, actor) => {
      actores.push(actor);
      return Promise.resolve(MOTIVO);
    },
    actualizar: (_id, _c, actor) => {
      actores.push(actor);
      return Promise.resolve(actualizado);
    },
  };
  return { uc: new GestionarMotivosDePerdida(puerto), listados, actores };
}

describe('GestionarMotivosDePerdida', () => {
  it('listar pasa el indicador de inactivos al puerto', async () => {
    const { uc, listados } = armar(MOTIVO);
    await uc.listar(false);
    await uc.listar(true);
    expect(listados).toEqual([false, true]);
  });

  it('crear y actualizar llevan al actor', async () => {
    const { uc, actores } = armar(MOTIVO);
    await uc.crear({ etiqueta: 'Visa negada', exigeNota: false }, 'u-1');
    await uc.actualizar(MOTIVO.id, { activo: false }, 'u-2');
    expect(actores).toEqual(['u-1', 'u-2']);
  });

  it('actualizar un motivo que no existe en la agencia es MOTIVO_DE_PERDIDA_NO_ENCONTRADO', async () => {
    await expect(
      armar(null).uc.actualizar(MOTIVO.id, { activo: false }, null),
    ).rejects.toBeInstanceOf(MotivoDePerdidaNoEncontradoError);
  });
});

describe('permisos de las rutas de motivos de pérdida', () => {
  const proto = CrmController.prototype as unknown as Record<string, object>;
  const exigido = (ruta: string): unknown =>
    Reflect.getMetadata(CLAVE_PERMISOS_REQUERIDOS, proto[ruta] as object);

  it('mutar exige crm.escribir y leer no exige nada', () => {
    for (const ruta of ['crearMotivoDePerdida', 'actualizarMotivoDePerdida']) {
      expect(exigido(ruta)).toEqual(['crm.escribir']);
    }
    expect(exigido('listarMotivosDePerdida')).toBeUndefined();
  });
});
