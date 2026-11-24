'use client';

import React, { createContext, useContext, useEffect } from 'react';

/**
 * Título de la pestaña en una pantalla de DETALLE (T-633, ADR-0032 §4).
 *
 * El ADR ya lo exigía —«los detalles lo sobrescriben con `tituloDeDocumento(nombre)`»— y **ninguna
 * página lo hacía**. Medido el 2026-11-24: `/bandeja/<id>`, `/contactos/<id>` y `/cotizaciones/<id>`
 * no tocaban el título, así que seis conversaciones abiertas en seis pestañas decían las seis
 * «Conversaciones · ViajaPro» y no había forma de distinguirlas.
 *
 * Por qué hace falta un canal y no basta con que el detalle pinte su propio `<title>`: React 19 eleva
 * al `<head>` **todos** los `<title>` que encuentra, y el navegador se queda con el primero del
 * documento, que es el del marco. Dos `<title>` no se pisan: el de arriba gana. Así que el detalle
 * **avisa** al marco y el marco sigue siendo el único que pinta la etiqueta.
 *
 * Se repone al salir: quien desmonta el detalle devuelve el título de su módulo. Sin eso, volver a la
 * lista dejaría la pestaña con el nombre del contacto que ya no se está viendo.
 */
const FijarTitulo = createContext<((nombre: string | null) => void) | null>(null);

export function ProveedorDeTituloDeDetalle({
  fijar,
  children,
}: {
  fijar: (nombre: string | null) => void;
  children: React.ReactNode;
}) {
  return <FijarTitulo.Provider value={fijar}>{children}</FijarTitulo.Provider>;
}

/**
 * Pone el nombre de lo que se está viendo en la pestaña. `null` o vacío deja el título del módulo,
 * que es lo correcto mientras el detalle carga: enseñar «undefined · ViajaPro» sería peor.
 */
export function useFijarTituloDeDetalle(nombre: string | null | undefined): void {
  const fijar = useContext(FijarTitulo);
  useEffect(() => {
    if (!fijar) return;
    const limpio = nombre?.trim() ? nombre.trim() : null;
    fijar(limpio);
    return () => fijar(null);
  }, [fijar, nombre]);
}
