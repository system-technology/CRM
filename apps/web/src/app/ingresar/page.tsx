import React, { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { estaAuthHabilitada } from '../../lib/auth-api';
import { FormularioIngreso } from '../../components/auth/formulario-ingreso';

export const metadata = {
  title: 'Ingresar | ViajaPro',
  description: 'Acceso seguro al CRM y canal nativo de ViajaPro',
};

/**
 * Ruta de acceso — ADR-0011 (0c.29).
 *
 * Si el interruptor está apagado, el servidor redirige directamente a /bandeja
 * sin enviar ningún elemento de la pantalla al cliente.
 */
export default function IngresarPage() {
  if (!estaAuthHabilitada()) {
    redirect('/bandeja');
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-50 dark:bg-neutral-950" />}>
      <FormularioIngreso />
    </Suspense>
  );
}
