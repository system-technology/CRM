import { TIPO_COTIZACION_ACEPTADA } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import type { EventoEntregado } from '../../../shared/eventos/consumidor-de-eventos.js';
import { RegistroDeConsumidores } from '../../../shared/eventos/registro-de-consumidores.js';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import type { AbrirArchivoDeViajeUseCase } from '../application/abrir-archivo-de-viaje.use-case.js';
import { EventoDeAceptacionInvalidoError } from '../domain/errors.js';
import { CONSUMIDOR_ABRIR_ARCHIVO, ConsumidorAbrirArchivo } from './consumidor-abrir-archivo.js';

const TENANT = '11111111-1111-4111-8111-111111111111';
const COTIZACION = '22222222-2222-4222-8222-222222222222';
const tx = {} as ClienteTenant;

const payloadValido = {
  v: 1,
  cotizacionId: COTIZACION,
  version: 1,
  contactoId: '44444444-4444-4444-8444-444444444444',
  oportunidadId: null,
  aceptadaPorUsuarioId: null,
  aceptadaEn: '2026-11-17T10:00:00.000Z',
};

const evento = (payload: unknown, agregadoId = COTIZACION): EventoEntregado => ({
  outboxId: 7n,
  tenantId: TENANT,
  tipo: TIPO_COTIZACION_ACEPTADA,
  agregadoId,
  version: 1,
  payload,
});

function armar() {
  const llamadas: Array<{ tenantId: string; cotizacionId: string }> = [];
  const caso = {
    ejecutar: (_tx: ClienteTenant, tenantId: string, e: { cotizacionId: string }) => {
      llamadas.push({ tenantId, cotizacionId: e.cotizacionId });
      return Promise.resolve({ travelFileId: 'f', numero: 1, creado: true });
    },
  } as unknown as AbrirArchivoDeViajeUseCase;
  const registro = new RegistroDeConsumidores();
  return { consumidor: new ConsumidorAbrirArchivo(caso, registro), registro, llamadas };
}

describe('ConsumidorAbrirArchivo', () => {
  it('se registra con su nombre estable y el tipo de evento que consume', () => {
    const { consumidor, registro } = armar();
    consumidor.onModuleInit();
    expect(registro.todos()).toEqual([consumidor]);
    expect(consumidor.nombre).toBe('booking.abrir_archivo');
    expect(CONSUMIDOR_ABRIR_ARCHIVO).toBe(consumidor.nombre);
    expect(consumidor.tipoEvento).toBe('quoting.cotizacion_aceptada');
  });

  it('entrega al caso de uso con el tenant de la FILA del outbox', async () => {
    const { consumidor, llamadas } = armar();
    await consumidor.consumir(tx, evento(payloadValido));
    expect(llamadas).toEqual([{ tenantId: TENANT, cotizacionId: COTIZACION }]);
  });

  it('un payload que no es CotizacionAceptada v1 lanza error tipado y no llega al caso de uso', async () => {
    const { consumidor, llamadas } = armar();
    const error = await consumidor
      .consumir(tx, evento({ ...payloadValido, version: 0 }))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EventoDeAceptacionInvalidoError);
    expect(llamadas).toEqual([]);
  });

  it('el mensaje del error no copia los valores del payload', async () => {
    const { consumidor } = armar();
    const error = (await consumidor
      .consumir(tx, evento({ ...payloadValido, contactoId: 'dato-personal-secreto' }))
      .catch((e: unknown) => e)) as Error;
    expect(error.message).not.toContain('dato-personal-secreto');
  });

  it('un agregado que no coincide con la cotización del payload se rechaza', async () => {
    const { consumidor, llamadas } = armar();
    await expect(
      consumidor.consumir(tx, evento(payloadValido, '99999999-9999-4999-8999-999999999999')),
    ).rejects.toBeInstanceOf(EventoDeAceptacionInvalidoError);
    expect(llamadas).toEqual([]);
  });
});
