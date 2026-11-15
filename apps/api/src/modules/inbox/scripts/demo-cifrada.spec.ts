import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CifradoDeCampos } from '../../../shared/cifrado/cifrado-de-campos.js';
import {
  CampoCifradoIlegibleError,
  COLUMNAS_CIFRADAS,
} from '../../../shared/cifrado/puerto-de-cifrado.js';
import { armarLaDemoCifrada, PLAN_DE_LA_DEMO } from './demo-cifrada.js';

const cifrado = new CifradoDeCampos({
  version: 1,
  actual: Buffer.alloc(32, 7),
  anterior: null,
});
const TENANT = randomUUID();
const AHORA = Date.UTC(2026, 10, 15, 15, 0, 0);
const sinExistentes = {
  conversaciones: new Map<string, string>(),
  mensajes: new Map<string, string>(),
};

const armar = (existentes = sinExistentes) =>
  armarLaDemoCifrada({ cifrado, tenantId: TENANT, ahoraMs: AHORA, existentes });

const campo = (c: { cifrado: Buffer; nonce: Buffer; tag: Buffer; claveVersion: number }) => c;

describe('armado de la demo cifrada', () => {
  it('arma 3 conversaciones y 2 notas, con entrantes y salientes', () => {
    const r = armar();
    expect(r).toHaveLength(3);
    expect(r.flatMap((c) => c.notas)).toHaveLength(2);
    const direcciones = new Set(r.flatMap((c) => c.mensajes.map((m) => m.direccion)));
    expect(direcciones).toEqual(new Set(['ENTRANTE', 'SALIENTE']));
  });

  it('cada mensaje descifra a su texto con su propio id en el AAD', () => {
    const plan = PLAN_DE_LA_DEMO.flatMap((c) => c.mensajes);
    for (const c of armar()) {
      for (const m of c.mensajes) {
        const texto = cifrado.descifrar(COLUMNAS_CIFRADAS.MENSAJES_TEXTO, TENANT, m.id, {
          cifrado: m.texto.textoCifrado,
          nonce: m.texto.textoNonce,
          tag: m.texto.textoTag,
          claveVersion: m.texto.textoClaveVersion,
        });
        expect(texto).toBe(plan.find((p) => p.wamid === m.wamid)?.texto);
      }
    }
  });

  it('la vista previa descifra con el id de la conversación y es el último mensaje, recortado', () => {
    for (const c of armar()) {
      const v = c.vistaPrevia;
      const texto = cifrado.descifrar(
        COLUMNAS_CIFRADAS.CONVERSACIONES_ULTIMO_MENSAJE_TEXTO,
        TENANT,
        c.id,
        {
          cifrado: v.ultimoMensajeTextoCifrado,
          nonce: v.ultimoMensajeTextoNonce,
          tag: v.ultimoMensajeTextoTag,
          claveVersion: v.ultimoMensajeTextoClaveVersion,
        },
      );
      const ultimo = PLAN_DE_LA_DEMO.find((p) => p.telefono === c.telefono)?.mensajes.at(-1);
      expect(texto).toBe(ultimo?.texto.slice(0, 200));
      expect(texto?.length ?? 0).toBeLessThanOrEqual(200);
    }
  });

  it('las notas descifran con su id y no abren con el de otra fila ni en otra agencia', () => {
    const nota = armar().flatMap((c) => c.notas)[0];
    if (!nota) throw new Error('el plan debe traer notas');
    const t = nota.texto;
    const crudo = campo({
      cifrado: t.textoCifrado,
      nonce: t.textoNonce,
      tag: t.textoTag,
      claveVersion: t.textoClaveVersion,
    });
    expect(
      cifrado.descifrarObligatorio(COLUMNAS_CIFRADAS.NOTAS_INTERNAS_TEXTO, TENANT, nota.id, crudo),
    ).toContain(' ');
    expect(() =>
      cifrado.descifrar(COLUMNAS_CIFRADAS.NOTAS_INTERNAS_TEXTO, TENANT, randomUUID(), crudo),
    ).toThrow(CampoCifradoIlegibleError);
    expect(() =>
      cifrado.descifrar(COLUMNAS_CIFRADAS.NOTAS_INTERNAS_TEXTO, randomUUID(), nota.id, crudo),
    ).toThrow(CampoCifradoIlegibleError);
  });

  it('respeta los ids que ya existen (el hilo de la semilla) y marca esas filas', () => {
    const convId = randomUUID();
    const msgId = randomUUID();
    const r = armar({
      conversaciones: new Map([['+573001234567', convId]]),
      mensajes: new Map([['wamid.DEMO.0001', msgId]]),
    });
    const hilo = r.find((c) => c.telefono === '+573001234567');
    expect(hilo?.id).toBe(convId);
    expect(hilo?.existente).toBe(true);
    const m = hilo?.mensajes.find((x) => x.wamid === 'wamid.DEMO.0001');
    expect(m?.id).toBe(msgId);
    expect(m?.existente).toBe(true);
    expect(hilo?.mensajes.find((x) => x.wamid === 'wamid.DEMO.0002')?.existente).toBe(false);
    // El texto del existente se cifró con SU id: abre con él.
    expect(
      cifrado.descifrar(COLUMNAS_CIFRADAS.MENSAJES_TEXTO, TENANT, msgId, {
        cifrado: m?.texto.textoCifrado ?? null,
        nonce: m?.texto.textoNonce ?? null,
        tag: m?.texto.textoTag ?? null,
        claveVersion: m?.texto.textoClaveVersion ?? null,
      }),
    ).toContain('San Andrés');
  });

  it('los ids nuevos son UUID v7 y los wamid del plan son únicos', () => {
    const ids = armar().flatMap((c) => [
      c.id,
      ...c.mensajes.map((m) => m.id),
      ...c.notas.map((n) => n.id),
    ]);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab]/);
    expect(new Set(ids).size).toBe(ids.length);
    const wamids = PLAN_DE_LA_DEMO.flatMap((c) => c.mensajes.map((m) => m.wamid));
    expect(new Set(wamids).size).toBe(wamids.length);
  });

  it('deriva contadores coherentes: el hilo sin responder tiene 1 sin leer; el respondido, 0', () => {
    const r = armar();
    expect(r.find((c) => c.telefono === '+573155551234')?.mensajesSinLeer).toBe(1);
    expect(r.find((c) => c.telefono === '+573109876543')?.mensajesSinLeer).toBe(0);
    expect(r.find((c) => c.telefono === '+573109876543')?.ultimoMensajeDireccion).toBe('SALIENTE');
  });
});
