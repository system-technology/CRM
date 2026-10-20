/* eslint-disable @typescript-eslint/require-await -- dobles de prueba: cumplen un puerto asíncrono sin esperar nada */
/**
 * Los casos de uso de invitar y aceptar, con puertos de mentira. La integración con RLS, la base
 * y el correo está en `invitaciones.e2e-spec.ts`.
 */
import type { Permiso } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import {
  type MensajeDeCorreo,
  PuertoColaDeCorreo,
} from '../../../shared/puertos/puerto-de-correo.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  type DatosDeInvitacion,
  enlaceDeInvitacion,
  hashearTokenDeInvitacion,
} from '../domain/invitacion.js';
import {
  type DescripcionDeInvitacion,
  PuertoIdentidades,
  PuertoInvitaciones,
  PuertoMiembros,
  type ResultadoDeAlta,
} from '../domain/puertos-de-miembros.js';
import { AceptarInvitacionUseCase } from './aceptar-invitacion.use-case.js';
import { InvitacionInvalidaError, RolNoEncontradoError } from './errores.js';
import { InvitarMiembroUseCase } from './invitar-miembro.use-case.js';

class Invitaciones extends PuertoInvitaciones {
  guardadas = new Map<string, { datos: DatosDeInvitacion; expiraEn: Date }>();
  async guardar(hash: string, datos: DatosDeInvitacion, expiraEn: Date): Promise<void> {
    this.guardadas.set(hash, { datos, expiraEn });
  }
  async consumir(hash: string): Promise<DatosDeInvitacion | null> {
    const g = this.guardadas.get(hash);
    this.guardadas.delete(hash);
    return g ? g.datos : null;
  }
}
class Miembros extends PuertoMiembros {
  altas: unknown[] = [];
  constructor(
    private readonly rol: DescripcionDeInvitacion | null = {
      agencia: 'A',
      rol: 'Asesor',
      permisos: [],
    },
    private readonly alta: ResultadoDeAlta | 'rol_inexistente' = 'creado',
  ) {
    super();
  }
  async describirInvitacion(): Promise<DescripcionDeInvitacion | null> {
    return this.rol;
  }
  async agregar(entrada: unknown): Promise<ResultadoDeAlta | 'rol_inexistente'> {
    this.altas.push(entrada);
    return this.alta;
  }
}
class Identidades extends PuertoIdentidades {
  creadas: unknown[] = [];
  constructor(private readonly existente: { id: string; eliminada: boolean } | null = null) {
    super();
  }
  async buscarPorCorreo(): Promise<{ id: string; eliminada: boolean } | null> {
    return this.existente;
  }
  async crearVerificada(entrada: unknown): Promise<{ id: string }> {
    this.creadas.push(entrada);
    return { id: 'nueva' };
  }
}
class Correo extends PuertoColaDeCorreo {
  enviados: Array<{ mensaje: MensajeDeCorreo; clave: string }> = [];
  async encolar(mensaje: MensajeDeCorreo, clave: string): Promise<void> {
    this.enviados.push({ mensaje, clave });
  }
}

const conPermisos = <T>(permisos: Permiso[], fn: () => T): T =>
  ContextoTenant.ejecutarCon(
    {
      tenantId: 't1',
      usuarioId: 'u1',
      identidadId: 'i1',
      permisos: new Set(permisos),
      trazaId: 'x',
    },
    fn,
  );

