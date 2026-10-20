/**
 * `POST /api/v1/auth/invitaciones/aceptar`: la persona invitada acepta, SIN sesión.
 *
 *   1. Se CONSUME el token (se borra al leerlo): de dos aceptaciones simultáneas gana una.
 *      Inexistente, usado o caducado dan el mismo error.
 *   2. Si no hay identidad con ese correo, se crea, con la contraseña dada y el correo ya
 *      verificado (el token llegó a su buzón: eso lo prueba). **Si ya existe** (la persona está en
 *      otra agencia) NO se toca su contraseña: se ignora la que mande.
 *   3. Se crea la pertenencia en la agencia de la INVITACIÓN, bajo RLS con ese tenant. El tenant
 *      lo guardó el servidor al invitar: aquí el cliente solo aporta el token.
 *
 * Responde siempre `{ ok: true }`: no dice si la identidad existía.
 *
 * El correo verificado importa: el plugin de código por correo, al iniciar sesión con una
 * identidad SIN verificar, le borra la contraseña y las sesiones («cuenta sin probar»).
 */
import { Inject, Injectable } from '@nestjs/common';
import type { AceptarInvitacion } from '@viajapro/contracts';
import { hashearTokenDeInvitacion } from '../domain/invitacion.js';
import {
  PuertoIdentidades,
  PuertoInvitaciones,
  PuertoMiembros,
} from '../domain/puertos-de-miembros.js';
import { InvitacionInvalidaError } from './errores.js';

@Injectable()
export class AceptarInvitacionUseCase {
  constructor(
    @Inject(PuertoInvitaciones) private readonly invitaciones: PuertoInvitaciones,
    @Inject(PuertoIdentidades) private readonly identidades: PuertoIdentidades,
    @Inject(PuertoMiembros) private readonly miembros: PuertoMiembros,
  ) {}

  async ejecutar(entrada: AceptarInvitacion): Promise<void> {
    const invitacion = await this.invitaciones.consumir(hashearTokenDeInvitacion(entrada.token));
    if (!invitacion) throw new InvitacionInvalidaError();

    const existente = await this.identidades.buscarPorCorreo(invitacion.correo);
    if (existente?.eliminada) throw new InvitacionInvalidaError();
    const identidad =
      existente ??
      (await this.identidades.crearVerificada({
        correo: invitacion.correo,
        nombre: entrada.nombre,
        contrasena: entrada.contrasena,
      }));

    const resultado = await this.miembros.agregar({
      tenantId: invitacion.tenantId,
      identidadId: identidad.id,
      rolId: invitacion.rolId,
      correo: invitacion.correo,
      nombre: entrada.nombre,
    });
    if (resultado === 'rol_inexistente') throw new InvitacionInvalidaError();
  }
}
