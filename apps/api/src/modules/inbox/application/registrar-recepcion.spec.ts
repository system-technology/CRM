/**
 * Pruebas del caso de uso completo, con la persistencia de mentira.
 *
 * Lo que de verdad se comprueba aquí es el ORDEN: que nada se escriba antes de verificar la
 * firma, y que lo que se escriba vaya cifrado y con el número de changes correcto.
 */

import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { RegistrarRecepcion } from './registrar-recepcion.js';
import { PuertoColaDeChanges } from './puertos-de-proceso.js';
import { PuertoRecepciones, type RecepcionAGuardar } from './puerto-recepciones.js';

const SECRETO = 'secreto-de-aplicacion-de-pruebas';
const CLAVE = Buffer.alloc(32, 3).toString('base64');

/** Un sobre de Meta con dos changes: un mensaje y una actualización de plantilla. */
const SOBRE = Buffer.from(
  JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '102290129340398',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              messages: [{ from: '573001112233', text: { body: '¿Cuánto cuesta San Andrés?' } }],
            },
          },
          { field: 'message_template_status_update', value: { event: 'APPROVED' } },
        ],
      },
    ],
  }),
  'utf8',
);

function firmar(cuerpo: Buffer, secreto = SECRETO): string {
  return 'sha256=' + createHmac('sha256', secreto).update(cuerpo).digest('hex');
}

class PuertoEspia extends PuertoRecepciones {
  guardadas: RecepcionAGuardar[] = [];
  devolver = true;

  registrar(r: RecepcionAGuardar): Promise<boolean> {
    this.guardadas.push(r);
    return Promise.resolve(this.devolver);
  }
}

class ColaEspia extends PuertoColaDeChanges {
  trabajos: Array<{ id: string; indice: number }> = [];
  fallar = false;
  encolar(recepcionId: Buffer, indice: number): Promise<void> {
    if (this.fallar) return Promise.reject(new Error('redis caído'));
    this.trabajos.push({ id: recepcionId.toString('hex'), indice });
    return Promise.resolve();
  }
}

describe('RegistrarRecepcion', () => {
  let puerto: PuertoEspia;
  let caso: RegistrarRecepcion;
  let cola: ColaEspia;

  beforeEach(() => {
    process.env['META_APP_SECRET'] = SECRETO;
    process.env['WEBHOOK_PAYLOAD_KEY'] = CLAVE;
    process.env['WEBHOOK_PAYLOAD_KEY_VERSION'] = '1';
    puerto = new PuertoEspia();
    cola = new ColaEspia();
    caso = new RegistrarRecepcion(puerto, cola);
  });

  it('guarda el sobre y cuenta sus dos changes', async () => {
    const r = await caso.ejecutar(SOBRE, firmar(SOBRE));
    expect(r).toEqual({ estado: 'REGISTRADA', changes: 2 });
    expect(puerto.guardadas).toHaveLength(1);
    expect(puerto.guardadas[0]?.totalChanges).toBe(2);
  });

  it('NO escribe nada cuando la firma no cuadra', async () => {
    const r = await caso.ejecutar(SOBRE, firmar(SOBRE, 'otro-secreto'));
    expect(r.estado).toBe('FIRMA_INVALIDA');
    // La aserción que importa: ni una fila. Verificar después de escribir sería escribir lo
    // que cualquiera mande a una URL pública.
    expect(puerto.guardadas).toHaveLength(0);
  });

  it('NO escribe nada cuando falta la cabecera de firma', async () => {
    const r = await caso.ejecutar(SOBRE, undefined);
    expect(r.estado).toBe('FIRMA_INVALIDA');
    expect(puerto.guardadas).toHaveLength(0);
  });

  it('el reintento de Meta no duplica: mismo cuerpo, mismo identificador', async () => {
    await caso.ejecutar(SOBRE, firmar(SOBRE));
    puerto.devolver = false; // la función de base dice «ya existía»
    const segunda = await caso.ejecutar(SOBRE, firmar(SOBRE));

    expect(segunda).toEqual({ estado: 'YA_REGISTRADA' });
    expect(puerto.guardadas[0]?.recepcionId.equals(puerto.guardadas[1]!.recepcionId)).toBe(true);
  });

  it('lo que se guarda va cifrado: el teléfono y el texto no aparecen', async () => {
    await caso.ejecutar(SOBRE, firmar(SOBRE));
    const guardada = puerto.guardadas[0]!;
    expect(guardada.cifrado.includes(Buffer.from('573001112233', 'utf8'))).toBe(false);
    expect(guardada.cifrado.includes(Buffer.from('San Andrés', 'utf8'))).toBe(false);
    expect(guardada.nonce.length).toBe(12);
    expect(guardada.claveVersion).toBe(1);
  });

  it('el identificador no es el cuerpo: es irreversible y mide 32 bytes', async () => {
    await caso.ejecutar(SOBRE, firmar(SOBRE));
    const id = puerto.guardadas[0]!.recepcionId;
    expect(id.length).toBe(32);
    expect(id.includes(Buffer.from('573001112233', 'utf8'))).toBe(false);
  });

  it('un sobre que no es de WhatsApp no se guarda, pero tampoco es un error', async () => {
    const otro = Buffer.from(JSON.stringify({ object: 'instagram', entry: [] }), 'utf8');
    const r = await caso.ejecutar(otro, firmar(otro));
    expect(r.estado).toBe('SIN_CHANGES');
    expect(puerto.guardadas).toHaveLength(0);
  });

  it('un cuerpo firmado que no es JSON no se guarda y no revienta', async () => {
    const basura = Buffer.from('esto no es json', 'utf8');
    const r = await caso.ejecutar(basura, firmar(basura));
    expect(r.estado).toBe('SIN_CHANGES');
    expect(puerto.guardadas).toHaveLength(0);
  });

  it('exige la versión de clave: sin ella una rotación dejaría filas ilegibles', async () => {
    delete process.env['WEBHOOK_PAYLOAD_KEY_VERSION'];
    await expect(caso.ejecutar(SOBRE, firmar(SOBRE))).rejects.toThrow(/VERSION/);
  });

  it('exige la clave de cifrado: no hay respaldo a texto plano', async () => {
    delete process.env['WEBHOOK_PAYLOAD_KEY'];
    await expect(caso.ejecutar(SOBRE, firmar(SOBRE))).rejects.toThrow(/No hay respaldo/);
  });

  it('encola un trabajo por change, con el índice aplanado, tras guardar', async () => {
    await caso.ejecutar(SOBRE, firmar(SOBRE));
    expect(cola.trabajos.map((t) => t.indice)).toEqual([0, 1]);
    expect(puerto.guardadas).toHaveLength(1);
  });

  it('el reintento de Meta reencola con los mismos identificadores: cierra el hueco guardar-encolar', async () => {
    await caso.ejecutar(SOBRE, firmar(SOBRE));
    puerto.devolver = false;
    await caso.ejecutar(SOBRE, firmar(SOBRE));
    expect(cola.trabajos).toHaveLength(4);
    expect(cola.trabajos[0]?.id).toBe(cola.trabajos[2]?.id);
  });

  it('con la firma inválida no se encola nada', async () => {
    await caso.ejecutar(SOBRE, firmar(SOBRE, 'otro'));
    expect(cola.trabajos).toHaveLength(0);
  });

  it('si la cola falla el error sube (500): la fila ya es durable y Meta reintentará', async () => {
    cola.fallar = true;
    await expect(caso.ejecutar(SOBRE, firmar(SOBRE))).rejects.toThrow(/redis/);
    expect(puerto.guardadas).toHaveLength(1);
  });
});
