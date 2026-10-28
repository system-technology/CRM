/**
 * ViajaPro — Lógica del Asistente de Onboarding de Nueva Agencia (T-105)
 *
 * Asistente de 4 pasos (Marca, Catálogo, Equipo, Conectar WhatsApp)
 * que lleva a una agencia de viajes desde la cuenta vacía hasta su primera cotización enviada.
 * Todo paso es saltable, con progreso persistido por tenant sin exponer secretos en pantalla (Regla R6).
 */

import { validarFormatoNit } from './configuracion-logica';

export type PasoOnboardingId = 'marca' | 'catalogo' | 'equipo' | 'whatsapp';

export type EstadoPasoOnboarding = 'pendiente' | 'en_progreso' | 'completado' | 'omitido';

export interface PaletaMarcaPredefinida {
  id: string;
  nombre: string;
  colorHex: string;
  descripcion: string;
}

export const PALETAS_MARCA_PREDEFINIDAS: readonly PaletaMarcaPredefinida[] = [
  {
    id: 'dorado-cartagena',
    nombre: 'Dorado Cartagena',
    colorHex: '#C9A24B',
    descripcion: 'Elegancia colonial y prestigio costero histórico',
  },
  {
    id: 'azul-caribe',
    nombre: 'Azul Caribe',
    colorHex: '#0284C7',
    descripcion: 'Aguas cristalinas de islas del Rosario y San Andrés',
  },
  {
    id: 'verde-esmeralda',
    nombre: 'Verde Esmeralda',
    colorHex: '#059669',
    descripcion: 'Naturaleza exuberante de la Sierra Nevada y Eje Cafetero',
  },
  {
    id: 'magenta-buganvilla',
    nombre: 'Magenta Buganvilla',
    colorHex: '#BE185D',
    descripcion: 'Flores icónicas de balcones coloniales y calidez caribeña',
  },
  {
    id: 'atardecer-baru',
    nombre: 'Atardecer Barú',
    colorHex: '#EA580C',
    descripcion: 'Cálidos atardeceres dorados sobre el mar caribe',
  },
  {
    id: 'azul-profundo',
    nombre: 'Azul Océano Profundo',
    colorHex: '#1E40AF',
    descripcion: 'Seriedad ejecutiva para agencias corporativas y mayoristas',
  },
] as const;

export interface ExcursionMuestraOnboarding {
  id: string;
  titulo: string;
  destino: string;
  tipo: 'PASADIA' | 'CIRCUITO' | 'PAQUETE';
  precioBaseCop: number;
  duracion: string;
  incluye: string[];
}

export const EXCURSIONES_MUESTRA_COLOMBIA: readonly ExcursionMuestraOnboarding[] = [
  {
    id: 'exc-rosario-1',
    titulo: 'Pasadía Islas del Rosario & Acuario San Martín',
    destino: 'Cartagena de Indias',
    tipo: 'PASADIA',
    precioBaseCop: 240000,
    duracion: '1 día (8h)',
    incluye: [
      'Lancha rápida',
      'Almuerzo típico caribeño',
      'Entrada al acuario',
      'Seguro de asistencia',
    ],
  },
  {
    id: 'exc-ciudad-amurallada-2',
    titulo: 'City Tour Amurallado, Castillo San Felipe & Convento La Popa',
    destino: 'Cartagena de Indias',
    tipo: 'PASADIA',
    precioBaseCop: 85000,
    duracion: '4 horas',
    incluye: [
      'Transporte climatizado',
      'Guía profesional bilingüe',
      'Entradas incluidas',
      'Hidratación',
    ],
  },
  {
    id: 'exc-baru-3',
    titulo: 'Pasadía Playa Tranquila & Manglares de Barú',
    destino: 'Isla Barú',
    tipo: 'PASADIA',
    precioBaseCop: 130000,
    duracion: '1 día (7h)',
    incluye: ['Transporte terrestre', 'Almuerzo caribeño', 'Kiosco playero', 'Guía acompañante'],
  },
  {
    id: 'exc-cafetero-4',
    titulo: 'Circuito Eje Cafetero, Valle de Cocora & Termales (3D/2N)',
    destino: 'Quindío & Risaralda',
    tipo: 'CIRCUITO',
    precioBaseCop: 890000,
    duracion: '3 días / 2 noches',
    incluye: [
      'Alojamiento finca hotel',
      'Desayunos y cenas',
      'Jeep Willys a Cocora',
      'Entrada a termales',
    ],
  },
] as const;

export interface MiembroInvitadoOnboarding {
  correo: string;
  nombre?: string | null | undefined;
  rol: 'ASESOR' | 'ADMIN_AGENCIA' | 'OPERATIVO';
}

