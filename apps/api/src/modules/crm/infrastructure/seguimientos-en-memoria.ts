/**
 * Doble en memoria de `PuertoSeguimientos`: el mismo comportamiento que `SeguimientosPrisma` sobre
 * la tabla `seguimientos` (varios por oportunidad, y sobre conversaciones). Sirve para las
 * pruebas del caso de uso y como contrato ejecutable del puerto. No se registra en ningún módulo.
 */
import type { Seguimiento } from '@viajapro/contracts';
import {
  type ConsultaDeSeguimientos,
  type NuevoSeguimiento,
  PuertoSeguimientos,
} from '../application/puerto-seguimientos.js';

export class SeguimientosEnMemoria extends PuertoSeguimientos {
  readonly filas = new Map<string, Seguimiento>();
  zona = 'America/Bogota';
  private secuencia = 0;

  crear(n: NuevoSeguimiento): Promise<Seguimiento> {
    this.secuencia += 1;
    const id = `00000000-0000-4000-8000-${String(this.secuencia).padStart(12, '0')}`;
    const s: Seguimiento = {
      id,
      descripcion: n.descripcion,
      venceEn: n.venceEn.toISOString(),
      completadoEn: null,
      asesorId: n.asesorId,
      asesorNombre: null,
      contactoId: n.destino.tipo === 'CONVERSACION' ? n.destino.contactoId : 'contacto-de-prueba',
      contactoNombre: null,
      oportunidadId: n.destino.tipo === 'OPORTUNIDAD' ? n.destino.oportunidadId : null,
      oportunidadTitulo: null,
      conversacionId: n.destino.tipo === 'CONVERSACION' ? n.destino.conversacionId : null,
    };
    this.filas.set(id, s);
    return Promise.resolve(s);
  }

  listar(c: ConsultaDeSeguimientos): Promise<Seguimiento[]> {
    const r = [...this.filas.values()]
      .filter((s) => c.asesorId === null || s.asesorId === c.asesorId)
      .filter((s) => c.oportunidadId === null || s.oportunidadId === c.oportunidadId)
      .filter((s) => c.conversacionId === null || s.conversacionId === c.conversacionId)
      .filter((s) =>
        c.estado === 'TODOS' ? true : (s.completadoEn === null) === (c.estado === 'PENDIENTE'),
      )
      .filter((s) => c.venceDesde === null || Date.parse(s.venceEn) >= c.venceDesde.getTime())
      .filter((s) => c.venceAntes === null || Date.parse(s.venceEn) < c.venceAntes.getTime())
      .sort((a, b) => Date.parse(a.venceEn) - Date.parse(b.venceEn))
      .slice(0, c.limite);
    return Promise.resolve(r);
  }

  buscar(id: string): Promise<Seguimiento | null> {
    return Promise.resolve(this.filas.get(id) ?? null);
  }

  completar(id: string, cuando: Date): Promise<Seguimiento | null> {
    const s = this.filas.get(id);
    if (!s) return Promise.resolve(null);
    const hecho = { ...s, completadoEn: cuando.toISOString() };
    this.filas.set(id, hecho);
    return Promise.resolve(hecho);
  }

  zonaHoraria(): Promise<string> {
    return Promise.resolve(this.zona);
  }
}
