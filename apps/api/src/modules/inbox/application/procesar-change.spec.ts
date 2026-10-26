/**
 * El caso de uso del trabajador, con staging y bandeja de mentira.
 *
 * Lo que se comprueba es la DECISIÓN: qué ramas escriben negocio y cuáles clasifican y
 * descartan, y que un change ya resuelto no se vuelva a tocar.
 */
import { PuertoAvisoDeOutbox } from './puertos-de-eventos.js';
import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { claveDeEnrutamiento } from '../domain/clave-de-enrutamiento.js';
import type { CambioDeEstado, MensajeEntrante } from '../domain/contenido-del-cambio.js';
import { identificarRecepcion } from '../domain/identidad-recepcion.js';
import { sellarPayload } from '../domain/payload-sellado.js';
import { ProcesarChange } from './procesar-change.js';
import {
  type ChangeTomado,
  type EnrutamientoResuelto,
  PuertoBandeja,
  PuertoStaging,
  type ResultadoDeBandeja,
  type ResultadoDeEstado,
} from './puertos-de-proceso.js';

const PIMIENTA = 'pimienta-de-pruebas';
const CLAVE = randomBytes(32);
const TENANT = '01932000-0000-7000-8000-00000000000a';
const CANAL = '01932000-0000-7000-8000-00000000000b';
const NUMERO = '106540352242922';
const ENTORNO = {
  WHATSAPP_DIRECTORY_PEPPER: PIMIENTA,
  WEBHOOK_PAYLOAD_KEY: CLAVE.toString('hex'),
  WEBHOOK_PAYLOAD_KEY_VERSION: '1',
};

function sobre(numero: string, ids: string[], campo = 'messages'): Buffer {
  return Buffer.from(
    JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '1',
          changes: [
            {
              field: campo,
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: numero },
                messages: ids.map((id) => ({
                  from: '573001112233',
                  id,
                  timestamp: '1760900000',
                  type: 'text',
                  text: { body: 'hola' },
                })),
              },
            },
          ],
        },
      ],
    }),
  );
}

class StagingFalso extends PuertoStaging {
  directorio = new Map<string, EnrutamientoResuelto>();
  cerrados: string[] = [];
  constructor(private change: ChangeTomado | null) {
    super();
  }
  tomar(): Promise<ChangeTomado | null> {
    return Promise.resolve(this.change);
  }
  resolver(clave: Buffer): Promise<EnrutamientoResuelto | null> {
    return Promise.resolve(this.directorio.get(clave.toString('hex')) ?? null);
  }
  cerrar(_r: Buffer, _i: number, estado: 'PROCESADO' | 'CLASIFICADO'): Promise<void> {
    this.cerrados.push(estado);
    return Promise.resolve();
  }
}

class BandejaFalsa extends PuertoBandeja {
  recibidos: MensajeEntrante[] = [];
  respuesta: ResultadoDeBandeja = 'CREADO';
  registrarEntrante(_t: string, _c: string, m: MensajeEntrante): Promise<ResultadoDeBandeja> {
    this.recibidos.push(m);
    return Promise.resolve(this.respuesta);
  }
  estados: Array<{ tenantId: string; cambio: CambioDeEstado }> = [];
  aplicarEstado(tenantId: string, cambio: CambioDeEstado): Promise<ResultadoDeEstado> {
    this.estados.push({ tenantId, cambio });
    return Promise.resolve('APLICADO');
  }
}

class AvisosFalsos extends PuertoAvisoDeOutbox {
  avisados: string[] = [];
  avisar(t: string): void {
    this.avisados.push(t);
  }
  tomarAvisos(): string[] {
    return [];
  }
}

function montar(
  cuerpo: Buffer,
  ruta?: EnrutamientoResuelto,
  estado: ChangeTomado['estado'] = 'PENDIENTE',
) {
  const id = identificarRecepcion(cuerpo);
  const s = sellarPayload(cuerpo, CLAVE, id);
  const staging = new StagingFalso({
    cifrado: s.cifrado,
    nonce: s.nonce,
    tag: s.tag,
    claveVersion: 1,
    estado,
  });
  if (ruta)
    staging.directorio.set(claveDeEnrutamiento(PIMIENTA, 'pn', NUMERO).toString('hex'), ruta);
  const bandeja = new BandejaFalsa();
  return { id, staging, bandeja, caso: new ProcesarChange(staging, bandeja) };
}