export interface DatosMarcaOnboarding {
  nombreComercial: string;
  razonSocial: string;
  nit: string;
  colorAcento: string;
  lema: string;
  ciudadBase: string;
  telefonoContacto: string;
}

export interface DatosCatalogoOnboarding {
  estrategia: 'semilla_demo' | 'importar_csv' | 'manual' | 'omitido';
  excursionesSeleccionadas: string[];
  totalExcursiones: number;
}

export interface DatosEquipoOnboarding {
  miembrosInvitados: MiembroInvitadoOnboarding[];
}

export interface ChecklistWhatsAppOnboarding {
  numeroDedicado: boolean;
  accesoMetaBusiness: boolean;
  nombreAprobado: boolean;
  webhookConfigurado: boolean;
}

export interface DatosWhatsAppOnboarding {
  modo: 'simulador' | 'meta_cloud_oficial' | 'pendiente';
  numeroE164?: string | null | undefined;
  wabaId?: string | null | undefined;
  phoneNumberId?: string | null | undefined;
  checklist: ChecklistWhatsAppOnboarding;
}

export interface ProgresoOnboarding {
  tenantId: string;
  pasoActual: PasoOnboardingId;
  pasos: Record<PasoOnboardingId, EstadoPasoOnboarding>;
  marca: DatosMarcaOnboarding;
  catalogo: DatosCatalogoOnboarding;
  equipo: DatosEquipoOnboarding;
  whatsapp: DatosWhatsAppOnboarding;
  completado: boolean;
  finalizadoEn?: string | null | undefined;
  actualizadoEn: string;
}

export const ORDEN_PASOS_ONBOARDING: readonly PasoOnboardingId[] = [
  'marca',
  'catalogo',
  'equipo',
  'whatsapp',
] as const;

export const TITULOS_PASOS_ONBOARDING: Record<
  PasoOnboardingId,
  { titulo: string; descripcion: string; tiempoEstimado: string; icono: string }
> = {
  marca: {
    titulo: 'Identidad y Marca de la Agencia',
    descripcion:
      'Personaliza el logo, color de acento y datos fiscales que verán tus viajeros en las cotizaciones.',
    tiempoEstimado: '2 min',
    icono: 'Sparkles',
  },
  catalogo: {
    titulo: 'Catálogo de Excursiones y Paquetes',
    descripcion:
      'Carga pasadías de ejemplo con un clic, importa tu tarifario en CSV o crea tu primer producto.',
    tiempoEstimado: '3 min',
    icono: 'Compass',
  },
  equipo: {
    titulo: 'Invitar Asesores y Equipo',
    descripcion:
      'Agrega a tus compañeros de venta y define quién atenderá chats y enviará cotizaciones.',
    tiempoEstimado: '2 min',
    icono: 'Users',
  },
  whatsapp: {
    titulo: 'Conectar WhatsApp Cloud API',
    descripcion:
      'Prepara el canal oficial de Meta para enviar cotizaciones y chatear sin arriesgar secretos ni baneos.',
    tiempoEstimado: '3 min',
    icono: 'MessageSquare',
  },
};

/**
 * Genera el estado inicial de onboarding para una agencia nueva.
 */
export function inicializarProgresoOnboarding(
  tenantId: string,
  nombreAgencia?: string | null,
): ProgresoOnboarding {
  const nombreLimpio = nombreAgencia?.trim() || 'Mi Agencia de Viajes';

  return {
    tenantId,
    pasoActual: 'marca',
    pasos: {
      marca: 'en_progreso',
      catalogo: 'pendiente',
      equipo: 'pendiente',
      whatsapp: 'pendiente',
    },
    marca: {
      nombreComercial: nombreLimpio,
      razonSocial: `${nombreLimpio} S.A.S.`,
      nit: '901.482.910-3',
      colorAcento: '#C9A24B', // Dorado Cartagena
      lema: 'Experiencias turísticas auténticas e inolvidables',
      ciudadBase: 'Cartagena de Indias',
      telefonoContacto: '+57 300 123 4567',
    },
    catalogo: {
      estrategia: 'semilla_demo',
      excursionesSeleccionadas: ['exc-rosario-1', 'exc-ciudad-amurallada-2', 'exc-baru-3'],
      totalExcursiones: 3,
    },
    equipo: {
      miembrosInvitados: [],
    },
    whatsapp: {
      modo: 'simulador',
      numeroE164: '+57 300 987 6543',
      wabaId: 'waba_demo_105',
      phoneNumberId: 'phone_demo_105',
      checklist: {
        numeroDedicado: true,
        accesoMetaBusiness: true,
        nombreAprobado: false,
        webhookConfigurado: false,
      },
    },
    completado: false,
    finalizadoEn: null,
    actualizadoEn: new Date().toISOString(),
  };
}

