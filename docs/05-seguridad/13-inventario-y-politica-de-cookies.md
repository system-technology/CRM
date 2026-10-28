# Inventario de cookies, almacenamiento del navegador y política de cookies

| Campo | Valor |
|---|---|
| Fecha de vigencia | 2026-10-28 |
| Responsable | Seguridad y Privacidad ViajaPro (`auditor-seguridad`) |
| Marco normativo | Ley 1581 de 2012 (Habeas Data, Colombia), Decreto 1074 de 2015, Guía para el Tratamiento de Datos Personales en Cookies de la Superintendencia de Industria y Comercio (SIC), y Ley 300 de 1996 / Ley 2068 de 2020 (Turismo) |
| Estado del sistema | **Cumple**: cookies esenciales no piden consentimiento; banner flotante para elementos no esenciales con aceptación, rechazo granular y configuración accesible; política pública enlazada en el pie de la aplicación |

---

## 1. Alcance y Principios de Tratamiento

En **ViajaPro** (CRM multi-tenant para agencias de turismo), la privacidad y la protección de los datos de los asesores comerciales y agencias usuarias es un principio fundacional (R10, R6).

De conformidad con el régimen general de protección de datos personales de Colombia (Ley 1581 de 2012) y las directrices de la **Superintendencia de Industria y Comercio (SIC)**:
1. **Principio de Libertad y Consentimiento Previo:** Las tecnologías de almacenamiento local y cookies que no sean técnicamente estrictas para el funcionamiento del servicio no se instalan ni ejecutan sin el consentimiento previo, expreso e informado del usuario.
2. **Principio de Finalidad y Proporcionalidad:** Cada cookie y clave de `localStorage` tiene un propósito específico, documentado y proporcional a la prestación del servicio de CRM.
3. **No Recolección de Datos Sensibles de Viajeros en Cookies:** Las cookies y el almacenamiento local **nunca** almacenan datos personales sensibles (pasaportes, fechas de nacimiento, itinerarios o mensajes de WhatsApp).

---

## 2. Inventario Completo de Cookies y Almacenamiento Local

### 2.1. Tecnologías de `apps/api` (Backend)

| Nombre | Tipo | Proveedor | Finalidad | Duración | Categoría | Flags de Seguridad |
|---|---|---|---|---|---|---|
| `viajapro.session_token`<br>*(o `__Secure-viajapro.session_token` en HTTPS)* | Cookie | `viajapro.com` (1er origen) | Autenticación del asesor y validación de membresía en la agencia turística (Better Auth / ADR-0011). | 7 días (renovación móvil) | **Estrictamente necesaria** | `HttpOnly; Secure; SameSite=Lax` |
| `viajapro.csrf_token`<br>*(o `__Secure-viajapro.csrf_token`)* | Cookie | `viajapro.com` | Prevención de ataques Cross-Site Request Forgery (CSRF) en mutaciones REST y WebSocket. | Sesión de navegación | **Estrictamente necesaria** | `HttpOnly; Secure; SameSite=Lax` |

> [!NOTE]
> Conforme al criterio de la SIC y el RGPD, las cookies de sesión y de seguridad CSRF están exentas del requerimiento de consentimiento previo, dado que son imprescindibles para proveer el servicio expresamente solicitado por el usuario.

---

### 2.2. Tecnologías de `apps/web` (Frontend)

