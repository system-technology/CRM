'use client';

import { useEffect, useState } from 'react';
import type { ContactoDeLista, ResumenDeArchivo } from '@viajapro/contracts';
import { inboxApi } from './inbox-api';
import { listarArchivos } from './archivos-api';
import { listarContactos } from './crm-api';
import { conversacionDelContacto, terminoDeBusquedaDelContacto } from './enlaces-viaje-logica';

/** Lo mínimo que hace falta del contacto para buscar su conversación. */
export type ContactoParaEnlaces = Pick<ContactoDeLista, 'id' | 'nombre' | 'telefono'>;

export type EstadoDeEnlace<T> = { tipo: 'cargando' } | { tipo: 'listo'; valor: T };

export interface EnlacesDelViaje {
  /** El contacto completo de la lista; `null` si no se pudo leer. */
  contacto: EstadoDeEnlace<ContactoDeLista | null>;
  /** Id de la conversación del contacto en la bandeja; `null` si no hay una visible para esta persona. */
  conversacionId: EstadoDeEnlace<string | null>;
  /** Todos los files de la agencia (abiertos y cancelados): una sola petición. */
  archivos: EstadoDeEnlace<ResumenDeArchivo[]>;
}

/**
 * Resuelve los enlaces del viaje con tres peticiones a lo sumo, no una por fila: el contacto (si la
 * pantalla no lo trae), la bandeja filtrada por su teléfono y la lista de files. Lo que falla se
 * trata como «no se sabe»: el enlace no se pinta y la pantalla sigue siendo útil.
 */
export function useEnlacesDelViaje(
  contactoId: string | null,
  contactoConocido?: ContactoParaEnlaces | null,
  opciones: { conArchivos?: boolean } = {},
): EnlacesDelViaje {
  const { conArchivos = true } = opciones;
  const [contacto, setContacto] = useState<EstadoDeEnlace<ContactoDeLista | null>>({
    tipo: 'cargando',
  });
  const [conversacionId, setConversacionId] = useState<EstadoDeEnlace<string | null>>({
    tipo: 'cargando',
  });
  const [archivos, setArchivos] = useState<EstadoDeEnlace<ResumenDeArchivo[]>>({
    tipo: 'cargando',
  });

  useEffect(() => {
    if (!conArchivos) {
      setArchivos({ tipo: 'listo', valor: [] });
      return;
    }
    let vigente = true;
    listarArchivos('TODOS')
      .then((v) => {
        if (vigente) setArchivos({ tipo: 'listo', valor: v });
      })
      .catch((e: unknown) => {
        console.warn('[enlaces] Sin lista de archivos para enlazar:', e);
        if (vigente) setArchivos({ tipo: 'listo', valor: [] });
      });
    return () => {
      vigente = false;
    };
  }, [conArchivos]);

  const conocidoId = contactoConocido?.id ?? null;
  const conocidoNombre = contactoConocido?.nombre ?? null;
  const conocidoTelefono = contactoConocido?.telefono ?? null;
  const conocido = conocidoId === contactoId && conocidoTelefono !== null;

  useEffect(() => {
    if (!contactoId || conocido) return;
    let vigente = true;
    setContacto({ tipo: 'cargando' });
    listarContactos()
      .then((pag) => {
        if (!vigente) return;
        const c = pag.datos.find((x) => x.id === contactoId);
        setContacto({ tipo: 'listo', valor: c ?? null });
      })
      .catch((e: unknown) => {
        console.warn('[enlaces] Sin contacto para enlazar:', e);
        if (vigente) setContacto({ tipo: 'listo', valor: null });
      });
    return () => {
      vigente = false;
    };
  }, [contactoId, conocido]);

  const paraBuscar: ContactoParaEnlaces | null = conocido
    ? { id: contactoId ?? '', nombre: conocidoNombre, telefono: conocidoTelefono ?? '' }
    : contacto.tipo === 'listo'
      ? contacto.valor
      : null;
  const termino = paraBuscar ? terminoDeBusquedaDelContacto(paraBuscar) : null;
  const contactoResuelto = paraBuscar?.id;
  const contactoCargando = !conocido && contacto.tipo === 'cargando';

  useEffect(() => {
    if (contactoCargando) {
      setConversacionId({ tipo: 'cargando' });
      return;
    }
    if (!termino || !contactoResuelto) {
      setConversacionId({ tipo: 'listo', valor: null });
      return;
    }
    let vigente = true;
    setConversacionId({ tipo: 'cargando' });
    inboxApi
      .consultarBandeja({ filtro: 'TODAS', buscar: termino, limite: 10 })
      .then((pag) => {
        if (vigente) {
          setConversacionId({
            tipo: 'listo',
            valor: conversacionDelContacto(pag.datos, contactoResuelto),
          });
        }
      })
      .catch((e: unknown) => {
        console.warn('[enlaces] Sin conversación para enlazar:', e);
        if (vigente) setConversacionId({ tipo: 'listo', valor: null });
      });
    return () => {
      vigente = false;
    };
  }, [contactoCargando, termino, contactoResuelto]);

  return { contacto, conversacionId, archivos };
}
