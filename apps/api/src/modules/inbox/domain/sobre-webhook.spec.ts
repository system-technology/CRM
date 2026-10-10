import { describe, expect, it } from 'vitest';
import { desglosarSobre } from './sobre-webhook.js';

const sobre = (o: unknown): Buffer => Buffer.from(JSON.stringify(o), 'utf8');

const cambioMensaje = (numeroId: string) => ({
  field: 'messages',
  value: { metadata: { phone_number_id: numeroId }, messages: [{ id: 'wamid.X' }] },
});

describe('desglosarSobre', () => {
  it('saca un cambio de un lote simple', () => {
    const r = desglosarSobre(
      sobre({
        object: 'whatsapp_business_account',
        entry: [{ id: '1152989873960143', changes: [cambioMensaje('1468816839639661')] }],
      }),
    );
    expect(r).toMatchObject({
      ok: true,
      cambios: [
        {
          indice: 0,
          cuentaId: '1152989873960143',
          campo: 'messages',
          numeroId: '1468816839639661',
        },
      ],
    });
  });

  /**
   * **La prueba que da sentido al archivo.**
   *
   * Meta puede agrupar entradas de WABA distintas en un mismo POST — es decir, de agencias
   * distintas. Un diseño que asuma «un tenant por petición» funciona hasta ese día, y ese día
   * mezcla los mensajes de dos clientes. Por eso el grano es el `change`.
   */
  it('separa entradas de agencias distintas en el mismo lote', () => {
    const r = desglosarSobre(
      sobre({
        object: 'whatsapp_business_account',
        entry: [
          { id: 'WABA_A', changes: [cambioMensaje('NUM_A')] },
          { id: 'WABA_B', changes: [cambioMensaje('NUM_B')] },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cambios.map((c) => [c.indice, c.cuentaId])).toEqual([
      [0, 'WABA_A'],
      [1, 'WABA_B'],
    ]);
  });

  /**
   * El índice es **orden aplanado**, no por entrada. Forma parte de la clave de idempotencia:
   * dos convenciones distintas darían identificadores distintos para el mismo reintento, y la
   * idempotencia dejaría de existir sin que nada fallara.
   */
  it('el índice es aplanado sobre todas las entradas, no reinicia en cada una', () => {
    const r = desglosarSobre(
      sobre({
        object: 'whatsapp_business_account',
        entry: [
          { id: 'A', changes: [cambioMensaje('1'), cambioMensaje('2')] },
          { id: 'B', changes: [cambioMensaje('3')] },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cambios.map((c) => c.indice)).toEqual([0, 1, 2]);
  });

  /**
   * Un `change` ilegible se descarta **pero consume su índice**. Si se saltara, el mismo lote
   * reenviado por Meta produciría índices distintos para los cambios que sí valen, y el
   * reintento se trataría como trabajo nuevo.
   */
  it('un cambio descartado consume su índice igual', () => {
    const r = desglosarSobre(
      sobre({
        object: 'whatsapp_business_account',
        entry: [{ id: 'A', changes: [{ sin: 'field' }, cambioMensaje('NUM')] }],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cambios).toHaveLength(1);
    expect(r.cambios[0]?.indice).toBe(1);
  });

  /**
   * Los eventos de gestión —plantillas, estado de la cuenta— **no traen `metadata`**, así que
   * no hay `phone_number_id` y el tenant solo puede resolverse por el WABA. Es la razón de que
   * el directorio del ADR-0008 tenga dos claves en vez de una.
   */
  it('un evento de gestión no trae número, solo cuenta', () => {
    const r = desglosarSobre(
      sobre({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA_A',
            changes: [{ field: 'message_template_status_update', value: { event: 'APPROVED' } }],
          },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cambios[0]).toMatchObject({
      campo: 'message_template_status_update',
      cuentaId: 'WABA_A',
      numeroId: null,
    });
  });

  it('conserva el valor sin interpretarlo', () => {
    const valor = { metadata: { phone_number_id: 'N' }, raro: { anidado: [1, 2, 3] } };
    const r = desglosarSobre(
      sobre({
        object: 'whatsapp_business_account',
        entry: [{ id: 'A', changes: [{ field: 'messages', value: valor }] }],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cambios[0]?.valor).toEqual(valor);
  });

  it('RECHAZA un JSON ilegible', () => {
    expect(desglosarSobre(Buffer.from('{roto', 'utf8'))).toEqual({
      ok: false,
      motivo: 'JSON_INVALIDO',
    });
  });

  it('RECHAZA un webhook de otro producto de Meta', () => {
    expect(desglosarSobre(sobre({ object: 'instagram', entry: [] }))).toEqual({
      ok: false,
      motivo: 'NO_ES_WHATSAPP',
    });
  });

  it.each([
    ['sin entradas', { object: 'whatsapp_business_account', entry: [] }],
    ['con entradas vacías', { object: 'whatsapp_business_account', entry: [{ id: 'A' }] }],
    ['sin el campo entry', { object: 'whatsapp_business_account' }],
  ])('RECHAZA un lote %s', (_caso, cuerpo) => {
    expect(desglosarSobre(sobre(cuerpo))).toEqual({ ok: false, motivo: 'SIN_CAMBIOS' });
  });

  it('no se rompe con tipos inesperados dentro del lote', () => {
    const r = desglosarSobre(
      sobre({
        object: 'whatsapp_business_account',
        entry: [null, 'texto', 42, { id: 'A', changes: ['x', null, cambioMensaje('N')] }],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cambios).toHaveLength(1);
  });
});
