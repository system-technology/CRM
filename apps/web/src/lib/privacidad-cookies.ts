/**
 * Sistema de Gestión de Privacidad, Consentimiento y Cookies (T-094 & T-095).
 * Conforme a la Ley 1581 de 2012 (Habeas Data Colombia), Decreto 1074 de 2015
 * y directrices de la Superintendencia de Industria y Comercio (SIC).
 */

export type CategoriaCookie = 'NECESARIAS' | 'PREFERENCIAS' | 'ANALITICA';

export type DecisionConsentimiento = 'ACEPTAR_TODO' | 'SOLO_NECESARIAS' | 'PERSONALIZADO';

export interface PreferenciasConsentimiento {
  readonly necesarias: true;
  readonly preferencias: boolean;
  readonly analitica: boolean;
  readonly decision: DecisionConsentimiento;
  readonly version: number;
  readonly fechaUtc: string; // ISO-8601 UTC (R9)
}

export interface ItemInventarioCookie {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: 'cookie' | 'localStorage';
  readonly proveedor: string;
  readonly origen: string;
  readonly finalidad: string;
  readonly duracion: string;
  readonly categoria: CategoriaCookie;
  readonly estrictamenteNecesaria: boolean;
}

export const VERSION_POLITICA_COOKIES = 1;
export const CLAVE_LOCALSTORAGE_CONSENTIMIENTO = 'viajapro_consentimiento_cookies';
export const EVENTO_CONSENTIMIENTO_ACTUALIZADO = 'viajapro:consentimiento-cookies-actualizado';
export const EVENTO_ABRIR_MODAL_COOKIES = 'viajapro:abrir-modal-cookies';
export const DIAS_VALIDEZ_CONSENTIMIENTO = 365;

/**
 * Inventario completo oficial de cookies y almacenamiento de ViajaPro (T-094).
 */
export const INVENTARIO_COOKIES: readonly ItemInventarioCookie[] = [
  {
    id: 'cookie-sesion',
    nombre: 'viajapro.session_token / __Secure-viajapro.session_token',
    tipo: 'cookie',
    proveedor: 'viajapro.com',
    origen: '1er origen (apps/api)',
    finalidad:
      'Autenticación segura del asesor comercial y aislamiento multi-tenant por agencia de turismo (Better Auth).',
    duracion: '7 días (renovación móvil)',
    categoria: 'NECESARIAS',
    estrictamenteNecesaria: true,
  },
  {
    id: 'cookie-csrf',
    nombre: 'viajapro.csrf_token / __Secure-viajapro.csrf_token',
    tipo: 'cookie',
    proveedor: 'viajapro.com',
    origen: '1er origen (apps/api)',
    finalidad:
      'Prevención contra ataques Cross-Site Request Forgery (CSRF) en peticiones de cotización y mensajería.',
    duracion: 'Sesión',
    categoria: 'NECESARIAS',
    estrictamenteNecesaria: true,
  },
  {
    id: 'storage-consentimiento',
    nombre: CLAVE_LOCALSTORAGE_CONSENTIMIENTO,
    tipo: 'localStorage',
    proveedor: 'viajapro.com',
    origen: '1er origen (apps/web)',
    finalidad:
      'Registro auditable de la decisión de consentimiento del usuario con fecha UTC y versión legal (Ley 1581 / SIC).',
    duracion: '12 meses',
    categoria: 'NECESARIAS',
    estrictamenteNecesaria: true,
  },
  {
    id: 'storage-tema',
    nombre: 'viajapro_tema',
    tipo: 'localStorage',
    proveedor: 'viajapro.com',
    origen: '1er origen (apps/web)',
    finalidad:
      'Recordar el tema visual ergonómico (modo claro u oscuro) para jornadas laborales continuas de 8 horas.',
    duracion: 'Persistente',
    categoria: 'PREFERENCIAS',
    estrictamenteNecesaria: false,
  },
  {
    id: 'storage-demo',
    nombre: 'viajapro_modo_demo',
    tipo: 'localStorage',
    proveedor: 'viajapro.com',
    origen: '1er origen (apps/web)',
    finalidad:
      'Recordar si el usuario activó la previsualización con excursiones y paquetes turísticos de demostración.',
    duracion: 'Persistente',
    categoria: 'PREFERENCIAS',
    estrictamenteNecesaria: false,
  },
  {
    id: 'storage-telemetria',
    nombre: '_viajapro_telemetria_rendimiento',
    tipo: 'localStorage',
    proveedor: 'viajapro.com',
    origen: '1er origen (apps/web)',
    finalidad:
      'Telemetría anónima agregada de rendimiento (tiempo de carga de cotizador y estabilidad de conexión).',
    duracion: '30 días',
    categoria: 'ANALITICA',
    estrictamenteNecesaria: false,
  },
] as const;

