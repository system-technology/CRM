/**
 * Cifrado en reposo de las columnas con PII sensible de viajeros (ADR-0015, opción A).
 *
 * - **Una maestra, claves derivadas.** `HKDF-SHA256(ikm = maestra v<n>, sal fija, info =
 *   etiqueta ‖ tenant_id)`. La etiqueta es `viajapro/<tabla>.<columna>/v<n>/`: un criptograma
 *   no abre en otra agencia, en otra columna ni con otra versión.
 * - **AES-256-GCM, IV aleatorio de 96 bits por cifrado.** El IV se genera aquí dentro y no se
 *   acepta por parámetro: repetir uno con la misma clave rompe GCM.
 * - **AAD sin ambigüedad:** longitud(etiqueta) (2 bytes) ‖ etiqueta ‖ tenant (16) ‖ fila (16) ‖
 *   código de columna (1). Trasplantar el criptograma a otra fila, agencia o columna no autentica.
 * - **Tope de 2^32 cifrados por clave derivada:** lo vigila el trabajo de recifrado con la cuenta
 *   sacada de la base (se rota antes de 2^31). Este servicio no puede contar entre procesos.
 * - **@inyeccion-manual:** la construye una fábrica (`CifradoModule`) con las claves ya leídas y
 *   validadas del entorno, y las pruebas con claves propias; su argumento es un valor, no un token.
 * - **Sin respaldo:** sin `CAMPOS_SENSIBLES_KEY` la configuración lanza y el proceso no arranca.
 *   La clave no se registra ni entra en ningún mensaje de error.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  type CampoCifrado,
  CampoCifradoIlegibleError,
  type CampoCifradoNulable,
  type ColumnaCifrada,
  COLUMNAS_CIFRADAS,
  PuertoCifradoDeCampos,
} from './puerto-de-cifrado.js';

const ALGORITMO = 'aes-256-gcm';
const LARGO_CLAVE = 32;
const LARGO_NONCE = 12;
const LARGO_TAG = 16;

/**
 * Sal de HKDF: constante de 32 bytes, fija y pública a propósito (RFC 5869: la sal no es
 * secreta). **No se cambia**: equivale a rotar todas las claves derivadas y deja ilegible lo ya
 * escrito.
 */
const SAL_DE_HKDF = Buffer.from(
  '1c2e0f2b8f6d3a7d4b0e9a51c3f7a8d2e6b4915f0a7c3d8e2b6f4a19d5c0e7b3',
  'hex',
);

/** Código de columna de 1 byte para el AAD. **Solo se añaden al final.** */
const CODIGO_DE_COLUMNA: Record<ColumnaCifrada, number> = {
  [COLUMNAS_CIFRADAS.MENSAJES_TEXTO]: 1,
  [COLUMNAS_CIFRADAS.CONVERSACIONES_ULTIMO_MENSAJE_TEXTO]: 2,
  [COLUMNAS_CIFRADAS.CONTACTOS_PREFERENCIAS]: 3,
  [COLUMNAS_CIFRADAS.NOTAS_INTERNAS_TEXTO]: 4,
  [COLUMNAS_CIFRADAS.ADJUNTOS_NOMBRE_ARCHIVO]: 5,
};

export interface ClavesDeCampos {
  /** La versión vigente: con ella se cifra. Entero >= 1. */
  version: number;
  /** 32 bytes. */
  actual: Buffer;
  /** La de la versión `version - 1`, solo para descifrar durante una rotación. */
  anterior: Buffer | null;
}

@Injectable()
export class CifradoDeCampos extends PuertoCifradoDeCampos {
  constructor(private readonly claves: ClavesDeCampos) {
    super();
    if (!Number.isInteger(claves.version) || claves.version < 1) {
      throw new Error('La versión de CAMPOS_SENSIBLES_KEY debe ser un entero >= 1.');
    }
    verificarLargo(claves.actual, 'CAMPOS_SENSIBLES_KEY');
    if (claves.anterior) verificarLargo(claves.anterior, 'CAMPOS_SENSIBLES_KEY_PREVIOUS');
  }

  cifrar(columna: ColumnaCifrada, tenantId: string, filaId: string, claro: string): CampoCifrado {
    const version = this.claves.version;
    const clave = derivar(this.claves.actual, columna, tenantId, version);
    const nonce = randomBytes(LARGO_NONCE);
    const cifrador = createCipheriv(ALGORITMO, clave, nonce);
    cifrador.setAAD(armarAad(columna, version, tenantId, filaId));
    const cifrado = Buffer.concat([cifrador.update(claro, 'utf8'), cifrador.final()]);
    return { cifrado, nonce, tag: cifrador.getAuthTag(), claveVersion: version };
  }

