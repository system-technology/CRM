import 'reflect-metadata';

import type { EtapaDefinida } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import { CLAVE_PERMISOS_REQUERIDOS } from '../../../shared/autorizacion/permiso.decorator.js';
import { EtapaNoEncontradaError } from '../domain/errors.js';
import { CrmController } from '../interface/crm.controller.js';
import { GestionarEtapas } from './gestionar-etapas.js';
import type { PuertoCrm } from './puerto-crm.js';
import type { PuertoEtapas } from './puerto-etapas.js';

const ETAPA: EtapaDefinida = {
  id: '01932000-0000-7000-8000-00000000000a',
  clave: null,
  nombre: 'Esperando anticipo',
  orden: 0,
  probabilidad: 40,
  esGanada: false,
  esPerdida: false,
};

function armar(editado: EtapaDefinida | null): { uc: GestionarEtapas; llamadas: string[] } {
  const llamadas: string[] = [];
  const crm = { listarEtapas: () => Promise.resolve([ETAPA]) } as unknown as PuertoCrm;
  const puerto: PuertoEtapas = {
    crear: () => Promise.resolve(ETAPA),
    editar: () => Promise.resolve(editado),
    reordenar: (ids) => {
      llamadas.push(ids.join(','));
      return Promise.resolve([ETAPA]);
    },
  };
  return { uc: new GestionarEtapas(crm, puerto), llamadas };
}

describe('GestionarEtapas', () => {
  it('lista desde el puerto de lectura', async () => {
    expect(await armar(ETAPA).uc.listar()).toEqual([ETAPA]);
  });

  it('editar una etapa que no existe en la agencia es ETAPA_NO_ENCONTRADA', async () => {
    await expect(armar(null).uc.editar(ETAPA.id, { nombre: 'X' })).rejects.toBeInstanceOf(
      EtapaNoEncontradaError,
    );
  });

  it('reordenar delega los ids tal cual en una sola llamada', async () => {
    const { uc, llamadas } = armar(ETAPA);
    await uc.reordenar({ ids: ['a', 'b'] });
    expect(llamadas).toEqual(['a,b']);
  });
});

describe('permisos de las rutas de etapas', () => {
  const proto = CrmController.prototype as unknown as Record<string, object>;
  const exigido = (ruta: string): unknown =>
    Reflect.getMetadata(CLAVE_PERMISOS_REQUERIDOS, proto[ruta] as object);

  it('mutar exige crm.escribir y leer no exige nada', () => {
    for (const ruta of ['crearEtapa', 'editarEtapa', 'reordenarEtapas']) {
      expect(exigido(ruta)).toEqual(['crm.escribir']);
    }
    expect(exigido('listarEtapas')).toBeUndefined();
  });
});
