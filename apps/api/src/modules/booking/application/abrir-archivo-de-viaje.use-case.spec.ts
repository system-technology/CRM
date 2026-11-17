import type { CotizacionAceptadaV1 } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import type {
  PuertoVersionAceptada,
  VersionAceptada,
} from '../../../shared/puertos/puertos-hacia-quoting.js';
import type { ArchivoPorAbrir } from '../domain/archivo-de-viaje.js';
import { VersionAceptadaNoEncontradaError } from '../domain/errors.js';
import { AbrirArchivoDeViajeUseCase } from './abrir-archivo-de-viaje.use-case.js';
import type { RepositorioDeArchivos } from './puertos-de-archivos.js';

const TENANT = '11111111-1111-4111-8111-111111111111';
const COTIZACION = '22222222-2222-4222-8222-222222222222';
const MAYORISTA = '33333333-3333-4333-8333-333333333333';
const tx = {} as ClienteTenant;

const evento: CotizacionAceptadaV1 = {
  v: 1,
  cotizacionId: COTIZACION,
  version: 3,
  contactoId: '44444444-4444-4444-8444-444444444444',
  oportunidadId: null,
  aceptadaPorUsuarioId: null,
  aceptadaEn: '2026-11-17T10:00:00.000Z',
};

const aceptada: VersionAceptada = {
  cotizacionId: COTIZACION,
  version: 3,
  contactoId: evento.contactoId,
  oportunidadId: null,
  paqueteNombre: 'Cartagena',
  destino: 'Cartagena',
  fechaSalida: '2027-03-10',
  noches: 4,
  adultos: 2,
  ninos: 0,
  infantes: 0,
  ventaUnidades: 4_000_000n,
  netoUnidades: 3_000_000n,
  monedaIso: 'COP',
  trm: null,
  lineas: [{ mayoristaId: MAYORISTA, mayoristaNombre: 'Mayorista', netoUnidades: 3_000_000n }],
};

function armar(respuesta: VersionAceptada | null) {
  const llamadasAlPuerto: unknown[][] = [];
  const abiertos: Array<{ tenantId: string; archivo: ArchivoPorAbrir }> = [];
  const versiones = {
    leer: (...args: unknown[]) => {
      llamadasAlPuerto.push(args);
      return Promise.resolve(respuesta);
    },
  } as unknown as PuertoVersionAceptada;
  const archivos: RepositorioDeArchivos = {
    abrir: (_tx, tenantId, archivo) => {
      abiertos.push({ tenantId, archivo });
      return Promise.resolve({ travelFileId: 'f-1', numero: 1043, creado: true });
    },
  };
  return { caso: new AbrirArchivoDeViajeUseCase(versiones, archivos), llamadasAlPuerto, abiertos };
}

describe('AbrirArchivoDeViajeUseCase', () => {
  it('pide la versión aceptada con la transacción y el tenant de la FILA, y abre el archivo', async () => {
    const { caso, llamadasAlPuerto, abiertos } = armar(aceptada);

    const r = await caso.ejecutar(tx, TENANT, evento);

    expect(r).toEqual({ travelFileId: 'f-1', numero: 1043, creado: true });
    expect(llamadasAlPuerto).toEqual([[tx, TENANT, COTIZACION, 3]]);
    expect(abiertos).toHaveLength(1);
    expect(abiertos[0]?.tenantId).toBe(TENANT);
    expect(abiertos[0]?.archivo.reservas).toEqual([
      {
        mayoristaId: MAYORISTA,
        mayoristaNombre: 'Mayorista',
        netoUnidades: 3_000_000n,
        monedaIso: 'COP',
      },
    ]);
  });

  it('el contacto del archivo es el de la cotización, no el del evento', async () => {
    const otro = '55555555-5555-4555-8555-555555555555';
    const { caso, abiertos } = armar({ ...aceptada, contactoId: otro });
    await caso.ejecutar(tx, TENANT, evento);
    expect(abiertos[0]?.archivo.venta.contactoId).toBe(otro);
  });

  it('si la cotización no existe en esa agencia (o no está aceptada), lanza error tipado y no escribe', async () => {
    const { caso, abiertos } = armar(null);
    const error = await caso.ejecutar(tx, TENANT, evento).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VersionAceptadaNoEncontradaError);
    expect((error as VersionAceptadaNoEncontradaError).code).toBe('VERSION_ACEPTADA_NO_ENCONTRADA');
    expect(abiertos).toEqual([]);
  });

  it('un evento repetido devuelve el archivo existente sin crear otro', async () => {
    const versiones = { leer: () => Promise.resolve(aceptada) } as unknown as PuertoVersionAceptada;
    let creados = 0;
    const archivos: RepositorioDeArchivos = {
      abrir: () => {
        const creado = creados === 0;
        creados += creado ? 1 : 0;
        return Promise.resolve({ travelFileId: 'f-1', numero: 1043, creado });
      },
    };
    const caso = new AbrirArchivoDeViajeUseCase(versiones, archivos);
    expect((await caso.ejecutar(tx, TENANT, evento)).creado).toBe(true);
    expect((await caso.ejecutar(tx, TENANT, evento)).creado).toBe(false);
    expect(creados).toBe(1);
  });
});
