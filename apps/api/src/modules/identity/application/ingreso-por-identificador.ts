/**
 * Iniciar sesión con correo o apodo (ADR-0031 §3 y §4).
 *
 * Reglas que este archivo hace cumplir, todas para que NADA distinga (por estado, cuerpo, camino de
 * código ni escrituras) un identificador inexistente, mal formado, de un usuario desactivado, de una
 * clave errónea o de una identidad con el tope agotado:
 *
 *   1. Con `@` es un correo; sin él, un apodo. Un apodo mal formado se sigue como uno inexistente.
 *   2. El apodo se traduce al correo en el servidor y NUNCA vuelve al cliente. Sin fila, se usa el
 *      correo centinela, de formato válido y de un dominio que no puede existir como identidad.
 *   3. SIEMPRE se llama a `/sign-in/email` de Better Auth (centinela incluido, y con el tope
 *      agotado): mismo hash, mismo cupo por IP, mismo camino. Con el tope agotado, el resultado se
 *      descarta y se responde `CREDENCIALES_INVALIDAS` también con la clave correcta.
 *   4. TODO intento fallido, el bloqueado también, hace exactamente las mismas escrituras en el
 *      contador (mismo INSERT, mismo barrido, mismo recuento).
 *   5. `429` (cupo por IP) y `403` (origen) salen igual que hoy, y dependen de la IP y del origen,
 *      nunca de si el identificador existe ni de si está bloqueado.
 *
 * Nada de aquí imprime el identificador, el apodo ni el centinela.
 */
import { Inject, Injectable } from '@nestjs/common';
import { DOMINIO_CENTINELA, esApodoValido, normalizarApodo } from '@viajapro/contracts';
import { PuertoApodos } from '../domain/puertos-de-apodos.js';
import { PuertoIdentidades } from '../domain/puertos-de-miembros.js';
import { errorDeAcceso } from './errores.js';
import { GuardiaDeApodos } from './guardia-de-apodos.js';
import { type SujetoDelTope, TopeDeFallosDeIngreso } from './tope-de-fallos-de-ingreso.js';

/** Correo de formato válido que nunca existe: `identidades` rechaza el dominio `.invalid` (CHECK). */
export const CORREO_CENTINELA = `x@${DOMINIO_CENTINELA}`;

export interface IdentificadorResuelto {
  /** El correo que se le da a Better Auth. No sale hacia el cliente. */
  correoParaBetterAuth: string;
  sujetoDelTope: SujetoDelTope;
}

/** Lo que Better Auth respondió, ya clasificado por quien lo llamó. */
export type ResultadoDeAutenticacion<T> =
  { tipo: 'abierta'; valor: T } | { tipo: 'rechazada' } | { tipo: 'limite' } | { tipo: 'origen' };

@Injectable()
export class IngresoPorIdentificador {
  constructor(
    @Inject(PuertoApodos) private readonly apodos: PuertoApodos,
    @Inject(PuertoIdentidades) private readonly identidades: PuertoIdentidades,
    @Inject(GuardiaDeApodos) private readonly guardia: GuardiaDeApodos,
    @Inject(TopeDeFallosDeIngreso) private readonly tope: TopeDeFallosDeIngreso,
  ) {}

  async resolver(identificador: string): Promise<IdentificadorResuelto> {
    const crudo = identificador.trim();

    if (crudo.includes('@')) {
      const correo = crudo.toLowerCase();
      const identidad = await this.identidades.buscarPorCorreo(correo);
      return {
        correoParaBetterAuth: correo,
        sujetoDelTope:
          identidad && !identidad.eliminada
            ? { tipo: 'identidad', valor: identidad.id }
            : { tipo: 'identificador', valor: correo },
      };
    }

    const apodo = normalizarApodo(crudo);
    const resuelto =
      esApodoValido(apodo) && !(await this.guardia.estaApagada())
        ? await this.apodos.resolverCorreo(apodo)
        : null;
    return resuelto
      ? {
          correoParaBetterAuth: resuelto.correo,
          sujetoDelTope: { tipo: 'identidad', valor: resuelto.identidadId },
        }
      : {
          correoParaBetterAuth: CORREO_CENTINELA,
          sujetoDelTope: { tipo: 'identificador', valor: apodo },
        };
  }

  /**
   * `autenticar` llama a Better Auth con el correo que se le da y clasifica su respuesta. Un fallo
   * inesperado (5xx) lo lanza el propio `autenticar`.
   */
  async ejecutar<T>(
    identificador: string,
    autenticar: (correo: string) => Promise<ResultadoDeAutenticacion<T>>,
  ): Promise<T> {
    const { correoParaBetterAuth, sujetoDelTope } = await this.resolver(identificador);
    const bloqueado = await this.tope.estaBloqueado(sujetoDelTope);

    // Bloqueado: mismo camino, con el centinela, y el resultado se descarta.
    const resultado = await autenticar(bloqueado ? CORREO_CENTINELA : correoParaBetterAuth);

    if (resultado.tipo === 'limite') throw errorDeAcceso('DEMASIADOS_INTENTOS');
    if (resultado.tipo === 'origen') throw errorDeAcceso('ORIGEN_NO_CONFIABLE');
    if (resultado.tipo === 'rechazada' || bloqueado) {
      await this.tope.registrarFallo(sujetoDelTope);
      throw errorDeAcceso('CREDENCIALES_INVALIDAS');
    }
    return resultado.valor;
  }
}
