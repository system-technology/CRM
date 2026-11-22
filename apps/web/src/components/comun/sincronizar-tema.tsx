'use client';

import { useEffect } from 'react';
import {
  aplicarTemaYDensidadEnDocumento,
  cargarPreferenciasTema,
  suscribirCambiosSistema,
} from '../../lib/tema-y-densidad';

/**
 * Reafirma el tema en `<html>` después de hidratar (T-586).
 *
 * El script anti-parpadeo del `<head>` pone la clase `dark` antes de la primera pintura, pero si la
 * hidratación falla en cualquier pantalla (un desajuste servidor/cliente) React regenera el documento
 * y vacía los atributos de `<html>`: el modo oscuro desaparecía. Un efecto corre cuando el árbol
 * regenerado se monta, así que lo repone. En el caso sano no hace nada visible: aplica lo que ya hay.
 * También sigue al sistema operativo cuando el modo es «Sistema».
 */
export function SincronizarTema(): null {
  useEffect(() => {
    const aplicar = () => {
      const { tema, densidad } = cargarPreferenciasTema();
      aplicarTemaYDensidadEnDocumento(tema, densidad);
    };
    aplicar();
    return suscribirCambiosSistema(aplicar);
  }, []);
  return null;
}
