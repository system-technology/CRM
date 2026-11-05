/**
 * Lógica pura para la gestión de consentimientos de datos personales (T-116).
 *
 * Cumplimiento de la Ley 1581 de 2012 (Habeas Data Colombia) y políticas de Meta WhatsApp:
 * - Toda finalidad autorizada debe poder demostrarse con canal, prueba, fecha y texto mostrado.
 * - Finalidades:
 *   1. TRANSACCIONAL: Respuestas operativas, cotizaciones, vouchers, tiquetes y asistencia de viaje.
 *   2. PROMOCIONAL: Campañas, paquetes en oferta, boletines comerciales y promociones.
 *
 * REGLA DE AUDITORÍA: El texto legal mostrado y la versión del aviso provienen de una constante
 * configurable explícitamente marcada como PENDIENTE_REVISION_LEGAL.
 */

import {
  type Consentimiento,
  type Contacto,
  type OtorgarConsentimiento,
  type RevocarConsentimiento,
  OtorgarConsentimiento as EsquemaOtorgarConsentimiento,
  RevocarConsentimiento as EsquemaRevocarConsentimiento,
} from '@viajapro/contracts';
import { otorgarConsentimientoContactoApi, revocarConsentimientoContactoApi } from './crm-api';

/**
 * Constantes legales configurables marcadas como PENDIENTE_REVISION_LEGAL.
 * No se inventa texto legal en tiempo de ejecución: todo texto emitido proviene de aquí.
 */
export const TEXTOS_LEGALES_CONSENTIMIENTO = {
  VERSION_AVISO_PENDIENTE_REVISION_LEGAL: '2026-v1.0-PENDIENTE_REVISION_LEGAL',
  TEXTO_MOSTRADO_TRANSACCIONAL_PENDIENTE_REVISION_LEGAL:
    'Autorizo a la agencia de viajes el tratamiento de mis datos personales para la atención de solicitudes, elaboración y envío de cotizaciones, gestión de reservas turísticas, emisión de itinerarios y comunicaciones operativas relativas a mi viaje a través de WhatsApp y correo electrónico, conforme a la Ley 1581 de 2012 y su política de privacidad. (PENDIENTE_REVISION_LEGAL)',
  TEXTO_MOSTRADO_PROMOCIONAL_PENDIENTE_REVISION_LEGAL:
    'Autorizo a la agencia de viajes el envío de ofertas comerciales, promociones exclusivas, paquetes vacacionales de temporada y novedades sobre destinos turísticos a través de WhatsApp y canales de mensajería autorizados, conforme a la Ley 1581 de 2012. (PENDIENTE_REVISION_LEGAL)',
  CANAL_DEFECTO: 'formulario-web',
  PRUEBA_DEFECTO: 'interfaz-crm:asesor-web',
} as const;

export const FINALIDADES_CONSENTIMIENTO: readonly Consentimiento[] = [
  'TRANSACCIONAL',
  'PROMOCIONAL',
] as const;

export interface MetadatosConsentimiento {
  otorgadoEn?: string | null | undefined;
  revocadoEn?: string | null | undefined;
  canal?: string | null | undefined;
  prueba?: string | null | undefined;
  versionAviso?: string | null | undefined;
  textoMostrado?: string | null | undefined;
}

export interface EstadoFinalidadConsentimiento {
  finalidad: Consentimiento;
  vigente: boolean;
  titulo: string;
  descripcion: string;
  impactoOperativo: string;
  otorgadoEn: string | null;
  revocadoEn: string | null;
  canal: string;
  prueba: string;
  versionAviso: string;
  textoMostrado: string;
}

/** Almacén en memoria de metadatos de trazabilidad por contactoId y finalidad para la sesión */
const registroMetadatosEnMemoria = new Map<string, Map<Consentimiento, MetadatosConsentimiento>>();

