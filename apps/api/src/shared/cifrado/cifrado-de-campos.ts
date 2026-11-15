/**
 * Cifrado en reposo de las columnas con PII sensible de viajeros (ADR-0015, opción A).
 *
 * - **Una maestra, claves derivadas por agencia y por columna (concreción 1).**
 *   `HKDF-SHA256(ikm = CAMPOS_SENSIBLES_KEY v<n>, sal = SAL_DE_HKDF, info = etiqueta ‖ tenant_id)`,
 *   con etiqueta `viajapro/<tabla>.<columna>/v<n>/`. Un criptograma no abre en otra agencia, en
 *   otra columna ni con otra versión.
 * - **AES-256-GCM con IV aleatorio de 96 bits por cifrado (concreción 2)**, por la primitiva
 *   compartida `aes-256-gcm.ts`, que genera el IV dentro.
 * - **AAD de campos de longitud fija (concreción 3):** etiqueta ‖ tenant_id (16 bytes) ‖ id de la
 *   fila dueña (16 bytes) ‖ código de columna (1 byte). La etiqueta es la única parte de largo
 *   variable y va delante; los 33 bytes finales son de largo fijo, así que la concatenación no es
 *   ambigua. Trasplantar el criptograma a otra fila, agencia o columna no autentica.
 * - **Tope de 2^32 cifrados por clave derivada (concreción 2):** lo vigila el trabajo de
 *   recifrado con la cuenta sacada de la base (se rota antes de 2^31). Este servicio no puede
 *   contar entre procesos; el trabajo no existe todavía (cola, T-212).
 * - **Rotación robusta (T-226).** Hecho: la maestra (y la previa) no puede coincidir con otra clase
 *   de secreto (`separadaDeOtrasClases`, al arrancar). Hecho también (b): al arrancar, la API,
 *   el trabajador y el modo único abortan si hay datos con una `*_clave_version` que ninguna clave
 *   cargada abre (`comprobacion-de-claves.ts`). Aborta DESPUÉS de crear el contexto: en el
 *   trabajador los consumidores ya pueden haber tomado algún trabajo (antes del contexto, T-234). Lee las versiones agencia por agencia bajo RLS;
 *   a volumen, una función SECURITY DEFINER `contar_versiones_de_clave()` (rol sin login, sin ids
 *   ni contenido) solo cambiaría el adaptador. PENDIENTE:
 *   (c) recifrado por lotes: trabajo en cola que, por agencia (`conTenant`), lee un lote de filas
 *       con versión vieja, descifra con la previa y reescribe con la vigente en la misma
 *       transacción (`UPDATE ... WHERE id = $ AND *_clave_version = $vieja`, idempotente), hasta
 *       que el recuento de (b) sea cero; solo entonces se retira `CAMPOS_SENSIBLES_KEY_PREVIOUS`.
 *       El contador del tope 2^32 sale de la misma función (filas escritas por clave derivada =
 *       filas por (tabla, tenant, versión) más reescrituras); alerta al llegar a 2^31.
 * - **Sin respaldo (concreción 4):** sin `CAMPOS_SENSIBLES_KEY` o sin su versión, la configuración
 *   lanza y el proceso (API o trabajador) no arranca. La clave no se registra ni entra en ningún
 *   mensaje de error.
 * - **Un fallo al descifrar se registra como `Clase:código`, sin contenido (concreción 6).**
 */
import { hkdfSync } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { abrirAesGcm, decodificarClave, LARGO_CLAVE, sellarAesGcm } from './aes-256-gcm.js';
import {
  type CampoCifrado,
  CampoCifradoIlegibleError,
  type CampoCifradoNulable,
  type ColumnaCifrada,
  COLUMNAS_CIFRADAS,
  PuertoCifradoDeCampos,
} from './puerto-de-cifrado.js';

/**
 * Sal de HKDF: constante de 32 bytes, fija y documentada aquí (concreción 1). Es pública a
 * propósito (RFC 5869: la sal no es secreta). **No se cambia nunca**: equivale a rotar todas las
 * claves derivadas y deja ilegible lo ya escrito.
 */
