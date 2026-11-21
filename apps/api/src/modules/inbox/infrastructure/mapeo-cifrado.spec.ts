/**
 * ADR-0015 y aislamiento: los mapeadores derivan clave y AAD con el tenant de la SESIÓN (o del
 * evento), nunca con el `tenant_id` que trae la fila. Una fila de otra agencia que llegue hasta aquí
 * (un fallo de RLS, un filtro olvidado) no se descifra: se lanza antes de intentarlo.
 */
import { randomBytes } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CifradoDeCampos } from '../../../shared/cifrado/cifrado-de-campos.js';
import {
  columnasDeTexto,
  columnasDeUltimoMensaje,
} from '../../../shared/cifrado/columnas-de-prisma.js';
import {
  CampoCifradoDeOtraAgenciaError,
  COLUMNAS_CIFRADAS,
} from '../../../shared/cifrado/puerto-de-cifrado.js';
import { uuidV7 } from '../../../shared/cifrado/uuid-v7.js';
import { aMensaje, aResumen, type FilaDeMensaje, type FilaDeResumen } from './mapeo.js';

const cifrado = new CifradoDeCampos({ version: 1, actual: randomBytes(32), anterior: null });
const TENANT_A = uuidV7();
const TENANT_B = uuidV7();

beforeAll(() => Logger.overrideLogger(false));
afterAll(() => Logger.overrideLogger(true));

function filaDeMensaje(tenantId: string): FilaDeMensaje {
  const id = uuidV7();
  return {
    id,
    tenantId,
    conversacionId: uuidV7(),
    direccion: 'ENTRANTE',
    tipo: 'TEXTO',
    ...columnasDeTexto(
      cifrado.cifrar(COLUMNAS_CIFRADAS.MENSAJES_TEXTO, tenantId, id, 'Pasaporte AB1'),
    ),
    estado: 'ENTREGADO',
    motivoFallo: null,
    autorId: null,
    cotizacionId: null,
    ocurridoEn: new Date(),
    autor: null,
  };
}

function filaDeResumen(tenantId: string): FilaDeResumen {
  const id = uuidV7();
  return {
    id,
    tenantId,
    contactoId: uuidV7(),
    estado: 'ABIERTA',
    asignadoAId: null,
    ultimoMensajeClienteEn: null,
    ...columnasDeUltimoMensaje(
      cifrado.cifrar(COLUMNAS_CIFRADAS.CONVERSACIONES_ULTIMO_MENSAJE_TEXTO, tenantId, id, 'Hola'),
    ),
    ultimoMensajeEn: new Date(),
    ultimoMensajeDireccion: 'ENTRANTE',
    mensajesSinLeer: 0,
    slaVenceEn: null,
    primeraRespuestaEn: null,
    etiquetasAsignadas: [],
    contacto: { nombre: 'Viajera', telefonoE164: '+573001234567' },
    asignadoA: null,
  };
}

describe('mapeo: el tenant de la sesión manda sobre el de la fila', () => {
  it('con la sesión de la agencia dueña, descifra', () => {
    expect(aMensaje(filaDeMensaje(TENANT_A), cifrado, TENANT_A).texto).toBe('Pasaporte AB1');
    expect(
      aResumen(filaDeResumen(TENANT_A), new Date(), cifrado, TENANT_A).ultimoMensajeTexto,
    ).toBe('Hola');
  });

  it('una fila de OTRA agencia no se descifra aunque llegue al mapeador', () => {
    expect(() => aMensaje(filaDeMensaje(TENANT_B), cifrado, TENANT_A)).toThrow(
      CampoCifradoDeOtraAgenciaError,
    );
    expect(() => aResumen(filaDeResumen(TENANT_B), new Date(), cifrado, TENANT_A)).toThrow(
      CampoCifradoDeOtraAgenciaError,
    );
  });

  it('el error no lleva identificadores ni contenido', () => {
    try {
      aMensaje(filaDeMensaje(TENANT_B), cifrado, TENANT_A);
    } catch (e) {
      const m = (e as Error).message;
      for (const s of [TENANT_A, TENANT_B, 'AB1']) expect(m).not.toContain(s);
    }
  });
});