describe('ProcesarChange: la pista al relay del outbox', () => {
  const ruta = { tenantId: TENANT, canalId: CANAL, estado: 'ACTIVO' as const };
  const cuerpo = sobre(NUMERO, ['wamid.A']);

  class Pistas extends PuertoAvisoDeOutbox {
    avisados: string[] = [];
    avisar(t: string): void {
      this.avisados.push(t);
    }
    tomarAvisos(): string[] {
      return [];
    }
  }

  it('avisa del tenant RESUELTO cuando hay mensajes nuevos', async () => {
    const { id, staging, bandeja } = montar(cuerpo, ruta);
    const pistas = new Pistas();
    await new ProcesarChange(staging, bandeja, pistas).ejecutar(id, 0, ENTORNO);
    expect(pistas.avisados).toEqual([TENANT]);
  });

  it('no avisa si todo eran repetidos (no hay evento nuevo)', async () => {
    const { id, staging, bandeja } = montar(cuerpo, ruta);
    bandeja.respuesta = 'DUPLICADO';
    const pistas = new Pistas();
    await new ProcesarChange(staging, bandeja, pistas).ejecutar(id, 0, ENTORNO);
    expect(pistas.avisados).toEqual([]);
  });

  it('funciona sin pista: el barrido del relay lo publicaría igual', async () => {
    const { id, caso } = montar(cuerpo, ruta);
    await expect(caso.ejecutar(id, 0, ENTORNO)).resolves.toMatchObject({ estado: 'PROCESADO' });
  });
});