export const SAL_DE_HKDF = Buffer.from(
  '1c2e0f2b8f6d3a7d4b0e9a51c3f7a8d2e6b4915f0a7c3d8e2b6f4a19d5c0e7b3',
  'hex',
);

/** Código de columna de 1 byte para el AAD. **Solo se añaden al final; nunca se reasignan.** */
const CODIGO_DE_COLUMNA: Record<ColumnaCifrada, number> = {
  [COLUMNAS_CIFRADAS.MENSAJES_TEXTO]: 1,
  [COLUMNAS_CIFRADAS.CONVERSACIONES_ULTIMO_MENSAJE_TEXTO]: 2,
  [COLUMNAS_CIFRADAS.CONTACTOS_PREFERENCIAS]: 3,
  [COLUMNAS_CIFRADAS.NOTAS_INTERNAS_TEXTO]: 4,
  [COLUMNAS_CIFRADAS.ADJUNTOS_NOMBRE_ARCHIVO]: 5,
};

/** La versión es un SMALLINT en la base. */
const VERSION_MAXIMA = 32767;

export interface ClavesDeCampos {
  /** La versión vigente: con ella se cifra. Entero >= 1. */
  version: number;
  /** 32 bytes. */
  actual: Buffer;
  /** La de la versión `version - 1`, solo para descifrar durante una rotación. */
  anterior: Buffer | null;
}

/**
 * **@inyeccion-manual:** la construye `CifradoModule` con las claves ya leídas y validadas del
 * entorno, y las pruebas con claves propias; su argumento es un valor, no un token de Nest.
 */
export class CifradoDeCampos extends PuertoCifradoDeCampos {
  private readonly log = new Logger('CifradoDeCampos');

  constructor(private readonly claves: ClavesDeCampos) {
    super();
    if (
      !Number.isInteger(claves.version) ||
      claves.version < 1 ||
      claves.version > VERSION_MAXIMA
    ) {
      throw new Error(
        `La versión de CAMPOS_SENSIBLES_KEY debe ser un entero entre 1 y ${VERSION_MAXIMA}.`,
      );
    }
    exigirLargo(claves.actual, 'CAMPOS_SENSIBLES_KEY');
    if (claves.anterior) exigirLargo(claves.anterior, 'CAMPOS_SENSIBLES_KEY_PREVIOUS');
  }

  cifrar(columna: ColumnaCifrada, tenantId: string, filaId: string, claro: string): CampoCifrado {
    const version = this.claves.version;
    const clave = derivarClave(this.claves.actual, columna, tenantId, version);
    const s = sellarAesGcm(
      Buffer.from(claro, 'utf8'),
      clave,
      armarAad(columna, version, tenantId, filaId),
    );
    return { ...s, claveVersion: version };
  }

  descifrar(
    columna: ColumnaCifrada,
    tenantId: string,
    filaId: string,
    c: CampoCifradoNulable,
  ): string | null {
    const { cifrado, nonce, tag, claveVersion } = c;
    if (cifrado === null && nonce === null && tag === null && claveVersion === null) return null;
    try {
      if (cifrado === null || nonce === null || tag === null || claveVersion === null) {
        throw new CampoCifradoIlegibleError(columna);
      }
      const maestra = this.maestraDe(claveVersion);
      if (!maestra) throw new CampoCifradoIlegibleError(columna);
      const clave = derivarClave(maestra, columna, tenantId, claveVersion);
      return abrirAesGcm(
        { cifrado: Buffer.from(cifrado), nonce: Buffer.from(nonce), tag: Buffer.from(tag) },
        clave,
        armarAad(columna, claveVersion, tenantId, filaId),
      ).toString('utf8');
    } catch {
      // Cualquier fallo (etiqueta, AAD, formato, versión) es el mismo hacia fuera y sin la causa
      // de Node: no hay nada útil que distinguir y sí algo que sondear. Se registra la clase, el
      // código y la columna: ni el contenido, ni la fila, ni la agencia.
      const error = new CampoCifradoIlegibleError(columna);
      this.log.error(`${error.name}:${error.code} (${columna})`);
      throw error;
    }
  }

