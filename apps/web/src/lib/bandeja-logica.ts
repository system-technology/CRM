import { ConversacionResumen, EventoBandeja } from '@viajapro/contracts';

export interface ResultadoGuardiaReorden {
  listaVisible: ConversacionResumen[];
  nuevoBuffer: ConversacionResumen[] | null;
  nuevoPendiente: boolean;
}

/**
 * Aplica un EventoBandeja a la lista de conversaciones respetando la guardia del cursor (R5/UI).
 * Si el ratón está encima de la lista, acumula en el buffer sin mover las filas bajo el puntero.
 */
export function reordenarConGuardia(
  prevVisible: ConversacionResumen[],
  bufferActual: ConversacionResumen[] | null,
  evento: EventoBandeja,
  ratonEncima: boolean,
): ResultadoGuardiaReorden {
  // Base de derivación: acumula sobre el buffer si ya existe
  const base = bufferActual ? [...bufferActual] : [...prevVisible];

  let conversacionId: string | null = null;
  let conversacionActualizada: Partial<ConversacionResumen> | null = null;

  if (evento.tipo === 'MENSAJE_NUEVO') {
    conversacionId = evento.conversacionId;
    conversacionActualizada = {
      ultimoMensajeTexto: evento.mensaje.texto || 'Archivo adjunto',
      ultimoMensajeEn: evento.mensaje.ocurridoEn,
      ultimoMensajeDireccion: evento.mensaje.direccion,
    };
  } else if (evento.tipo === 'CONVERSACION_ACTUALIZADA') {
    conversacionId = evento.conversacion.id;
    conversacionActualizada = evento.conversacion;
  } else if (evento.tipo === 'MENSAJE_ACTUALIZADO') {
    conversacionId = evento.conversacionId;
  }

  if (!conversacionId) {
    return {
      listaVisible: prevVisible,
      nuevoBuffer: bufferActual,
      nuevoPendiente: false,
    };
  }

  const idx = base.findIndex((c) => c.id === conversacionId);

  if (idx !== -1 && base[idx]) {
    const convExistente = base[idx];
    const actualizada: ConversacionResumen = {
      ...convExistente,
      ...(conversacionActualizada || {}),
      mensajesSinLeer:
        evento.tipo === 'MENSAJE_NUEVO' && evento.mensaje.direccion === 'ENTRANTE'
          ? convExistente.mensajesSinLeer + 1
          : convExistente.mensajesSinLeer,
    };

    if (ratonEncima) {
      // Reemplazar in-place en el buffer para no mover la fila visible
      base[idx] = actualizada;
      return {
        listaVisible: prevVisible,
        nuevoBuffer: base,
        nuevoPendiente: true,
      };
    } else {
      // Mover al tope si hay mensaje nuevo
      base.splice(idx, 1);
      base.unshift(actualizada);
      return {
        listaVisible: base,
        nuevoBuffer: null,
        nuevoPendiente: false,
      };
    }
  } else if (evento.tipo === 'CONVERSACION_ACTUALIZADA') {
    // Si es nueva conversación no presente
    if (ratonEncima) {
      base.unshift(evento.conversacion);
      return {
        listaVisible: prevVisible,
        nuevoBuffer: base,
        nuevoPendiente: true,
      };
    } else {
      base.unshift(evento.conversacion);
      return {
        listaVisible: base,
        nuevoBuffer: null,
        nuevoPendiente: false,
      };
    }
  }

  return {
    listaVisible: prevVisible,
    nuevoBuffer: bufferActual,
    nuevoPendiente: false,
  };
}

/**
 * Determina si el contenedor de chat debe hacer auto-scroll hacia el fondo
 * según la distancia actual al fondo.
 */
export function debeBajarElScroll(distanciaAlFondo: number, umbralPx: number = 80): boolean {
  return distanciaAlFondo <= umbralPx;
}

/**
 * Retorna la clave de idempotencia existente para un reintento, o genera una nueva si es primer intento.
 * Regla R5: reintentar un envío fallido reutiliza estrictamente la misma clave.
 */
export function claveDeReintento(
  mapaIdempotencia: Record<string, string>,
  mensajeId: string,
): { clave: string; esReutilizada: boolean } {
  const claveExistente = mapaIdempotencia[mensajeId];
  if (claveExistente) {
    return {
      clave: claveExistente,
      esReutilizada: true,
    };
  }

  const nuevaClave = crypto.randomUUID();
  mapaIdempotencia[mensajeId] = nuevaClave;
  return {
    clave: nuevaClave,
    esReutilizada: false,
  };
}

/**
 * Calcula el tiempo restante de la ventana de servicio de 24 horas de Meta.
 */
export function calcularTiempoRestanteVentana(expiraEn: string | Date | null): {
  minutos: number;
  horas: number;
  cerrada: boolean;
  texto: string;
} {
  if (!expiraEn) {
    return { minutos: 0, horas: 0, cerrada: true, texto: 'Ventana cerrada' };
  }

  const fechaLimite = new Date(expiraEn).getTime();
  const ahora = Date.now();
  const difMs = fechaLimite - ahora;

  if (difMs <= 0) {
    return { minutos: 0, horas: 0, cerrada: true, texto: 'Ventana cerrada' };
  }

  const minutosTotales = Math.floor(difMs / (1000 * 60));
  const horas = Math.floor(minutosTotales / 60);
  const minutos = minutosTotales % 60;

  const texto = horas > 0 ? `${horas} h ${minutos} min` : `${minutos} min`;

  return {
    minutos: minutosTotales,
    horas,
    cerrada: false,
    texto,
  };
}

const PALETAS_AVATAR = [
  { bg: 'bg-blue-100 dark:bg-blue-950', text: 'text-blue-700 dark:text-blue-300' },
  { bg: 'bg-emerald-100 dark:bg-emerald-950', text: 'text-emerald-700 dark:text-emerald-300' },
  { bg: 'bg-amber-100 dark:bg-amber-950', text: 'text-amber-700 dark:text-amber-300' },
  { bg: 'bg-purple-100 dark:bg-purple-950', text: 'text-purple-700 dark:text-purple-300' },
  { bg: 'bg-rose-100 dark:bg-rose-950', text: 'text-rose-700 dark:text-rose-300' },
  { bg: 'bg-cyan-100 dark:bg-cyan-950', text: 'text-cyan-700 dark:text-cyan-300' },
  { bg: 'bg-indigo-100 dark:bg-indigo-950', text: 'text-indigo-700 dark:text-indigo-300' },
];

/**
 * Retorna estilos de fondo y texto deterministas según el identificador de contacto.
 */
export function generarColorAvatar(id: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PALETAS_AVATAR.length;
  return PALETAS_AVATAR[index]!;
}

/**
 * Obtiene las iniciales en mayúscula (p. ej. "Sofía Gómez" -> "SG").
 */
export function obtenerIniciales(nombre: string | null, telefono?: string): string {
  if (nombre && nombre.trim()) {
    const partes = nombre.trim().split(/\s+/);
    if (partes.length >= 2 && partes[0] && partes[1]) {
      return (partes[0][0]! + partes[1][0]!).toUpperCase();
    }
    return partes[0]!.slice(0, 2).toUpperCase();
  }

  if (telefono && telefono.length >= 2) {
    return telefono.slice(-2);
  }

  return 'VP';
}