describe('ProcesarChange', () => {
  let cuerpo: Buffer;
  beforeEach(() => {
    cuerpo = sobre(NUMERO, ['wamid.A', 'wamid.B']);
  });

  it('ACTIVO: escribe cada mensaje bajo el tenant resuelto y cierra PROCESADO', async () => {
    const { caso, id, staging, bandeja } = montar(cuerpo, {
      tenantId: TENANT,
      canalId: CANAL,
      estado: 'ACTIVO',
    });
    const r = await caso.ejecutar(id, 0, ENTORNO);
    expect(r).toEqual({
      estado: 'PROCESADO',
      mensajesNuevos: 2,
      mensajesRepetidos: 0,
      estadosAplicados: 0,
    });
    expect(bandeja.recibidos.map((m) => m.wamid)).toEqual(['wamid.A', 'wamid.B']);
    expect(staging.cerrados).toEqual(['PROCESADO']);
  });

  it('un acuse de estado se aplica bajo el tenant RESUELTO, con la referencia nuestra', async () => {
    const referencia = '01932000-0000-7000-8000-0000000000ee';
    const conEstado = Buffer.from(
      JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '1',
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: { phone_number_id: NUMERO },
                  statuses: [
                    {
                      id: 'wamid.S',
                      status: 'delivered',
                      timestamp: '1760900000',
                      recipient_id: '573001112233',
                      biz_opaque_callback_data: referencia,
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    );
    const pistas = new AvisosFalsos();
    const { id, staging, bandeja } = montar(conEstado, {
      tenantId: TENANT,
      canalId: CANAL,
      estado: 'ACTIVO',
    });
    const r = await new ProcesarChange(staging, bandeja, pistas).ejecutar(id, 0, ENTORNO);
    expect(r).toEqual({
      estado: 'PROCESADO',
      mensajesNuevos: 0,
      mensajesRepetidos: 0,
      estadosAplicados: 1,
    });
    expect(bandeja.estados).toHaveLength(1);
    expect(bandeja.estados[0]?.tenantId).toBe(TENANT);
    expect(bandeja.estados[0]?.cambio).toMatchObject({
      wamid: 'wamid.S',
      estado: 'ENTREGADO',
      referencia,
    });
    // Un estado aplicado también despierta al relay: el socket del asesor ve el doble check.
    expect(pistas.avisados).toEqual([TENANT]);
  });

  it('SUSPENDIDO también se persiste: el historial del cliente debe estar completo', async () => {
    const { caso, id, bandeja } = montar(cuerpo, {
      tenantId: TENANT,
      canalId: CANAL,
      estado: 'SUSPENDIDO',
    });
    await caso.ejecutar(id, 0, ENTORNO);
    expect(bandeja.recibidos).toHaveLength(2);
  });

  it('número desconocido: clasifica, descarta y NO escribe filas de negocio', async () => {
    const { caso, id, staging, bandeja } = montar(cuerpo);
    const r = await caso.ejecutar(id, 0, ENTORNO);
    expect(r).toEqual({ estado: 'CLASIFICADO', motivo: 'DESCONOCIDO' });
    expect(bandeja.recibidos).toHaveLength(0);
    expect(staging.cerrados).toEqual(['CLASIFICADO']);
  });

  it('número desconocido DURANTE una reconstrucción: retiene, no borra', async () => {
    const { caso, id, staging } = montar(cuerpo);
    const r = await caso.ejecutar(id, 0, {
      ...ENTORNO,
      WHATSAPP_DIRECTORY_REBUILD_IN_PROGRESS: 'true',
    });
    expect(r).toEqual({ estado: 'RETENIDO' });
    expect(staging.cerrados).toHaveLength(0);
  });

  it('REVOCADO en el directorio: clasifica y no escribe', async () => {
    const { caso, id, bandeja, staging } = montar(cuerpo, {
      tenantId: TENANT,
      canalId: CANAL,
      estado: 'REVOCADO',
    });
    const r = await caso.ejecutar(id, 0, ENTORNO);
    expect(r).toEqual({ estado: 'CLASIFICADO', motivo: 'REVOCADO' });
    expect(bandeja.recibidos).toHaveLength(0);
    expect(staging.cerrados).toEqual(['CLASIFICADO']);
  });

  it('directorio dice ACTIVO pero la verdad dice revocado (tarea 4f): manda la verdad', async () => {
    const { caso, id, bandeja, staging } = montar(cuerpo, {
      tenantId: TENANT,
      canalId: CANAL,
      estado: 'ACTIVO',
    });
    bandeja.respuesta = 'CANAL_REVOCADO';
    const r = await caso.ejecutar(id, 0, ENTORNO);
    expect(r).toEqual({ estado: 'CLASIFICADO', motivo: 'REVOCADO' });
    expect(staging.cerrados).toEqual(['CLASIFICADO']);
  });

  it('un change ya resuelto no se vuelve a procesar', async () => {
    const { caso, id, bandeja, staging } = montar(
      cuerpo,
      { tenantId: TENANT, canalId: CANAL, estado: 'ACTIVO' },
      'PROCESADO',
    );
    expect(await caso.ejecutar(id, 0, ENTORNO)).toEqual({ estado: 'YA_RESUELTO' });
    expect(bandeja.recibidos).toHaveLength(0);
    expect(staging.cerrados).toHaveLength(0);
  });

  it('mensajes repetidos (mismo wamid) se cuentan como repetidos y el change cierra igual', async () => {
    const { caso, id, bandeja } = montar(cuerpo, {
      tenantId: TENANT,
      canalId: CANAL,
      estado: 'ACTIVO',
    });
    bandeja.respuesta = 'DUPLICADO';
    expect(await caso.ejecutar(id, 0, ENTORNO)).toEqual({
      estado: 'PROCESADO',
      mensajesNuevos: 0,
      mensajesRepetidos: 2,
      estadosAplicados: 0,
    });
  });

  it('un campo de gestión se clasifica: no hay manejador todavía', async () => {
    const { caso, id, staging } = montar(sobre(NUMERO, [], 'message_template_status_update'));
    expect(await caso.ejecutar(id, 0, ENTORNO)).toEqual({
      estado: 'CLASIFICADO',
      motivo: 'CAMPO_NO_SOPORTADO',
    });
    expect(staging.cerrados).toEqual(['CLASIFICADO']);
  });

  it('el índice de un change que no existe en el sobre se clasifica', async () => {
    const { caso, id } = montar(cuerpo);
    expect(await caso.ejecutar(id, 7, ENTORNO)).toEqual({
      estado: 'CLASIFICADO',
      motivo: 'SIN_CAMBIO',
    });
  });

  it('un contenido que no corresponde a su identificador no se procesa', async () => {
    const { caso, staging } = montar(cuerpo);
    await expect(caso.ejecutar(randomBytes(32), 0, ENTORNO)).rejects.toThrow();
    expect(staging.cerrados).toHaveLength(0);
  });

  it('sin pimienta no se resuelve ningún tenant', async () => {
    const { caso, id } = montar(cuerpo);
    await expect(
      caso.ejecutar(id, 0, { ...ENTORNO, WHATSAPP_DIRECTORY_PEPPER: undefined }),
    ).rejects.toThrow(/PEPPER/);
  });

  it('la pimienta anterior sigue resolviendo durante una rotación', async () => {
    const { caso, id, bandeja, staging } = montar(cuerpo);
    staging.directorio.set(claveDeEnrutamiento('vieja', 'pn', NUMERO).toString('hex'), {
      tenantId: TENANT,
      canalId: CANAL,
      estado: 'ACTIVO',
    });
    await caso.ejecutar(id, 0, {
      ...ENTORNO,
      WHATSAPP_DIRECTORY_PEPPER: 'nueva',
      WHATSAPP_DIRECTORY_PEPPER_PREVIOUS: 'vieja',
    });
    expect(bandeja.recibidos).toHaveLength(2);
  });
});
