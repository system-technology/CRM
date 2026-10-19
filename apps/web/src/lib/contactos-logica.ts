import { type Contacto, Consentimiento } from '@viajapro/contracts';

/**
 * Filtra la lista de contactos en base a término de búsqueda, etiqueta y tipo de consentimiento.
 */
export function filtrarContactos(
  contactos: Contacto[],
  busqueda: string,
  etiquetaFiltro: string = 'todas',
  consentimientoFiltro: string = 'todos',
): Contacto[] {
  const termino = busqueda.toLowerCase().trim();

  return contactos.filter((contacto) => {
    // 1. Filtro de búsqueda por texto (nombre, teléfono o correo)
    const coincideTexto =
      !termino ||
      (contacto.nombre && contacto.nombre.toLowerCase().includes(termino)) ||
      contacto.telefono.toLowerCase().includes(termino) ||
      (contacto.correo && contacto.correo.toLowerCase().includes(termino));

    if (!coincideTexto) return false;

    // 2. Filtro por etiqueta
    if (etiquetaFiltro !== 'todas') {
      if (!contacto.etiquetas.includes(etiquetaFiltro)) return false;
    }

    // 3. Filtro por consentimiento
    if (consentimientoFiltro !== 'todos') {
      const parsed = Consentimiento.safeParse(consentimientoFiltro);
      if (parsed.success && !contacto.consentimientos.includes(parsed.data)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Extrae la lista ordenada y única de todas las etiquetas de negocio presentes en los contactos.
 */
export function obtenerEtiquetasDisponibles(contactos: Contacto[]): string[] {
  const setEtiquetas = new Set<string>();
  contactos.forEach((c) => {
    c.etiquetas.forEach((e) => setEtiquetas.add(e));
  });
  return Array.from(setEtiquetas).sort();
}

/**
 * Formatea un teléfono E.164 colombiano (+573001234567) con espaciado legible (+57 300 123 4567).
 */
export function formatearTelefonoVisual(telefono: string): string {
  if (telefono.startsWith('+57') && telefono.length === 13) {
    return `+57 ${telefono.slice(3, 6)} ${telefono.slice(6, 9)} ${telefono.slice(9)}`;
  }
  return telefono;
}