describe('InvitarMiembroUseCase', () => {
  const armar = (miembros = new Miembros()) => {
    const invitaciones = new Invitaciones();
    const correo = new Correo();
    return {
      invitaciones,
      correo,
      caso: new InvitarMiembroUseCase(miembros, invitaciones, correo),
    };
  };
  const entrada = { correo: 'a@b.test', rolId: '00000000-0000-4000-8000-000000000001' };

  it('sin el permiso, 403 y no guarda ni envía nada', async () => {
    const { caso, invitaciones, correo } = armar();
    await expect(
      conPermisos([], () => caso.ejecutar(entrada, 'http://web')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(invitaciones.guardadas.size).toBe(0);
    expect(correo.enviados).toHaveLength(0);
  });

  it('nadie reparte más de lo que tiene: un rol con permisos de más es 403 y no guarda nada', async () => {
    const miembros = new Miembros({
      agencia: 'A',
      rol: 'Dueño',
      permisos: ['usuarios.administrar', 'roles.administrar'],
    });
    const { caso, invitaciones, correo } = armar(miembros);
    await expect(
      conPermisos(['usuarios.administrar'], () => caso.ejecutar(entrada, 'http://web')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(invitaciones.guardadas.size).toBe(0);
    expect(correo.enviados).toHaveLength(0);
  });

  it('un rol cuyos permisos están incluidos en los del invitador sí se puede dar', async () => {
    const miembros = new Miembros({
      agencia: 'A',
      rol: 'Ops',
      permisos: ['conversaciones.ver_todas'],
    });
    const { caso, invitaciones } = armar(miembros);
    await conPermisos(['usuarios.administrar', 'conversaciones.ver_todas'], () =>
      caso.ejecutar(entrada, 'http://web'),
    );
    expect(invitaciones.guardadas.size).toBe(1);
  });

  it('un rol sin permisos lo puede dar cualquiera que pueda invitar', async () => {
    const { caso, invitaciones } = armar();
    await conPermisos(['usuarios.administrar'], () => caso.ejecutar(entrada, 'http://web'));
    expect(invitaciones.guardadas.size).toBe(1);
  });

  it('un rol que no es de la agencia (RLS no lo ve) es 404 y no guarda nada', async () => {
    const { caso, invitaciones } = armar(new Miembros(null));
    await expect(
      conPermisos(['usuarios.administrar'], () => caso.ejecutar(entrada, 'http://web')),
    ).rejects.toBeInstanceOf(RolNoEncontradoError);
    expect(invitaciones.guardadas.size).toBe(0);
  });

  it('guarda el HASH (no el token), con el tenant del contexto, y encola el enlace', async () => {
    const { caso, invitaciones, correo } = armar();
    const ahora = new Date('2027-01-01T00:00:00Z');
    await conPermisos(['usuarios.administrar'], () => caso.ejecutar(entrada, 'http://web/', ahora));

    const [hash, guardada] = [...invitaciones.guardadas][0] ?? [];
    expect(guardada?.datos).toEqual({
      tenantId: 't1',
      correo: 'a@b.test',
      rolId: entrada.rolId,
      invitadoPorUsuarioId: 'u1',
    });
    expect(guardada?.expiraEn.getTime()).toBe(ahora.getTime() + 7 * 24 * 3600 * 1000);

    const { mensaje, clave } = correo.enviados[0]!;
    const token = /token=([^\s]+)/.exec(mensaje.texto)?.[1] ?? '';
    expect(hashearTokenDeInvitacion(decodeURIComponent(token))).toBe(hash);
    expect(mensaje.texto).toContain(enlaceDeInvitacion('http://web', decodeURIComponent(token)));
    expect(JSON.stringify([...invitaciones.guardadas])).not.toContain(token);
    expect(clave).toBe(`invitacion-${hash!.slice(0, 32)}`);
  });

  it('hace lo mismo exista o no el correo en el sistema: no consulta identidades', async () => {
    // El caso de uso ni siquiera recibe el puerto de identidades: no puede distinguir.
    expect(InvitarMiembroUseCase.length).toBe(3);
  });
});

describe('AceptarInvitacionUseCase', () => {
  const datos: DatosDeInvitacion = {
    tenantId: 't1',
    correo: 'a@b.test',
    rolId: 'r1',
    invitadoPorUsuarioId: null,
  };
  const cuerpo = { token: 'x'.repeat(43), nombre: 'Ana', contrasena: 'una-clave-larga-1' };
  const armar = (opciones: {
    identidades?: Identidades;
    miembros?: Miembros;
    guardar?: boolean;
  }) => {
    const invitaciones = new Invitaciones();
    if (opciones.guardar !== false) {
      invitaciones.guardadas.set(hashearTokenDeInvitacion(cuerpo.token), {
        datos,
        expiraEn: new Date(),
      });
    }
    const identidades = opciones.identidades ?? new Identidades();
    const miembros = opciones.miembros ?? new Miembros();
    return {
      invitaciones,
      identidades,
      miembros,
      caso: new AceptarInvitacionUseCase(invitaciones, identidades, miembros),
    };
  };

  it('crea la identidad y la membresía en el tenant de la INVITACIÓN', async () => {
    const { caso, identidades, miembros } = armar({});
    await caso.ejecutar(cuerpo);
    expect(identidades.creadas).toEqual([
      { correo: 'a@b.test', nombre: 'Ana', contrasena: cuerpo.contrasena },
    ]);
    expect(miembros.altas).toEqual([
      { tenantId: 't1', identidadId: 'nueva', rolId: 'r1', correo: 'a@b.test', nombre: 'Ana' },
    ]);
  });

  it('con una identidad existente no la crea ni toca su contraseña', async () => {
    const { caso, identidades, miembros } = armar({
      identidades: new Identidades({ id: 'vieja', eliminada: false }),
    });
    await caso.ejecutar(cuerpo);
    expect(identidades.creadas).toHaveLength(0);
    expect(miembros.altas).toMatchObject([{ identidadId: 'vieja' }]);
  });

  it('el token es de un solo uso: la segunda vez, rechazo', async () => {
    const { caso } = armar({});
    await caso.ejecutar(cuerpo);
    await expect(caso.ejecutar(cuerpo)).rejects.toBeInstanceOf(InvitacionInvalidaError);
  });

  it('un token desconocido se rechaza sin crear nada', async () => {
    const { caso, identidades, miembros } = armar({ guardar: false });
    await expect(caso.ejecutar(cuerpo)).rejects.toBeInstanceOf(InvitacionInvalidaError);
    expect(identidades.creadas).toHaveLength(0);
    expect(miembros.altas).toHaveLength(0);
  });

  it('una identidad dada de baja, o un rol que ya no existe, se rechazan igual', async () => {
    await expect(
      armar({ identidades: new Identidades({ id: 'v', eliminada: true }) }).caso.ejecutar(cuerpo),
    ).rejects.toBeInstanceOf(InvitacionInvalidaError);
    await expect(
      armar({ miembros: new Miembros(null, 'rol_inexistente') }).caso.ejecutar(cuerpo),
    ).rejects.toBeInstanceOf(InvitacionInvalidaError);
  });
});
