'use client';

import { useState } from 'react';
import type { ConversacionResumen } from '@viajapro/contracts';
import { realtimeMockBus } from '../lib/realtime-mock';

interface SimuladorTiempoRealProps {
  conversaciones: ConversacionResumen[];
  conversacionAbiertaId?: string;
}

export function SimuladorTiempoReal({
  conversaciones,
  conversacionAbiertaId,
}: SimuladorTiempoRealProps) {
  const [desplegado, setDesplegado] = useState(false);
  const [autoActivo, setAutoActivo] = useState(realtimeMockBus.isAutoActivo());
  const [ultimoMensajeStatus, setUltimoMensajeStatus] = useState<string | null>(null);

  const notificar = (msg: string) => {
    setUltimoMensajeStatus(msg);
    setTimeout(() => setUltimoMensajeStatus(null), 4000);
  };

  const convObjetivo = conversacionAbiertaId
    ? conversaciones.find((c) => c.id === conversacionAbiertaId)
    : conversaciones[0];

  const handleEmitirMensajeNuevo = () => {
    const targetId = convObjetivo?.id || '00000000-0000-4000-8000-000000000001';
    const msg = realtimeMockBus.emitirMensajeNuevo(
      targetId,
      'Hola, ¿tienen disponibilidad de hotel frente a la playa para 4 personas?',
      'ENTRANTE',
    );
    notificar(
      `📩 Mensaje nuevo emitido para conv ${targetId.slice(-6)}: "${msg.texto?.slice(0, 30) || ''}..."`,
    );
  };

  const handleEmitirEstadoMensaje = (nuevoEstado: 'ENTREGADO' | 'FALLIDO') => {
    const targetId = convObjetivo?.id || '00000000-0000-4000-8000-000000000001';
    realtimeMockBus.emitirMensajeActualizado(
      targetId,
      'msg-ultimo',
      nuevoEstado,
      nuevoEstado === 'FALLIDO' ? 'Número de WhatsApp no registrado o sin saldo de Meta' : null,
    );
    notificar(`🔄 Estado de mensaje actualizado a ${nuevoEstado} para conv ${targetId.slice(-6)}`);
  };

  const handleEmitirConversacionActualizada = () => {
    if (!convObjetivo) return;
    const convModificada: ConversacionResumen = {
      ...convObjetivo,
      ultimoMensajeTexto: '📌 Actualización de estado: Pago de paquete verificado',
      ultimoMensajeEn: new Date().toISOString(),
      mensajesSinLeer: convObjetivo.mensajesSinLeer + 1,
    };
    realtimeMockBus.emitirConversacionActualizada(convModificada);
    notificar(
      `📌 Conversación ${convObjetivo.contactoNombre || convObjetivo.contactoTelefono} actualizada (reordenamiento guard por mouse)`,
    );
  };

  const handleEmitirEventoDesconocido = () => {
    const procesado = realtimeMockBus.emitirEventoDesconocido();
    if (!procesado) {
      notificar(
        '🛡️ Evento desconocido (CLIENTE_UBICACION_COMPARTIDA_V2) descartado en silencio por safeParse. Sin errores.',
      );
    }
  };

  const handleToggleAuto = () => {
    realtimeMockBus.toggleAutoSimulacion(conversaciones, (activo) => {
      setAutoActivo(activo);
      notificar(
        activo ? '⏱️ Auto-simulador activado (evento nuevo cada 8s)' : '🛑 Auto-simulador detenido',
      );
    });
  };

  return (
    <div className="fixed right-3 bottom-3 z-50 flex flex-col items-end font-sans text-xs">
      {ultimoMensajeStatus && (
        <div className="animate-in fade-in mb-2 max-w-xs rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 shadow-xl transition-all">
          {ultimoMensajeStatus}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900/95 shadow-2xl backdrop-blur-md">
        <button
          type="button"
          onClick={() => setDesplegado(!desplegado)}
          className="flex w-full items-center justify-between gap-2 px-3.5 py-2 font-medium text-slate-200 hover:bg-slate-800 focus:outline-none"
        >
          <span className="flex items-center gap-1.5 font-semibold text-emerald-400">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400"></span>
            Simulador Tiempo Real (EventoBandeja)
          </span>
          <span className="text-slate-400">{desplegado ? '▼' : '▲'}</span>
        </button>

        {desplegado && (
          <div className="flex flex-col gap-2 border-t border-slate-800 p-3 text-slate-300">
            <p className="text-[11px] text-slate-400">
              Dispara eventos simulados contra <code className="text-blue-300">EventoBandeja</code>{' '}
              con Zod <code className="text-blue-300">safeParse</code>.
            </p>

            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleEmitirMensajeNuevo}
                className="rounded border border-blue-800/60 bg-blue-950/60 px-2.5 py-1.5 text-left font-medium text-blue-200 hover:bg-blue-900/80 focus:ring-1 focus:ring-blue-500"
              >
                📩 Mensaje Nuevo (Entrante)
              </button>

              <button
                type="button"
                onClick={() => handleEmitirEstadoMensaje('ENTREGADO')}
                className="rounded border border-emerald-800/60 bg-emerald-950/60 px-2.5 py-1.5 text-left font-medium text-emerald-200 hover:bg-emerald-900/80 focus:ring-1 focus:ring-emerald-500"
              >
                ✅ Actualizar: ENTREGADO
              </button>

              <button
                type="button"
                onClick={handleEmitirConversacionActualizada}
                className="rounded border border-purple-800/60 bg-purple-950/60 px-2.5 py-1.5 text-left font-medium text-purple-200 hover:bg-purple-900/80 focus:ring-1 focus:ring-purple-500"
              >
                📌 Actualizar Conversación
              </button>

              <button
                type="button"
                onClick={handleEmitirEventoDesconocido}
                className="rounded border border-amber-800/60 bg-amber-950/60 px-2.5 py-1.5 text-left font-medium text-amber-200 hover:bg-amber-900/80 focus:ring-1 focus:ring-amber-500"
              >
                🛡️ Evento Desconocido (R-Safe)
              </button>
            </div>

            <div className="mt-1 flex items-center justify-between border-t border-slate-800 pt-2">
              <span className="text-slate-400">Tráfico continuo (8s):</span>
              <button
                type="button"
                onClick={handleToggleAuto}
                className={`rounded px-3 py-1 font-semibold transition-colors ${
                  autoActivo
                    ? 'bg-rose-600 text-white hover:bg-rose-500'
                    : 'bg-emerald-600 text-white hover:bg-emerald-500'
                }`}
              >
                {autoActivo ? '⏹ Detener Auto' : '▶ Iniciar Auto'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
