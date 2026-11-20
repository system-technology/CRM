import { describe, expect, it } from 'vitest';
import {
  archivoDeLaCotizacion,
  archivoVigenteDelContacto,
  conversacionDelContacto,
  cotizacionVigenteDelContacto,
  enlaceDeArchivo,
  enlaceDeContacto,
  enlaceDeConversacion,
  enlaceDeCotizacion,
  terminoDeBusquedaDelContacto,
} from './enlaces-viaje-logica';

const archivo = (
  id: string,
  numero: number,
  contactoId: string,
  cotizacionId: string,
  estado: 'ABIERTO' | 'CANCELADO',
  fechaSalida: string,
) => ({ id, numero, contactoId, cotizacionId, estado, fechaSalida });

describe('enlaces entre chat, cotización y file', () => {
  it('elige la conversación más reciente del contacto y descarta las de otros', () => {
    const lista = [
      { id: 'c1', contactoId: 'a', ultimoMensajeEn: '2026-11-20T10:00:00Z' },
      { id: 'c2', contactoId: 'b', ultimoMensajeEn: '2026-11-20T12:00:00Z' },
      { id: 'c3', contactoId: 'a', ultimoMensajeEn: '2026-11-20T11:00:00Z' },
    ];
    expect(conversacionDelContacto(lista, 'a')).toBe('c3');
    expect(conversacionDelContacto(lista, 'z')).toBeNull();
  });

  it('busca al contacto por teléfono y, sin él, por nombre', () => {
    expect(terminoDeBusquedaDelContacto({ telefono: ' +573001112233 ', nombre: 'Ana' })).toBe(
      '+573001112233',
    );
    expect(terminoDeBusquedaDelContacto({ telefono: '', nombre: 'Ana' })).toBe('Ana');
    expect(terminoDeBusquedaDelContacto({ telefono: null, nombre: null })).toBeNull();
  });

  it('encuentra el file de una cotización aunque esté cancelado', () => {
    const lista = [
      archivo('f1', 1043, 'a', 'q1', 'CANCELADO', '2026-12-01'),
      archivo('f2', 1044, 'b', 'q2', 'ABIERTO', '2026-12-05'),
    ];
    expect(archivoDeLaCotizacion(lista, 'q1')?.numero).toBe(1043);
    expect(archivoDeLaCotizacion(lista, 'q9')).toBeNull();
  });

  it('el file vigente del contacto es el abierto de salida más próxima', () => {
    const lista = [
      archivo('f1', 1, 'a', 'q1', 'CANCELADO', '2026-11-01'),
      archivo('f2', 2, 'a', 'q2', 'ABIERTO', '2027-03-01'),
      archivo('f3', 3, 'a', 'q3', 'ABIERTO', '2026-12-10'),
    ];
    expect(archivoVigenteDelContacto(lista, 'a')?.id).toBe('f3');
    expect(archivoVigenteDelContacto(lista, 'b')).toBeNull();
  });

  it('la cotización vigente es la última enviada', () => {
    const lista = [
      { id: 'q1', version: 1, enviadaEn: null },
      { id: 'q2', version: 2, enviadaEn: '2026-11-19T10:00:00Z' },
      { id: 'q3', version: 1, enviadaEn: '2026-11-18T10:00:00Z' },
    ];
    expect(cotizacionVigenteDelContacto(lista)?.id).toBe('q2');
    expect(cotizacionVigenteDelContacto([])).toBeNull();
  });

  it('arma los enlaces con las rutas de la app y dice qué falta en vez de ocultarlo', () => {
    expect(enlaceDeConversacion({ tipo: 'listo', valor: 'c9' }).href).toBe('/bandeja/c9');
    expect(enlaceDeConversacion({ tipo: 'listo', valor: null })).toMatchObject({
      href: null,
      sinDestino: 'Sin conversación en la bandeja',
    });
    expect(enlaceDeConversacion({ tipo: 'cargando' }).cargando).toBe(true);
    expect(enlaceDeContacto('k1', 'Ana Martínez')).toMatchObject({
      href: '/contactos/k1',
      texto: 'Contacto: Ana Martínez',
    });
    expect(enlaceDeCotizacion('q1', 2)).toMatchObject({
      href: '/cotizaciones/q1',
      texto: 'Cotización v2',
    });
    expect(enlaceDeArchivo({ tipo: 'listo', valor: { id: 'f1', numero: 1043 } })).toMatchObject({
      href: '/viajes?id=f1',
      texto: 'File 1043',
    });
    expect(enlaceDeArchivo({ tipo: 'listo', valor: null }).sinDestino).toBe(
      'Sin archivo de viaje todavía',
    );
  });
});