  descifrar(
    columna: ColumnaCifrada,
    tenantId: string,
    filaId: string,
    campo: CampoCifrado,
  ): string {
    try {
      if (campo.nonce.length !== LARGO_NONCE || campo.tag.length !== LARGO_TAG) {
        throw new CampoCifradoIlegibleError(columna);
      }
      const maestra = this.maestraDe(campo.claveVersion);
      if (!maestra) throw new CampoCifradoIlegibleError(columna);
      const clave = derivar(maestra, columna, tenantId, campo.claveVersion);
      const descifrador = createDecipheriv(ALGORITMO, clave, campo.nonce);
      descifrador.setAAD(armarAad(columna, campo.claveVersion, tenantId, filaId));
      descifrador.setAuthTag(campo.tag);
      return Buffer.concat([descifrador.update(campo.cifrado), descifrador.final()]).toString(
        'utf8',
      );
    } catch {
      // Cualquier fallo (etiqueta, AAD, formato) es el mismo hacia fuera y sin la causa de Node:
      // no hay nada útil que distinguir y sí algo que sondear.
      throw new CampoCifradoIlegibleError(columna);
    }
  }

  descifrarNulable(
    columna: ColumnaCifrada,
    tenantId: string,
    filaId: string,
    c: CampoCifradoNulable,
  ): string | null {
    const { cifrado, nonce, tag, claveVersion } = c;
    if (cifrado === null && nonce === null && tag === null && claveVersion === null) return null;
    if (cifrado === null || nonce === null || tag === null || claveVersion === null) {
      throw new CampoCifradoIlegibleError(columna);
    }
    return this.descifrar(columna, tenantId, filaId, { cifrado, nonce, tag, claveVersion });
  }

  /** La vigente, o la anterior si es exactamente `version - 1`. Otra versión no tiene clave. */
  private maestraDe(version: number): Buffer | null {
    if (version === this.claves.version) return this.claves.actual;
    if (version === this.claves.version - 1) return this.claves.anterior;
    return null;
  }
}

function etiquetaDe(columna: ColumnaCifrada, version: number): string {
  return `viajapro/${columna}/v${version}/`;
}

function derivar(
  maestra: Buffer,
  columna: ColumnaCifrada,
  tenantId: string,
  version: number,
): Buffer {
  const info = Buffer.concat([
    Buffer.from(etiquetaDe(columna, version), 'utf8'),
    uuidABytes(tenantId),
  ]);
  return Buffer.from(hkdfSync('sha256', maestra, SAL_DE_HKDF, info, LARGO_CLAVE));
}

function armarAad(
  columna: ColumnaCifrada,
  version: number,
  tenantId: string,
  filaId: string,
): Buffer {
  const etiqueta = Buffer.from(etiquetaDe(columna, version), 'utf8');
  const largo = Buffer.alloc(2);
  largo.writeUInt16BE(etiqueta.length);
  return Buffer.concat([
    largo,
    etiqueta,
    uuidABytes(tenantId),
    uuidABytes(filaId),
    Buffer.from([CODIGO_DE_COLUMNA[columna]]),
  ]);
}

function uuidABytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, '');
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) {
    throw new Error('Un identificador del AAD debe ser un UUID.');
  }
  return Buffer.from(hex, 'hex');
}

function verificarLargo(clave: Buffer, nombre: string): void {
  if (clave.length !== LARGO_CLAVE) {
    // Solo el largo: la clave misma no sale en ningún mensaje.
    throw new Error(
      `${nombre} debe medir ${LARGO_CLAVE} bytes y mide ${clave.length}. ` +
        'Genérala con `scripts/generar-secretos-locales.ps1`.',
    );
  }
}

/**
 * Lee la configuración del entorno, **sin respaldo**. Hexadecimal (64 caracteres) o base64, por
 * la forma del texto: la misma regla que `WEBHOOK_PAYLOAD_KEY`.
 */
export function clavesDeCamposDesdeEntorno(
  entorno: Record<string, string | undefined>,
): ClavesDeCampos {
  const valor = entorno['CAMPOS_SENSIBLES_KEY'];
  if (!valor) {
    throw new Error(
      'Falta CAMPOS_SENSIBLES_KEY. No hay respaldo a propósito: sin ella las columnas con PII ' +
        'sensible se guardarían sin cifrar o con una clave que nadie sabe cuál es.',
    );
  }
  const crudo = entorno['CAMPOS_SENSIBLES_KEY_VERSION'];
  const version = Number(crudo);
  if (!crudo || !Number.isInteger(version) || version < 1) {
    throw new Error(
      'CAMPOS_SENSIBLES_KEY_VERSION debe ser un entero >= 1. Sin ella, una rotación dejaría ' +
        'ilegible lo anterior sin forma de saber qué clave lo abría.',
    );
  }
  const previa = entorno['CAMPOS_SENSIBLES_KEY_PREVIOUS'];
  return {
    version,
    actual: decodificar(valor),
    anterior: previa ? decodificar(previa) : null,
  };
}

function decodificar(valor: string): Buffer {
  const limpio = valor.trim();
  return /^[0-9a-fA-F]{64}$/.test(limpio)
    ? Buffer.from(limpio, 'hex')
    : Buffer.from(limpio, 'base64');
}
