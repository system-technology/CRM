'use client';

import { useEffect, useState } from 'react';

/**
 * `false` en el servidor y en la primera pintura del cliente; `true` desde que el componente se montó.
 *
 * Sirve para lo que el servidor no puede saber (`?demo=1`, `localStorage`): se pinta después del
 * montaje, así la primera pintura del cliente es idéntica al HTML del servidor y la hidratación no
 * falla (React 418, T-607). Un efecto puede leer el valor real desde el primer momento; solo lo que
 * se pinta espera.
 */
export function useMontado(): boolean {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  return montado;
}
