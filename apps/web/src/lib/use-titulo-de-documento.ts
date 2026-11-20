'use client';

import { usePathname } from 'next/navigation';
import { tituloDeDocumentoParaRuta } from './navegacion';

/**
 * «{módulo} · ViajaPro» para la pestaña, según la ruta (ADR-0032 §3). Devuelve el texto: quien lo
 * usa lo pinta en un `<title>`, que React 19 eleva al `<head>`. Asignar `document.title` en un
 * efecto no sirve: React vuelve a escribir el `<title>` que declara `metadata` del layout raíz.
 */
export function useTituloDeDocumento(): string {
  const pathname = usePathname();
  return tituloDeDocumentoParaRuta(pathname ?? '');
}
