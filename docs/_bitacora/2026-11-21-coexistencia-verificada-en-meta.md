# 2026-11-21 — Coexistencia de WhatsApp Business verificada en Meta (T-337, T-338, T-279)

Sesión de investigación y documentación, sin código. La sesión del 2026-11-20 no llegaba a
`developers.facebook.com`; esta sí (lectura directa de unas 20 páginas de Meta).

- **Verificado en Meta:** coexistencia oficial desde 2025-02; Colombia nunca estuvo excluida (blog
  2025-03-19 y changelog); requisitos (Tech Provider o Solution Partner, app 2.24.17 o superior,
  Embedded Signup v4 con `featureType: whatsapp_business_app_onboarding`, v5 activada por defecto;
  v2/v3 deprecadas el 2026-10-15); desconexión tras **~14 días** sin abrir la app; 20 msg/s; ecos
  `smb_message_echoes`; historial de 180 días pedido una sola vez en 24 h; **las etiquetas no se
  sincronizan**; **no hay forma documentada de excluir chats**; contactos que pueden llegar sin
  teléfono (BSUID); 1.000 mensajes de servicio gratis por número y mes (sube la fila 1b de
  `04-integraciones` de [S] a [V]); App Review ~24 h de media.
- **Nuevo y útil para JD Tours:** Meta rechaza números usados para difusiones de negocio, con Meta
  Business Agent o con «Auto lists» activos, y aplica un umbral de actividad que no publica. Hay que
  preguntárselo al dueño antes de la prueba.
- **Sin verificar:** cifras COP de la tarjeta de tarifas (CSV/PDF que la herramienta no lee),
  duración de la verificación del negocio, umbral de actividad, y la elegibilidad real del número
  (exige T-080).
- **Documentos:** investigación actualizada con marcas «Cambió»; fila de `04-integraciones`
  corregida; borrador **ADR-0033 (Propuesto)** con opciones A (todo), B (coexistencia con lista de
  exclusión antes de persistir), C (número separado) y D (migración, descartada), y la vuelta de
  `auditor-seguridad`.
- **Cola:** T-337 sigue `blocked` (primer criterio cumplido, falta la prueba con el número real);
  T-338 en `review` esperando la decisión del propietario; T-279 con avance anotado, sigue abierta.
- **Lo decide el propietario:** opción del ADR-0033, si se pide el historial, y quién habla con JD
  Tours del aviso de privacidad.
