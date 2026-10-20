/**
 * Alta de identidades por invitación, con el pool de identidad (el único que las toca).
 * La contraseña se hashea con la MISMA función que usa el inicio de sesión (scrypt de Better Auth).
 */
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';
import { PuertoIdentidades } from '../domain/puertos-de-miembros.js';
import { PrismaIdentidadService } from './prisma-identidad.service.js';

@Injectable()
export class IdentidadesPrisma extends PuertoIdentidades {
  constructor(@Inject(PrismaIdentidadService) private readonly prisma: PrismaIdentidadService) {
    super();
  }

  async buscarPorCorreo(correo: string): Promise<{ id: string; eliminada: boolean } | null> {
    const i = await this.prisma.identidad.findUnique({
      where: { correo },
      select: { id: true, eliminadoEn: true },
    });
    return i ? { id: i.id, eliminada: i.eliminadoEn !== null } : null;
  }

  async crearVerificada(entrada: {
    correo: string;
    nombre: string;
    contrasena: string;
  }): Promise<{ id: string }> {
    const hash = await hashPassword(entrada.contrasena);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const identidad = await tx.identidad.create({
          data: { correo: entrada.correo, nombre: entrada.nombre, correoVerificado: true },
          select: { id: true },
        });
        await tx.credencial.create({
          data: { identidadId: identidad.id, proveedor: 'credential', hashContrasena: hash },
        });
        return identidad;
      });
    } catch (error) {
      // Dos invitaciones al mismo correo aceptadas a la vez: la otra ganó la creación.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const ya = await this.buscarPorCorreo(entrada.correo);
        if (ya && !ya.eliminada) return { id: ya.id };
      }
      throw error;
    }
  }
}