/**
 * Calcula el porcentaje de avance general del onboarding (0% a 100%).
 * Cada uno de los 4 pasos abordado ('completado' u 'omitido') aporta un 25%.
 */
export function calcularPorcentajeProgreso(
  pasos: Record<PasoOnboardingId, EstadoPasoOnboarding>,
): number {
  const pasosResueltos = ORDEN_PASOS_ONBOARDING.filter((p) => {
    const estado = pasos[p];
    return estado === 'completado' || estado === 'omitido';
  }).length;

  return Math.round((pasosResueltos / ORDEN_PASOS_ONBOARDING.length) * 100);
}

/**
 * Valida los datos del paso 1 (Marca e Identidad).
 */
export function validarPasoMarca(marca: DatosMarcaOnboarding): {
  valido: boolean;
  error?: string | null | undefined;
} {
  if (!marca.nombreComercial || marca.nombreComercial.trim().length < 2) {
    return {
      valido: false,
      error: 'El nombre comercial de la agencia es obligatorio y debe tener al menos 2 caracteres.',
    };
  }

  if (marca.nit && !validarFormatoNit(marca.nit)) {
    return {
      valido: false,
      error: 'El formato de NIT es inválido para Colombia (ejemplo válido: 901.482.910-3).',
    };
  }

  // Validación de color hexadecimal #RRGGBB
  const esColorHexValido = /^#[0-9A-Fa-f]{6}$/.test(marca.colorAcento);
  if (!esColorHexValido) {
    return {
      valido: false,
      error: 'El color de acento debe ser un código hexadecimal válido con formato #RRGGBB.',
    };
  }

  return { valido: true };
}

/**
 * Valida un correo electrónico para invitación de equipo.
 */
export function validarCorreoEquipo(correo: string): {
  valido: boolean;
  error?: string | null | undefined;
} {
  const limpio = correo.trim().toLowerCase();
  if (!limpio) {
    return { valido: false, error: 'El correo electrónico es requerido.' };
  }
  const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!regexEmail.test(limpio)) {
    return {
      valido: false,
      error: 'Ingresa un formato de correo electrónico válido (ej. asesor@miagencia.com).',
    };
  }
  return { valido: true };
}

/**
 * Valida que los datos del paso WhatsApp no contengan secretos (Regla R6).
 */
export function validarPasoWhatsApp(whatsapp: DatosWhatsAppOnboarding): {
  valido: boolean;
  error?: string | null | undefined;
} {
  const valores = [
    whatsapp.wabaId ?? '',
    whatsapp.phoneNumberId ?? '',
    whatsapp.numeroE164 ?? '',
  ].join(' ');

  // Verificamos que no se intenten pegar tokens o claves privadas
  const palabrasSecretas = ['EAAB', 'bearer', 'secret', 'token', 'sk_', 'BEGIN PRIVATE KEY'];
  for (const palabra of palabrasSecretas) {
    if (valores.toUpperCase().includes(palabra.toUpperCase())) {
      return {
        valido: false,
        error:
          'Regla R6 violada: no ingreses llaves de acceso ni tokens en este formulario. Las credenciales se configuran de forma segura y cifrada en el servidor.',
      };
    }
  }

  return { valido: true };
}

/**
 * Obtiene el siguiente paso en la secuencia de onboarding.
 */
export function obtenerSiguientePaso(pasoActual: PasoOnboardingId): PasoOnboardingId | null {
  const index = ORDEN_PASOS_ONBOARDING.indexOf(pasoActual);
  if (index >= 0 && index < ORDEN_PASOS_ONBOARDING.length - 1) {
    return ORDEN_PASOS_ONBOARDING[index + 1] ?? null;
  }
  return null;
}

/**
 * Obtiene el paso anterior en la secuencia de onboarding.
 */
export function obtenerPasoAnterior(pasoActual: PasoOnboardingId): PasoOnboardingId | null {
  const index = ORDEN_PASOS_ONBOARDING.indexOf(pasoActual);
  if (index > 0) {
    return ORDEN_PASOS_ONBOARDING[index - 1] ?? null;
  }
  return null;
}

/**
 * Clave de almacenamiento en localStorage con ámbito de tenant.
 */
export function obtenerClaveStorageOnboarding(tenantId?: string | null): string {
  const tenant = tenantId && tenantId.trim().length > 0 ? tenantId.trim() : 'global';
  return `viajapro:onboarding:${tenant}`;
}

/**
 * Carga el progreso de onboarding desde almacenamiento local.
 */
