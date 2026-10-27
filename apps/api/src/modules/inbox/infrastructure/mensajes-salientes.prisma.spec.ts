/**
 * T-059: la carrera tras un trabajo estancado. El primer intento llama a Meta y se queda colgado;
 * la cola lanza un segundo, que encuentra la reserva tomada y marca el mensaje `FALLIDO` «sin
 * confirmar»; después el primero recibe el acuse y guarda el `wamid`. El estado final tiene que
 * seguir a Meta, no a nuestra suposición.
 *
 * La base es un doble en memoria que evalúa los `where` de igualdad que usa el adaptador: lo que se
 * comprueba es la secuencia de escrituras condicionales, no Postgres.
 */
import { describe, expect, it } from 'vitest';
import type { PrismaWebhookService } from '../../../shared/prisma/prisma-webhook.service.js';
import { EnvioSinConfirmarError, FueraDeVentanaError } from '../domain/errores-de-envio.js';
import { estadoTrasReporte } from '../domain/estado-de-entrega.js';
import { MensajesSalientesPrisma } from './mensajes-salientes.prisma.js';

const TENANT = '01932000-0000-7000-8000-00000000000a';
const MENSAJE = '01932000-0000-7000-8000-0000000000aa';
const CONVERSACION = '01932000-0000-7000-8000-0000000000cc';

type Fila = Record<string, unknown>;

function baseEnMemoria(inicial: Fila = {}) {
  const fila: Fila = {
    id: MENSAJE,
    tenantId: TENANT,
    conversacionId: CONVERSACION,
    direccion: 'SALIENTE',
    estado: 'PENDIENTE',
    wamid: null,
    codigoErrorMeta: null,
    motivoFallo: null,
    ...inicial,
  };
  const outbox: Fila[] = [];
  const cumple = (where: Fila) => Object.entries(where).every(([k, v]) => fila[k] === v);
  const tx = {
    mensaje: {
      updateMany: ({ where, data }: { where: Fila; data: Fila }) => {
        if (!cumple(where)) return Promise.resolve({ count: 0 });
        Object.assign(fila, data);
        return Promise.resolve({ count: 1 });
      },
      findFirstOrThrow: () => Promise.resolve({ conversacionId: fila['conversacionId'] }),
    },
    outbox: {
      create: ({ data }: { data: Fila }) => {
        outbox.push(data);
        return Promise.resolve(data);
      },
    },
  };
  const prisma = {
    conTenantResuelto: <T>(_t: string, fn: (t: typeof tx) => Promise<T>) => fn(tx),
  } as unknown as PrismaWebhookService;
  return { fila, outbox, adaptador: new MensajesSalientesPrisma(prisma) };
}

describe('MensajesSalientesPrisma.registrarAceptado — carrera tras un trabajo estancado (T-059)', () => {
  it('el acuse de Meta devuelve a PENDIENTE un FALLIDO «sin confirmar» y anula el motivo', async () => {
    const { fila, outbox, adaptador } = baseEnMemoria();

    // Segundo intento: la reserva ya existía, no reenvía y marca «sin confirmar».
    expect(await adaptador.registrarFallo(TENANT, MENSAJE, new EnvioSinConfirmarError())).toBe(
      true,
    );
    expect(fila).toMatchObject({ estado: 'FALLIDO', codigoErrorMeta: null });
    expect(fila['motivoFallo']).not.toBeNull();

    // Primer intento: por fin responde Meta con el wamid.
    await adaptador.registrarAceptado(TENANT, MENSAJE, 'wamid.TARDIO');
    expect(fila).toMatchObject({
      estado: 'PENDIENTE',
      wamid: 'wamid.TARDIO',
      codigoErrorMeta: null,
      motivoFallo: null,
    });
    // Un evento por el fallo y otro por la corrección: la bandeja deja de mostrar el error.
    expect(outbox).toHaveLength(2);

    // Y los webhooks de estado, que ya lo identifican por wamid, lo hacen avanzar.
    expect(estadoTrasReporte('PENDIENTE', 'ENTREGADO', true)).toBe('ENTREGADO');
    // Sin la corrección, el FALLIDO terminal se habría tragado el acuse.
    expect(estadoTrasReporte('FALLIDO', 'ENTREGADO', true)).toBeNull();
  });

  it('sin la carrera, solo guarda el wamid y no toca el estado', async () => {
    const { fila, outbox, adaptador } = baseEnMemoria();
    await adaptador.registrarAceptado(TENANT, MENSAJE, 'wamid.OK');
    expect(fila).toMatchObject({ estado: 'PENDIENTE', wamid: 'wamid.OK' });
    expect(outbox).toHaveLength(0);
  });

  it('un FALLIDO con código de Meta es un rechazo real y no se revive', async () => {
    const { fila, adaptador } = baseEnMemoria();
    await adaptador.registrarFallo(TENANT, MENSAJE, new FueraDeVentanaError());
    const motivo = fila['motivoFallo'];
    expect(fila['codigoErrorMeta']).toBe(131047);
    await adaptador.registrarAceptado(TENANT, MENSAJE, 'wamid.X');
    expect(fila['estado']).toBe('FALLIDO');
    expect(fila['motivoFallo']).toBe(motivo);
  });

  it('si un webhook ya guardó el wamid, no se pisa', async () => {
    const { fila, adaptador } = baseEnMemoria({ wamid: 'wamid.DEL_WEBHOOK', estado: 'ENVIADO' });
    await adaptador.registrarAceptado(TENANT, MENSAJE, 'wamid.OTRO');
    expect(fila).toMatchObject({ wamid: 'wamid.DEL_WEBHOOK', estado: 'ENVIADO' });
  });
});