export function guardarMetadatosConsentimientoEnMemoria(
  contactoId: string,
  finalidad: Consentimiento,
  metadatos: MetadatosConsentimiento,
): void {
  let porContacto = registroMetadatosEnMemoria.get(contactoId);
  if (!porContacto) {
    porContacto = new Map<Consentimiento, MetadatosConsentimiento>();
    registroMetadatosEnMemoria.set(contactoId, porContacto);
  }
  const previo = porContacto.get(finalidad) ?? {};
  porContacto.set(finalidad, { ...previo, ...metadatos });
}

export function obtenerMetadatosConsentimientoEnMemoria(
  contactoId: string,
  finalidad: Consentimiento,
): MetadatosConsentimiento | undefined {
  return registroMetadatosEnMemoria.get(contactoId)?.get(finalidad);
}

export function limpiarMetadatosConsentimientoEnMemoria(): void {
  registroMetadatosEnMemoria.clear();
}

/**
 * Obtiene el texto legal por defecto de una finalidad para el aviso al titular.
 */
export function obtenerTextoAvisoPorDefecto(finalidad: Consentimiento): string {
  return finalidad === 'TRANSACCIONAL'
    ? TEXTOS_LEGALES_CONSENTIMIENTO.TEXTO_MOSTRADO_TRANSACCIONAL_PENDIENTE_REVISION_LEGAL
    : TEXTOS_LEGALES_CONSENTIMIENTO.TEXTO_MOSTRADO_PROMOCIONAL_PENDIENTE_REVISION_LEGAL;
}

/**
 * Obtiene la versión oficial del aviso de privacidad.
 */
export function obtenerVersionAvisoPorDefecto(): string {
  return TEXTOS_LEGALES_CONSENTIMIENTO.VERSION_AVISO_PENDIENTE_REVISION_LEGAL;
}

/**
 * Construye y valida el cuerpo del contrato OtorgarConsentimiento (R3).
 */
export function construirCuerpoOtorgarConsentimiento(params: {
  finalidad: Consentimiento;
  canal?: string | undefined;
  prueba?: string | undefined;
  textoMostrado?: string | undefined;
  versionAviso?: string | undefined;
}): OtorgarConsentimiento {
  const cuerpo: OtorgarConsentimiento = {
    finalidad: params.finalidad,
    canal: (params.canal ?? TEXTOS_LEGALES_CONSENTIMIENTO.CANAL_DEFECTO).trim(),
    prueba: (params.prueba ?? TEXTOS_LEGALES_CONSENTIMIENTO.PRUEBA_DEFECTO).trim(),
    textoMostrado: (params.textoMostrado ?? obtenerTextoAvisoPorDefecto(params.finalidad)).trim(),
    versionAviso: (params.versionAviso ?? obtenerVersionAvisoPorDefecto()).trim(),
  };

  return EsquemaOtorgarConsentimiento.parse(cuerpo);
}

/**
 * Construye y valida el cuerpo del contrato RevocarConsentimiento (R3).
 */
export function construirCuerpoRevocarConsentimiento(
  finalidad: Consentimiento,
): RevocarConsentimiento {
  const cuerpo: RevocarConsentimiento = { finalidad };
  return EsquemaRevocarConsentimiento.parse(cuerpo);
}

/**
 * Evalúa el estado detallado de una finalidad para un contacto.
 */
