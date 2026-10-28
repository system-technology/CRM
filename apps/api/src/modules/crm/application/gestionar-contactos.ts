/**
 * Casos de uso: alta y edición de contacto (T-075).
 *
 * El teléfono pasa por `PhoneNumber`: lo que se guarda es siempre E.164 canónico, así que
 * «+57 300 123 4567» y «0057-3001234567» son el mismo contacto y no dos.
 *
 * R10: `preferencias` puede ser dato de salud. Aquí no se registra su valor en ningún log.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Contacto, CrearContacto, EditarContacto } from '@viajapro/contracts';
import { PhoneNumber } from '@viajapro/domain';
import { ContactoNoEncontradoError } from '../domain/errors.js';
import { type CambiosDeContacto, PuertoEscrituraCrm } from './puerto-escritura-crm.js';

/** Etiquetas sin duplicados (ignorando mayúsculas) y en el orden en que se escribieron. */
function sinRepetidas(etiquetas: string[]): string[] {
  const vistas = new Set<string>();
  return etiquetas.filter((e) => {
    const k = e.toLowerCase();
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

@Injectable()
export class GestionarContactos {
  constructor(@Inject(PuertoEscrituraCrm) private readonly escritura: PuertoEscrituraCrm) {}

  async crear(entrada: CrearContacto, actorId: string | null): Promise<Contacto> {
    return this.escritura.crearContacto({
      telefonoE164: PhoneNumber.parse(entrada.telefono).e164,
      nombre: entrada.nombre ?? null,
      correo: entrada.correo ?? null,
      etiquetas: sinRepetidas(entrada.etiquetas),
      preferencias: entrada.preferencias ?? null,
      creadoPorId: actorId,
    });
  }

  async editar(
    contactoId: string,
    entrada: EditarContacto,
    actorId: string | null,
  ): Promise<Contacto> {
    const cambios: CambiosDeContacto = {};
    if (entrada.telefono !== undefined) {
      cambios.telefonoE164 = PhoneNumber.parse(entrada.telefono).e164;
    }
    if (entrada.nombre !== undefined) cambios.nombre = entrada.nombre;
    if (entrada.correo !== undefined) cambios.correo = entrada.correo;
    if (entrada.etiquetas !== undefined) cambios.etiquetas = sinRepetidas(entrada.etiquetas);
    if (entrada.preferencias !== undefined) cambios.preferencias = entrada.preferencias;

    const editado = await this.escritura.editarContacto(contactoId, cambios, actorId);
    if (!editado) throw new ContactoNoEncontradoError(contactoId);
    return editado;
  }
}
