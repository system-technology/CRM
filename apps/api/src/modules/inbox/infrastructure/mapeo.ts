/**
 * Del modelo de Prisma a los contratos de la bandeja. Compartido por la lectura que arma eventos
 * del socket y por la que sirve la API, para que un mensaje tenga una sola forma.
 */
import { ConversacionResumen, Id, Mensaje } from '@viajapro/contracts';
import type { Prisma } from '@prisma/client';
import {
  COLUMNAS_CIFRADAS,
  type PuertoCifradoDeCampos,
} from '../../../shared/cifrado/puerto-de-cifrado.js';
import { calcularVentana, nuevaExpiracion } from '../domain/ventana-de-servicio.js';
import { CursorInvalidoError } from '../domain/errores-de-conversacion.js';

export const PARA_EL_MENSAJE = {
  id: true,
  tenantId: true,
  conversacionId: true,
  direccion: true,
  tipo: true,
  textoCifrado: true,
  textoNonce: true,
  textoTag: true,
  textoClaveVersion: true,
  estado: true,
  motivoFallo: true,
  autorId: true,
  cotizacionId: true,
  ocurridoEn: true,
  autor: { select: { nombre: true } },
} satisfies Prisma.MensajeSelect;

export type FilaDeMensaje = Prisma.MensajeGetPayload<{ select: typeof PARA_EL_MENSAJE }>;

/**
 * Descifra el texto aquí, con la agencia y el id de LA FILA (el AAD): es el único sitio por el que
 * un mensaje sale de la base, para la API y para el evento del socket. Nunca viaja descifrado por
 * Redis ni por el outbox: quien emite lee de la base bajo RLS y llama a esto.
 */
export function aMensaje(fila: FilaDeMensaje, cifrado: PuertoCifradoDeCampos): Mensaje {
  return Mensaje.parse({
    id: fila.id,
    conversacionId: fila.conversacionId,
    direccion: fila.direccion,
    tipo: fila.tipo,
    texto: cifrado.descifrarNulable(COLUMNAS_CIFRADAS.MENSAJES_TEXTO, fila.tenantId, fila.id, {
      cifrado: fila.textoCifrado,
      nonce: fila.textoNonce,
      tag: fila.textoTag,
      claveVersion: fila.textoClaveVersion,
    }),
    // El contrato exige la URL propia y firmada de un adjunto YA descargado. Hasta que exista la
    // descarga a S3, el mensaje no lleva adjuntos: el detalle de cada uno está en su propia ruta.
    adjuntos: [],
    estado: fila.estado,
    motivoFallo: fila.motivoFallo,
    autorId: fila.autorId,
    autorNombre: fila.autor?.nombre ?? null,
    ocurridoEn: fila.ocurridoEn.toISOString(),
    cotizacionId: fila.cotizacionId,
  });
}

export const PARA_EL_RESUMEN = {
  id: true,
  tenantId: true,
  contactoId: true,
  estado: true,
  asignadoAId: true,
  ultimoMensajeClienteEn: true,
  ultimoMensajeTextoCifrado: true,
  ultimoMensajeTextoNonce: true,
  ultimoMensajeTextoTag: true,
  ultimoMensajeTextoClaveVersion: true,
  ultimoMensajeEn: true,
  ultimoMensajeDireccion: true,
  mensajesSinLeer: true,
  slaVenceEn: true,
  primeraRespuestaEn: true,
  etiquetas: true,
  contacto: { select: { nombre: true, telefonoE164: true } },
  asignadoA: { select: { nombre: true } },
} satisfies Prisma.ConversacionSelect;

export type FilaDeResumen = Prisma.ConversacionGetPayload<{ select: typeof PARA_EL_RESUMEN }>;

export function aResumen(
  fila: FilaDeResumen,
  ahora: Date,
  cifrado: PuertoCifradoDeCampos,
): ConversacionResumen {
  // La ventana se deriva del último mensaje DEL CLIENTE; no se guarda (ver el esquema).
  const expira = fila.ultimoMensajeClienteEn
    ? nuevaExpiracion(null, fila.ultimoMensajeClienteEn)
    : null;
  return ConversacionResumen.parse({
    id: fila.id,
    contactoId: fila.contactoId,
    contactoNombre: fila.contacto.nombre,
    contactoTelefono: fila.contacto.telefonoE164,
    estado: fila.estado,
    ventana: calcularVentana(expira, ahora),
    asignadoAId: fila.asignadoAId,
    asignadoANombre: fila.asignadoA?.nombre ?? null,
    ultimoMensajeTexto: cifrado.descifrarNulable(
      COLUMNAS_CIFRADAS.CONVERSACIONES_ULTIMO_MENSAJE_TEXTO,
      fila.tenantId,
      fila.id,
      {
        cifrado: fila.ultimoMensajeTextoCifrado,
        nonce: fila.ultimoMensajeTextoNonce,
        tag: fila.ultimoMensajeTextoTag,
        claveVersion: fila.ultimoMensajeTextoClaveVersion,
      },
    ),
    ultimoMensajeEn: fila.ultimoMensajeEn?.toISOString() ?? null,
    ultimoMensajeDireccion: fila.ultimoMensajeDireccion,
    mensajesSinLeer: fila.mensajesSinLeer,
    // El plazo se anula cuando ya hubo primera respuesta, pero la columna se conserva (evidencia).
    slaVenceEn: fila.primeraRespuestaEn ? null : (fila.slaVenceEn?.toISOString() ?? null),
    etiquetas: fila.etiquetas,
  });
}

/** El cursor es opaco para el cliente: instante + id, para paginar por clave y no por posición. */
export interface Cursor {
  t: string | null;
  id: string;
}

export function codificarCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

export function decodificarCursor(texto: string): Cursor {
  try {
    const crudo: unknown = JSON.parse(Buffer.from(texto, 'base64url').toString('utf8'));
    if (typeof crudo === 'object' && crudo !== null) {
      const { t, id } = crudo as { t?: unknown; id?: unknown };
      if (
        Id.safeParse(id).success &&
        typeof id === 'string' &&
        (t === null || typeof t === 'string')
      ) {
        if (t === null || !Number.isNaN(new Date(t).getTime())) return { t, id };
      }
    }
  } catch {
    // Se traduce abajo a un error de dominio; no hay nada que registrar de un cursor mal formado.
  }
  throw new CursorInvalidoError();
}