| Clave / Nombre | Tipo | Proveedor | Finalidad | Duración | Categoría | Comportamiento sin Consentimiento |
|---|---|---|---|---|---|---|
| `viajapro_consentimiento_cookies` | `localStorage` | `viajapro.com` | Registrar la decisión de consentimiento del usuario (versión, fecha UTC y categorías autorizadas) para demostrar cumplimiento legal (accountability). | 12 meses | **Estrictamente necesaria** | Activo (registra rechazo o aceptación). |
| `viajapro_tema` | `localStorage` | `viajapro.com` | Persistir la preferencia de ergonomía visual (modo claro u oscuro) para reducir fatiga visual en turnos operativos de 8 horas. | Persistente | **Preferencias** | No se persiste si el usuario rechaza preferencias (usa valor del sistema operativo). |
| `viajapro_modo_demo` | `localStorage` | `viajapro.com` | Recordar si el asesor activó el modo demostración comercial (con excursiones de prueba) o si consulta la API real de su agencia. | Persistente | **Preferencias** | No se persiste si el usuario rechaza preferencias (vuelve al valor por defecto seguro). |
| `_viajapro_telemetria_rendimiento` | `localStorage` | `viajapro.com` | Métricas agregadas y anónimas sobre tiempos de respuesta del cotizador y consultas de paquetes turísticos. | 30 días | **Analítica y Rendimiento** | **Completamente bloqueado** hasta que el usuario otorgue consentimiento explícito. |

---

## 3. Clasificación de Categorías

### A. Cookies Estrictamente Necesarias (Técnicas)
Son indispensables para navegar y utilizar las funciones seguras de ViajaPro. Sin ellas, no es posible iniciar sesión, mantener el aislamiento entre agencias (RLS / multi-tenant R1, R2) ni proteger la comunicación contra fraude o suplantación.
- **Consentimiento:** No requieren consentimiento previo.
- **Opción de desactivación:** No pueden ser desactivadas en los sistemas de ViajaPro. El usuario puede bloquearlas en la configuración de su navegador, pero la aplicación dejará de funcionar.

### B. Cookies de Preferencias y Ergonomía
Permiten que ViajaPro recuerde información que modifica el aspecto o comportamiento de la plataforma para adaptarse al ritmo de trabajo del asesor turístico (ej. tema visual oscuro/claro y modo demostración).
- **Consentimiento:** Opcional. Requieren consentimiento del usuario en el banner o modal.
- **Por defecto:** Inactivas hasta que el usuario las acepte o configure.

### C. Cookies de Analítica y Rendimiento
Permiten cuantificar de forma agregada el desempeño del sistema (ej. tiempo de carga del cotizador de excursiones de un día o de pasadías). No rastrean al usuario fuera de ViajaPro ni capturan números telefónicos ni contenido de conversaciones de WhatsApp.
- **Consentimiento:** Opcional.
- **Por defecto:** **Bloqueadas estrictamente** hasta que el usuario pulse «Aceptar todas» o las active en «Configurar cookies».

---

## 4. Mecanismo de Gestión y Revocación del Consentimiento

1. **Presentación Inicial:** Al ingresar por primera vez a ViajaPro, se despliega un banner accesible en la parte inferior de la pantalla con tres alternativas directas:
   - **«Aceptar todas»:** Activa las categorías necesarias, de preferencias y analítica.
   - **«Solo necesarias»:** Rechaza de inmediato todas las cookies no esenciales (preferencias y analítica) con un solo clic, sin obligar al usuario a abrir paneles complejos.
   - **«Configurar cookies»:** Despliega un modal accesible con switches independientes para cada categoría opcional.
2. **Reapertura y Revocación:** El usuario puede modificar o revocar su consentimiento en cualquier momento haciendo clic en el enlace permanente **«Preferencias de cookies»** ubicado en el pie de página de la aplicación.
3. **Vigencia de la Decisión:** El registro de consentimiento tiene una vigencia máxima de 12 meses, tras lo cual el banner volverá a solicitar confirmación de las preferencias.

---

## 5. Ejercicio de Derechos de Habeas Data

Para consultas sobre el tratamiento de datos o el ejercicio de los derechos de conocer, actualizar, rectificar y suprimir datos personales conforme a la Ley 1581 de 2012, el titular puede consultar nuestro documento de [Protección de datos personales](02-proteccion-de-datos.md) o comunicarse al canal de soporte oficial de ViajaPro.