export function calcularEstadoFinalidad(
  contacto: Contacto,
  finalidad: Consentimiento,
  metadatosSobrescritos?: MetadatosConsentimiento,
): EstadoFinalidadConsentimiento {
  const vigente = contacto.consentimientos.includes(finalidad);
  const metadatosMemoria = obtenerMetadatosConsentimientoEnMemoria(contacto.id, finalidad);
  const metadatos = metadatosSobrescritos ?? metadatosMemoria;

  const esTransaccional = finalidad === 'TRANSACCIONAL';

  const titulo = esTransaccional
    ? 'Operativo y Cotización (Transaccional)'
    : 'Promociones y Ofertas (Promocional)';

  const descripcion = esTransaccional
    ? 'Autorización para cotizar, gestionar reservas turísticas, emitir tiquetes y enviar vouchers por WhatsApp.'
    : 'Autorización para recibir promociones de temporada, ofertas de pasadías y campañas de fidelización.';

  const impactoOperativo = esTransaccional
    ? 'Requerido para responder mensajes y enviar cotizaciones sin infringir las políticas de Meta y Ley 1581.'
    : 'Si se revoca, el contacto no puede ser incluido en campañas de difusión comercial o WhatsApp masivo.';

  const canal = metadatos?.canal ?? TEXTOS_LEGALES_CONSENTIMIENTO.CANAL_DEFECTO;
  const prueba = metadatos?.prueba ?? TEXTOS_LEGALES_CONSENTIMIENTO.PRUEBA_DEFECTO;
  const versionAviso = metadatos?.versionAviso ?? obtenerVersionAvisoPorDefecto();
  const textoMostrado = metadatos?.textoMostrado ?? obtenerTextoAvisoPorDefecto(finalidad);

  const otorgadoEn = vigente
    ? (metadatos?.otorgadoEn ?? contacto.creadoEn ?? new Date().toISOString())
    : (metadatos?.otorgadoEn ?? null);

  const revocadoEn = vigente ? null : (metadatos?.revocadoEn ?? null);

  return {
    finalidad,
    vigente,
    titulo,
    descripcion,
    impactoOperativo,
    otorgadoEn,
    revocadoEn,
    canal,
    prueba,
    versionAviso,
    textoMostrado,
  };
}

/**
 * Calcula la lista completa de estados para todas las finalidades reconocidas.
 */
export function calcularEstadosConsentimiento(
  contacto: Contacto,
  metadatosPorFinalidad?: Partial<Record<Consentimiento, MetadatosConsentimiento>>,
): EstadoFinalidadConsentimiento[] {
  return FINALIDADES_CONSENTIMIENTO.map((finalidad) =>
    calcularEstadoFinalidad(contacto, finalidad, metadatosPorFinalidad?.[finalidad]),
  );
}

/**
 * Conecta con el endpoint POST /api/v1/crm/contactos/:id/consentimientos
 * y registra en memoria los metadatos de auditoría para la UI.
 */
export async function otorgarConsentimiento(
  contactoId: string,
  finalidad: Consentimiento,
  opciones?: {
    canal?: string | undefined;
    prueba?: string | undefined;
    textoMostrado?: string | undefined;
    versionAviso?: string | undefined;
  },
): Promise<Contacto> {
  const cuerpo = construirCuerpoOtorgarConsentimiento({
    finalidad,
    canal: opciones?.canal,
    prueba: opciones?.prueba,
    textoMostrado: opciones?.textoMostrado,
    versionAviso: opciones?.versionAviso,
  });

  const contactoActualizado = await otorgarConsentimientoContactoApi(contactoId, cuerpo);

  guardarMetadatosConsentimientoEnMemoria(contactoId, finalidad, {
    otorgadoEn: new Date().toISOString(),
    revocadoEn: null,
    canal: cuerpo.canal,
    prueba: cuerpo.prueba,
    textoMostrado: cuerpo.textoMostrado,
    versionAviso: cuerpo.versionAviso,
  });

  return contactoActualizado;
}

/**
 * Conecta con el endpoint POST /api/v1/crm/contactos/:id/consentimientos/revocar
 * y actualiza en memoria el estado revocado para la UI.
 */
export async function revocarConsentimiento(
  contactoId: string,
  finalidad: Consentimiento,
): Promise<Contacto> {
  const cuerpo = construirCuerpoRevocarConsentimiento(finalidad);
  const contactoActualizado = await revocarConsentimientoContactoApi(contactoId, cuerpo);

  guardarMetadatosConsentimientoEnMemoria(contactoId, finalidad, {
    revocadoEn: new Date().toISOString(),
  });

  return contactoActualizado;
}
