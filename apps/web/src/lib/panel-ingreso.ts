/**
 * Contenido del panel de bienvenida de la pantalla de ingreso (T-620).
 *
 * Todo lo que cambia de una agencia a otra —fotos, titular, subtítulo, insignia, pie— es DATO y
 * vive aquí, no en el JSX (R12). El componente `PanelIngreso` lee una `ConfiguracionPanelIngreso`
 * y no sabe nada de Colombia: lo colombiano es solo el valor por omisión, el paquete estándar que
 * ViajaPro entrega a toda agencia hasta que ponga el suyo.
 *
 * CÓMO LLEGARÍA DESDE LA AGENCIA (no está implementado; necesita ADR y no es de esta tarea):
 *
 *  1. Hoy el ingreso es ANTERIOR a la sesión: no se sabe de qué agencia es quien mira, así que
 *     la agencia no puede llegar por la sesión. Hay que decidir cómo se la identifica antes de
 *     autenticar: subdominio o dominio propio de la agencia, una ruta con su identificador, o una
 *     pista que la web envíe a un endpoint público. Esa es la decisión de arquitectura.
 *  2. Un contrato Zod en `packages/contracts` con esta misma forma (R3), y una lectura pública
 *     y cacheable que devuelva SOLO esto —nunca datos de la agencia que no sean de presentación—
 *     sin abrir una vía que salte el aislamiento entre agencias (R1, R2).
 *  3. Dónde viven las fotos que suba la agencia (almacenamiento de objetos, con validación de
 *     tipo y peso, y formatos optimizados como los de `public/ingreso/`), y su origen en la
 *     `img-src` de la CSP (`lib/csp.ts`: hoy solo `'self' data: blob:`).
 *  4. Si la lectura falla, falta o viene vacía, se usa `PANEL_INGRESO_POR_OMISION`: el ingreso
 *     nunca puede quedarse sin pantalla por esto.
 *
 * Con eso, el cambio en la pantalla es pasar `configuracion` a `<PanelIngreso />`.
 */

export interface FotoDelPanel {
  /** Destino que muestra la foto. También lo lee el pie del panel. */
  destino: string;
  /** Texto alternativo de la foto, ya redactado para ese destino. */
  alt: string;
  /** Misma imagen en AVIF y en WebP (se elige la primera que el navegador entienda). */
  avif: string;
  webp: string;
  /** Dimensiones reales, para reservar el espacio. */
  ancho: number;
  alto: number;
  /** `object-position` si el encuadre importante no está en el centro. */
  posicion?: string;
}

export interface ConfiguracionPanelIngreso {
  /** Insignia de la esquina superior («Operación Colombia»). */
  insignia: string;
  /** Etiqueta sobre el titular. */
  etiqueta: string;
  /** Titular: el texto y, aparte, la parte que va resaltada. */
  titular: { inicio: string; destacado: string };
  subtitulo: string;
  /** Frase del pie, a la izquierda. */
  pie: string;
  /**
   * Destinos del pie, a la derecha. Si no se indican salen de las fotos, para que el pie nombre
   * lo que de verdad se está viendo.
   */
  destinosDelPie?: string[];
  fotos: FotoDelPanel[];
}

/** Destinos que se nombran en el pie: los indicados, o los de las fotos sin repetir. */
export function destinosDelPie(configuracion: ConfiguracionPanelIngreso): string[] {
  if (configuracion.destinosDelPie && configuracion.destinosDelPie.length > 0) {
    return configuracion.destinosDelPie;
  }
  return [...new Set(configuracion.fotos.map((foto) => foto.destino))];
}

/**
 * Paquete estándar de ViajaPro: destinos del Caribe colombiano. Procedencia y licencia de cada
 * foto: `apps/web/public/ingreso/LICENCIAS.md`.
 */
export const PANEL_INGRESO_POR_OMISION: ConfiguracionPanelIngreso = {
  insignia: 'Operación Colombia',
  etiqueta: 'Especializado en Turismo & Excursiones',
  titular: { inicio: 'Convierte conversaciones en', destacado: 'viajes reales' },
  subtitulo:
    'El CRM omnicanal para agencias de viajes. WhatsApp Cloud API nativo, cotizador express en COP, control de cupos y seguimiento comercial sin salir de la conversación.',
  pie: 'Diseñado para la agencia minorista que revende paquetes en Colombia',
  fotos: [
    {
      destino: 'Cartagena',
      alt: 'Vista aérea de Cartagena de Indias: los edificios de Bocagrande frente al mar Caribe',
      avif: '/ingreso/cartagena.avif',
      webp: '/ingreso/cartagena.webp',
      ancho: 1280,
      alto: 1280,
    },
    {
      destino: 'Santa Marta',
      alt: 'Montañas secas que caen al mar tranquilo de la bahía de Taganga, en Santa Marta',
      avif: '/ingreso/santa-marta.avif',
      webp: '/ingreso/santa-marta.webp',
      ancho: 1280,
      alto: 1280,
    },
    {
      destino: 'Barranquilla',
      alt: 'Atardecer sobre un caño del río Magdalena en Barranquilla, con una garza entre los manglares',
      avif: '/ingreso/barranquilla.avif',
      webp: '/ingreso/barranquilla.webp',
      ancho: 1280,
      alto: 1280,
    },
    {
      destino: 'Barú',
      alt: 'Olas suaves sobre la arena de una playa de la isla de Barú, con el mar turquesa al fondo',
      avif: '/ingreso/baru.avif',
      webp: '/ingreso/baru.webp',
      ancho: 1200,
      alto: 1200,
    },
  ],
};