export function cargarProgresoOnboarding(
  tenantId?: string | null,
  nombreAgencia?: string | null,
): ProgresoOnboarding {
  const id = tenantId && tenantId.trim().length > 0 ? tenantId.trim() : 'tenant-demo';
  const defaultProgreso = inicializarProgresoOnboarding(id, nombreAgencia);

  if (typeof window === 'undefined' || !window.localStorage) {
    return defaultProgreso;
  }

  try {
    const raw = window.localStorage.getItem(obtenerClaveStorageOnboarding(id));
    if (!raw) return defaultProgreso;

    const parseado = JSON.parse(raw) as Partial<ProgresoOnboarding>;
    return {
      ...defaultProgreso,
      ...parseado,
      marca: {
        ...defaultProgreso.marca,
        ...(parseado.marca ?? {}),
      },
      catalogo: {
        ...defaultProgreso.catalogo,
        ...(parseado.catalogo ?? {}),
      },
      equipo: {
        ...defaultProgreso.equipo,
        ...(parseado.equipo ?? {}),
      },
      whatsapp: {
        ...defaultProgreso.whatsapp,
        ...(parseado.whatsapp ?? {}),
        checklist: {
          ...defaultProgreso.whatsapp.checklist,
          ...(parseado.whatsapp?.checklist ?? {}),
        },
      },
      pasos: {
        ...defaultProgreso.pasos,
        ...(parseado.pasos ?? {}),
      },
    };
  } catch {
    return defaultProgreso;
  }
}

/**
 * Guarda el progreso de onboarding en localStorage.
 */
export function guardarProgresoOnboarding(progreso: ProgresoOnboarding): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const clave = obtenerClaveStorageOnboarding(progreso.tenantId);
    window.localStorage.setItem(clave, JSON.stringify(progreso));
  } catch {
    // Almacenamiento local bloqueado o cuota excedida
  }
}

/**
 * Avanza o completa un paso del onboarding, actualizando el estado de los pasos.
 */
export function avanzarPasoOnboarding(
  progresoActual: ProgresoOnboarding,
  paso: PasoOnboardingId,
  datosActualizados?: Partial<ProgresoOnboarding>,
): ProgresoOnboarding {
  const nuevosPasos = { ...progresoActual.pasos, [paso]: 'completado' as EstadoPasoOnboarding };
  const siguientePaso = obtenerSiguientePaso(paso);

  if (siguientePaso && nuevosPasos[siguientePaso] === 'pendiente') {
    nuevosPasos[siguientePaso] = 'en_progreso';
  }

  const porcentaje = calcularPorcentajeProgreso(nuevosPasos);
  const estaCompletado = porcentaje === 100;

  const resultado: ProgresoOnboarding = {
    ...progresoActual,
    ...(datosActualizados ?? {}),
    pasos: nuevosPasos,
    pasoActual: siguientePaso ?? paso,
    completado: estaCompletado,
    finalizadoEn: estaCompletado ? (progresoActual.finalizadoEn ?? new Date().toISOString()) : null,
    actualizadoEn: new Date().toISOString(),
  };

  guardarProgresoOnboarding(resultado);
  return resultado;
}

/**
 * Omite un paso del onboarding, guardando el progreso y avanzando al siguiente.
 */
export function omitirPasoOnboarding(
  progresoActual: ProgresoOnboarding,
  paso: PasoOnboardingId,
): ProgresoOnboarding {
  const nuevosPasos = { ...progresoActual.pasos, [paso]: 'omitido' as EstadoPasoOnboarding };
  const siguientePaso = obtenerSiguientePaso(paso);

  if (siguientePaso && nuevosPasos[siguientePaso] === 'pendiente') {
    nuevosPasos[siguientePaso] = 'en_progreso';
  }

  const porcentaje = calcularPorcentajeProgreso(nuevosPasos);
  const estaCompletado = porcentaje === 100;

  const resultado: ProgresoOnboarding = {
    ...progresoActual,
    pasos: nuevosPasos,
    pasoActual: siguientePaso ?? paso,
    completado: estaCompletado,
    finalizadoEn: estaCompletado ? (progresoActual.finalizadoEn ?? new Date().toISOString()) : null,
    actualizadoEn: new Date().toISOString(),
  };

  guardarProgresoOnboarding(resultado);
  return resultado;
}

/**
 * Restablece el asistente al inicio con valores por defecto.
 */
export function restablecerOnboarding(
  tenantId: string,
  nombreAgencia?: string | null,
): ProgresoOnboarding {
  const reiniciado = inicializarProgresoOnboarding(tenantId, nombreAgencia);
  guardarProgresoOnboarding(reiniciado);
  return reiniciado;
}