  /** La vigente, o la anterior si es exactamente `version - 1`. Otra versión no tiene clave. */
  private maestraDe(version: number): Buffer | null {
    if (version === this.claves.version) return this.claves.actual;
    if (version === this.claves.version - 1) return this.claves.anterior;
    return null;
  }
}

/** `viajapro/<tabla>.<columna>/v<n>/`. Entra en el `info` de HKDF y en el AAD. */
export function etiquetaDe(columna: ColumnaCifrada, version: number): string {
  return `viajapro/${columna}/v${version}/`;
}

/** Concreción 1. Exportada para las pruebas de la derivación; nadie más la llama. */
export function derivarClave(
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

/** Concreción 3: etiqueta ‖ tenant (16) ‖ fila (16) ‖ código de columna (1). */
export function armarAad(
  columna: ColumnaCifrada,
  version: number,
  tenantId: string,
  filaId: string,
): Buffer {
  return Buffer.concat([
    Buffer.from(etiquetaDe(columna, version), 'utf8'),
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

function exigirLargo(clave: Buffer, nombre: string): void {
  if (clave.length !== LARGO_CLAVE) {
    // Solo el largo: la clave misma no sale en ningún mensaje.
    throw new Error(
      `${nombre} debe medir ${LARGO_CLAVE} bytes y mide ${clave.length}. ` +
        'Genérala con `openssl rand -base64 32`.',
    );
  }
}

/**
 * Lee la configuración del entorno, **sin respaldo** (concreción 4). Mismo convenio que
 * `WEBHOOK_PAYLOAD_KEY`: la clave en hexadecimal (64 caracteres) o base64, su versión explícita y,
 * durante una rotación, la anterior.
 */
export function clavesDeCamposDesdeEntorno(
  entorno: Record<string, string | undefined>,
): ClavesDeCampos {
  const valor = entorno['CAMPOS_SENSIBLES_KEY'];
  if (!valor) {
    throw new Error(
      'Falta CAMPOS_SENSIBLES_KEY (ADR-0015). No hay respaldo a propósito: sin ella las columnas ' +
        'con PII sensible se guardarían sin cifrar o con una clave que nadie sabe cuál es.',
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
  separadaDeOtrasClases(entorno, 'CAMPOS_SENSIBLES_KEY', valor);
  if (previa) separadaDeOtrasClases(entorno, 'CAMPOS_SENSIBLES_KEY_PREVIOUS', previa);
  return {
    version,
    actual: decodificarClave(valor),
    anterior: previa ? decodificarClave(previa) : null,
  };
}

/** Las otras clases de secreto con las que la maestra de campos no puede compartir valor. */
const OTRAS_CLASES_DE_SECRETO = [
  'WEBHOOK_PAYLOAD_KEY',
  'CORREO_PAYLOAD_KEY',
  'ENCRYPTION_MASTER_KEY',
] as const;

/**
 * T-226 (a): una clave por clase de secreto. Si la maestra de campos fuera igual a otra, filtrar o
 * rotar aquella comprometería esta (y la rotación de una arrastraría a la otra). Se compara el
 * valor tal cual y, cuando ambos decodifican, los bytes (la misma clave en hex y en base64 es la
 * misma clave). El mensaje nombra las variables, nunca el valor.
 */
function separadaDeOtrasClases(
  entorno: Record<string, string | undefined>,
  nombre: string,
  valor: string,
): void {
  const limpio = valor.trim();
  const bytes = decodificarClave(limpio);
  for (const otra of OTRAS_CLASES_DE_SECRETO) {
    const otroValor = entorno[otra]?.trim();
    if (!otroValor) continue;
    if (otroValor === limpio || decodificarClave(otroValor).equals(bytes)) {
      throw new Error(
        `${nombre} no puede ser igual a ${otra} (ADR-0015): cada clase de secreto lleva su propia ` +
          'clave. Genera una distinta con `openssl rand -base64 32`.',
      );
    }
  }
}
