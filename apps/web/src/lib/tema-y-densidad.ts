/**
 * Gestión ergonómica de Modo Oscuro y Preferencia de Densidad Visual (T-111).
 *
 * Cumplimiento de criterios:
 * 1. Selector triple de tema: Claro ('light'), Oscuro ('dark') y Sistema ('system').
 * 2. Selector de densidad visual: Cómoda ('comoda') y Compacta ('compacta').
 * 3. Contraste WCAG 2.1 AA en ambos modos con adaptación de la marca turística de la agencia.
 * 4. Cero parpadeo al cargar (zero-flicker / anti-FOUC) mediante script inicial en head.
 */

export type ModoTema = 'light' | 'dark' | 'system';
export type DensidadVisual = 'comoda' | 'compacta';

export interface PreferenciasTemaYDensidad {
  tema: ModoTema;
  densidad: DensidadVisual;
}

export const CLAVE_LOCALSTORAGE_TEMA = 'viajapro_tema';
export const CLAVE_LOCALSTORAGE_DENSIDAD = 'viajapro_densidad';

export const PREFERENCIAS_TEMA_POR_DEFECTO: PreferenciasTemaYDensidad = {
  tema: 'system',
  densidad: 'comoda',
};

/**
 * Resuelve el tema visual efectivo ('dark' o 'light') según el modo configurado y el sistema.
 */
export function resolverTemaEfectivo(
  modo: ModoTema,
  sistemaPrefiereOscuro: boolean,
): 'dark' | 'light' {
  if (modo === 'dark') return 'dark';
  if (modo === 'light') return 'light';
  return sistemaPrefiereOscuro ? 'dark' : 'light';
}

/**
 * Consulta si el sistema operativo del usuario tiene preferencia por modo oscuro.
 */
export function consultarPreferenciaSistemaOscuro(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Carga las preferencias de tema y densidad desde localStorage con valores por defecto seguros.
 */
export function cargarPreferenciasTema(): PreferenciasTemaYDensidad {
  if (typeof window === 'undefined') {
    return PREFERENCIAS_TEMA_POR_DEFECTO;
  }

  try {
    const rawTema = localStorage.getItem(CLAVE_LOCALSTORAGE_TEMA);
    const rawDensidad = localStorage.getItem(CLAVE_LOCALSTORAGE_DENSIDAD);

    let tema: ModoTema = PREFERENCIAS_TEMA_POR_DEFECTO.tema;
    if (rawTema === 'light' || rawTema === 'dark' || rawTema === 'system') {
      tema = rawTema;
    }

    let densidad: DensidadVisual = PREFERENCIAS_TEMA_POR_DEFECTO.densidad;
    if (rawDensidad === 'comoda' || rawDensidad === 'compacta') {
      densidad = rawDensidad;
    }

    return { tema, densidad };
  } catch {
    return PREFERENCIAS_TEMA_POR_DEFECTO;
  }
}

/**
 * Aplica las clases y atributos en el elemento <html> del documento.
 */
export function aplicarTemaYDensidadEnDocumento(tema: ModoTema, densidad: DensidadVisual): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const sistemaOscuro = consultarPreferenciaSistemaOscuro();
  const efectivo = resolverTemaEfectivo(tema, sistemaOscuro);

  if (efectivo === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  root.setAttribute('data-tema', tema);
  root.setAttribute('data-tema-efectivo', efectivo);
  root.setAttribute('data-densidad', densidad);
}

/**
 * Guarda el modo de tema seleccionado en localStorage y lo aplica en el documento.
 */
export function guardarModoTema(modo: ModoTema): PreferenciasTemaYDensidad {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CLAVE_LOCALSTORAGE_TEMA, modo);
    } catch {
      // Ignorar restricciones de cuota
    }
  }

  const prefsActuales = cargarPreferenciasTema();
  const actualizadas: PreferenciasTemaYDensidad = {
    ...prefsActuales,
    tema: modo,
  };

  aplicarTemaYDensidadEnDocumento(actualizadas.tema, actualizadas.densidad);
  return actualizadas;
}

/**
 * Guarda la preferencia de densidad visual en localStorage y la aplica en el documento.
 */
export function guardarDensidadVisual(densidad: DensidadVisual): PreferenciasTemaYDensidad {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CLAVE_LOCALSTORAGE_DENSIDAD, densidad);
    } catch {
      // Ignorar restricciones de cuota
    }
  }

  const prefsActuales = cargarPreferenciasTema();
  const actualizadas: PreferenciasTemaYDensidad = {
    ...prefsActuales,
    densidad,
  };

  aplicarTemaYDensidadEnDocumento(actualizadas.tema, actualizadas.densidad);
  return actualizadas;
}

/**
 * Escucha cambios en las preferencias de color del sistema operativo si el modo es 'system'.
 */
export function suscribirCambiosSistema(callback: (esOscuro: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = (e: MediaQueryListEvent) => {
    callback(e.matches);
  };

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  } else if (typeof mediaQuery.addListener === 'function') {
    mediaQuery.addListener(listener);
    return () => mediaQuery.removeListener(listener);
  }

  return () => {};
}

/**
 * Script inline ultra-ligero para inyectar en <head> y prevenir cualquier parpadeo (FOUC).
 * Se ejecuta síncronamente antes de la primera pintura de la pantalla.
 */
export const SCRIPT_ANTI_FOUC = `(function(){try{var t=localStorage.getItem('${CLAVE_LOCALSTORAGE_TEMA}')||'system';var d=localStorage.getItem('${CLAVE_LOCALSTORAGE_DENSIDAD}')||'comoda';var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var dark=t==='dark'||(t==='system'&&m);var r=document.documentElement;if(dark){r.classList.add('dark')}else{r.classList.remove('dark')}r.setAttribute('data-tema',t);r.setAttribute('data-tema-efectivo',dark?'dark':'light');r.setAttribute('data-densidad',d)}catch(e){}})();`;
