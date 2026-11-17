import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';
import type { AvisoDePlazoV1 } from '@viajapro/contracts';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import type {
  PuertoArchivoDeUnAviso,
  PuertoAsesorDeOportunidad,
  PuertoUsuariosConPermiso,
} from '../../../shared/puertos/puertos-para-avisos.js';
import { AVISOS_DE_PLAZO } from '../domain/aviso-de-plazo.js';
import { ArchivoDelAvisoNoEncontradoError } from '../domain/errors-de-avisos.js';
import type { RepositorioDeAvisos } from './puertos-de-notificaciones.js';
import { RegistrarAvisoDePlazoUseCase } from './registrar-aviso-de-plazo.use-case.js';

const TX = {} as ClienteTenant;
const TENANT = 't-1';
const AVISO: AvisoDePlazoV1 = {
  v: 1,
  reservaId: '0190a1b2-0000-7000-8000-0000000000r1',
  archivoId: '0190a1b2-0000-7000-8000-0000000000f1',
  plazo: 'TIME_LIMIT',
  venceEn: '2027-03-10T15:00:00.000Z',
};
const TIPO = AVISOS_DE_PLAZO[0]!;

function armar(opciones: {
  archivo?: { numero: number; oportunidadId: string | null } | null;
  asesor?: string | null;
  activosConPermiso?: (entre?: readonly string[]) => string[];
}) {
  const leer = vi.fn<PuertoArchivoDeUnAviso['leer']>(() =>
    Promise.resolve(
      opciones.archivo === undefined ? { numero: 1043, oportunidadId: 'o-1' } : opciones.archivo,
    ),
  );
  const asesorDe = vi.fn<PuertoAsesorDeOportunidad['asesorDe']>(() =>
    Promise.resolve(opciones.asesor ?? null),
  );
  const activosConPermiso = vi.fn<PuertoUsuariosConPermiso['activosConPermiso']>(
    (_tx, _t, _p, entre) => Promise.resolve(opciones.activosConPermiso?.(entre) ?? []),
  );
  const crear = vi.fn<RepositorioDeAvisos['crear']>((_tx, _t, nuevas) =>
    Promise.resolve(nuevas.length),
  );
  return {
    uc: new RegistrarAvisoDePlazoUseCase({ leer }, { asesorDe }, { activosConPermiso }, { crear }),
    leer,
    asesorDe,
    activosConPermiso,
    crear,
  };
}

describe('RegistrarAvisoDePlazoUseCase', () => {
  it('con asesor elegible crea una sola notificación, para él, con el número de file y el plazo', async () => {
    const { uc, crear, activosConPermiso } = armar({
      asesor: 'u-asesor',
      activosConPermiso: (entre) => (entre ? [...entre] : ['u-asesor', 'u-otro']),
    });
    const r = await uc.ejecutar(TX, TENANT, 7n, TIPO, AVISO);
    expect(r).toEqual({ destinatarios: 1, creadas: 1 });
    expect(crear).toHaveBeenCalledWith(TX, TENANT, [
      {
        usuarioId: 'u-asesor',
        tipo: 'TIME_LIMIT_PROXIMO',
        outboxId: 7n,
        archivoId: AVISO.archivoId,
        reservaId: AVISO.reservaId,
        archivoNumero: 1043,
        venceEn: new Date(AVISO.venceEn),
      },
    ]);
    // Con asesor elegible no se pide la lista de todos los operadores.
    expect(activosConPermiso).toHaveBeenCalledTimes(1);
  });

  it('si el asesor ya no puede operar, cae en todos los que pueden', async () => {
    const { uc, crear } = armar({
      asesor: 'u-baja',
      activosConPermiso: (entre) => (entre ? [] : ['u-1', 'u-2']),
    });
    const r = await uc.ejecutar(TX, TENANT, 7n, TIPO, AVISO);
    expect(r.destinatarios).toBe(2);
    const nuevas = crear.mock.calls[0]?.[2] ?? [];
    expect(nuevas.map((n) => n.usuarioId)).toEqual(['u-1', 'u-2']);
  });

  it('un archivo sin oportunidad avisa a los operadores sin consultar a crm', async () => {
    const { uc, asesorDe } = armar({
      archivo: { numero: 5, oportunidadId: null },
      activosConPermiso: () => ['u-1'],
    });
    const r = await uc.ejecutar(TX, TENANT, 7n, TIPO, AVISO);
    expect(r.destinatarios).toBe(1);
    expect(asesorDe).not.toHaveBeenCalled();
  });

  it('sin nadie que pueda operar no escribe nada y no falla', async () => {
    const { uc, crear } = armar({ activosConPermiso: () => [] });
    expect(await uc.ejecutar(TX, TENANT, 7n, TIPO, AVISO)).toEqual({
      destinatarios: 0,
      creadas: 0,
    });
    expect(crear).not.toHaveBeenCalled();
  });

  it('un archivo o reserva inexistente en esa agencia lanza un error tipado', async () => {
    const { uc } = armar({ archivo: null });
    await expect(uc.ejecutar(TX, TENANT, 7n, TIPO, AVISO)).rejects.toBeInstanceOf(
      ArchivoDelAvisoNoEncontradoError,
    );
  });

  it('lee el archivo con el tenant de la fila del outbox, no del payload', async () => {
    const { uc, leer } = armar({ activosConPermiso: () => ['u-1'] });
    await uc.ejecutar(TX, TENANT, 7n, TIPO, AVISO);
    expect(leer).toHaveBeenCalledWith(TX, TENANT, AVISO.archivoId, AVISO.reservaId);
  });
});
