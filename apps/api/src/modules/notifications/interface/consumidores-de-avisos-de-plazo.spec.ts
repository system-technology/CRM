import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';
import { RegistroDeConsumidores } from '../../../shared/eventos/registro-de-consumidores.js';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import type { RegistrarAvisoDePlazoUseCase } from '../application/registrar-aviso-de-plazo.use-case.js';
import { AVISOS_DE_PLAZO } from '../domain/aviso-de-plazo.js';
import { EventoDeAvisoInvalidoError } from '../domain/errors-de-avisos.js';
import {
  ConsumidoresDeAvisosDePlazo,
  crearConsumidorDeAviso,
} from './consumidores-de-avisos-de-plazo.js';

const TX = {} as ClienteTenant;
const RESERVA = '0190a1b2-0000-7000-8000-0000000000a1';
const ARCHIVO = '0190a1b2-0000-7000-8000-0000000000b1';
const PAYLOAD = {
  v: 1,
  reservaId: RESERVA,
  archivoId: ARCHIVO,
  plazo: 'TIME_LIMIT',
  venceEn: '2027-03-10T15:00:00.000Z',
};
const evento = (payload: unknown, agregadoId = RESERVA) => ({
  outboxId: 9n,
  tenantId: 'tenant-de-la-fila',
  tipo: 'booking.time_limit_proximo',
  agregadoId,
  version: 1,
  payload,
});

describe('consumidores de avisos de plazo', () => {
  it('se registran cuatro, uno por tipo, en el registro del despachador', () => {
    const registro = new RegistroDeConsumidores();
    new ConsumidoresDeAvisosDePlazo({} as RegistrarAvisoDePlazoUseCase, registro).onModuleInit();
    expect(
      registro
        .todos()
        .map((c) => c.tipoEvento)
        .sort(),
    ).toEqual(AVISOS_DE_PLAZO.map((a) => a.tipoEvento).sort());
  });

  it('valida el payload con el esquema de contracts y usa el tenant de la FILA', async () => {
    const ejecutar = vi.fn(() => Promise.resolve({ destinatarios: 1, creadas: 1 }));
    const tipo = AVISOS_DE_PLAZO[0]!;
    const c = crearConsumidorDeAviso(tipo, { ejecutar } as unknown as RegistrarAvisoDePlazoUseCase);
    await c.consumir(TX, evento(PAYLOAD));
    expect(ejecutar).toHaveBeenCalledWith(TX, 'tenant-de-la-fila', 9n, tipo, PAYLOAD);
  });

  it('un payload con otra forma, o de otra reserva que el agregado, lanza error tipado y no escribe', async () => {
    const ejecutar = vi.fn();
    const c = crearConsumidorDeAviso(AVISOS_DE_PLAZO[0]!, {
      ejecutar,
    } as unknown as RegistrarAvisoDePlazoUseCase);
    await expect(c.consumir(TX, evento({ v: 1 }))).rejects.toBeInstanceOf(
      EventoDeAvisoInvalidoError,
    );
    await expect(c.consumir(TX, evento(PAYLOAD, ARCHIVO))).rejects.toBeInstanceOf(
      EventoDeAvisoInvalidoError,
    );
    expect(ejecutar).not.toHaveBeenCalled();
  });
});