/**
 * Recupera el consentimiento actualmente guardado en el navegador.
 * Devuelve `null` si aún no se ha tomado una decisión o si el consentimiento expiró.
 */
export function obtenerConsentimientoGuardado(): PreferenciasConsentimiento | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(CLAVE_LOCALSTORAGE_CONSENTIMIENTO);
    if (!raw) return null;

    const parseado = JSON.parse(raw) as Partial<PreferenciasConsentimiento>;

    if (
      typeof parseado !== 'object' ||
      parseado === null ||
      parseado.necesarias !== true ||
      typeof parseado.preferencias !== 'boolean' ||
      typeof parseado.analitica !== 'boolean' ||
      typeof parseado.fechaUtc !== 'string' ||
      typeof parseado.version !== 'number'
    ) {
      return null;
    }

    // Verificar expiración (1 año / 365 días)
    const fecha = new Date(parseado.fechaUtc).getTime();
    if (Number.isNaN(fecha)) return null;

    const ahora = Date.now();
    const milisegundosEn365Dias = DIAS_VALIDEZ_CONSENTIMIENTO * 24 * 60 * 60 * 1000;
    if (ahora - fecha > milisegundosEn365Dias) {
      // Expiró el plazo de consentimiento legal
      window.localStorage.removeItem(CLAVE_LOCALSTORAGE_CONSENTIMIENTO);
      return null;
    }

    const decisionValida: DecisionConsentimiento =
      parseado.decision === 'ACEPTAR_TODO' ||
      parseado.decision === 'SOLO_NECESARIAS' ||
      parseado.decision === 'PERSONALIZADO'
        ? parseado.decision
        : parseado.preferencias && parseado.analitica
          ? 'ACEPTAR_TODO'
          : !parseado.preferencias && !parseado.analitica
            ? 'SOLO_NECESARIAS'
            : 'PERSONALIZADO';

    return {
      necesarias: true,
      preferencias: parseado.preferencias,
      analitica: parseado.analitica,
      decision: decisionValida,
      version: parseado.version,
      fechaUtc: parseado.fechaUtc,
    };
  } catch {
    return null;
  }
}

/**
 * Guarda las preferencias de consentimiento y emite evento global de actualización.
 */
export function guardarConsentimiento(opciones: {
  preferencias: boolean;
  analitica: boolean;
  decision: DecisionConsentimiento;
}): PreferenciasConsentimiento {
  const registro: PreferenciasConsentimiento = {
    necesarias: true,
    preferencias: Boolean(opciones.preferencias),
    analitica: Boolean(opciones.analitica),
    decision: opciones.decision,
    version: VERSION_POLITICA_COOKIES,
    fechaUtc: new Date().toISOString(),
  };

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(CLAVE_LOCALSTORAGE_CONSENTIMIENTO, JSON.stringify(registro));

      // Limpieza de datos si el usuario revocó o rechazó analítica
      limpiarDatosNoConsentidos(registro);

      // Notificar reactivamente a la UI
      window.dispatchEvent(
        new CustomEvent(EVENTO_CONSENTIMIENTO_ACTUALIZADO, { detail: registro }),
      );
    } catch {
      // Manejo silencioso en entornos con storage restringido
    }
  }

  return registro;
}

/**
 * Acción rápida: Aceptar todas las cookies.
 */
export function aceptarTodasLasCookies(): PreferenciasConsentimiento {
  return guardarConsentimiento({
    preferencias: true,
    analitica: true,
    decision: 'ACEPTAR_TODO',
  });
}

/**
 * Acción rápida: Rechazar todo lo no esencial (solo necesarias).
 */
export function aceptarSoloCookiesNecesarias(): PreferenciasConsentimiento {
  return guardarConsentimiento({
    preferencias: false,
    analitica: false,
    decision: 'SOLO_NECESARIAS',
  });
}

/**
 * Comprueba si una categoría específica cuenta con autorización activa del usuario.
 */
export function tieneConsentimientoPara(categoria: CategoriaCookie): boolean {
  if (categoria === 'NECESARIAS') return true;

  const actual = obtenerConsentimientoGuardado();
  if (!actual) return false;

  if (categoria === 'PREFERENCIAS') return actual.preferencias;
  if (categoria === 'ANALITICA') return actual.analitica;

  return false;
}

/**
 * Emite evento en el navegador para que el modal de preferencias se abra desde el footer u otra vista.
 */
export function dispararAperturaModalCookies(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_MODAL_COOKIES));
  }
}

/**
 * Si el usuario no dio consentimiento para analítica o preferencias, se eliminan rastros locales no esenciales.
 */
export function limpiarDatosNoConsentidos(preferencias: PreferenciasConsentimiento): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    if (!preferencias.analitica) {
      window.localStorage.removeItem('_viajapro_telemetria_rendimiento');
    }
  } catch {
    // Ignorar si el storage está bloqueado
  }
}
