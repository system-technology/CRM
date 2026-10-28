# Bitácora — 2026-10-28: Páginas públicas de privacidad, términos y cookies (T-108)

## Contexto y Objetivo
En el marco de la Fase 1 («Un CRM mostrable y endurecido») y en cumplimiento de la normativa colombiana de protección de datos personales (Ley 1581 de 2012, Decreto 1074 de 2015) y prevención de la Explotación Sexual Comercial de Niños, Niñas y Adolescentes (ESCNNA, Leyes 679 de 2001 y 1336 de 2009), la tarea **T-108** establece las páginas legales públicas de ViajaPro:
- `/privacidad`: Política de Tratamiento de la Información y Protección de Datos Personales.
- `/terminos`: Términos y Condiciones Generales de Uso del Software B2B para Agencias de Turismo.
- `/cookies`: Política de Cookies y Almacenamiento Local interactiva con inventario exhaustivo.

Dado que la aprobación formal de las políticas por el propietario corresponde a **T-093**, estas páginas se publican con una marca destacada y visible de «borrador en revisión jurídica» (`badge-borrador`), tal como estipula el criterio de aceptación.

## Qué se construyó

1. **Página pública `/privacidad` (`apps/web/src/app/privacidad/page.tsx`):**
   - Marco regulatorio colombiano explícito (Ley 1581 de 2012, Decreto 1074 de 2015, Circular SIC).
   - Roles de tratamiento: Agencia de Viajes cliente como *Responsable del Tratamiento* y ViajaPro como *Encargado del Tratamiento*.
   - Tratamiento de datos sensibles de viajeros (pasaportes, visas, fechas de nacimiento, R10) con cifrado en reposo AES-256-GCM y auditoría estricta de lecturas (R10).
   - Derechos de Habeas Data (conocer, actualizar, rectificar, suprimir y revocar) y canales de atención de PQRS (`privacidad@viajapro.com`).
   - Marca visible de borrador en revisión jurídica (`badge-borrador`).

2. **Página pública `/terminos` (`apps/web/src/app/terminos/page.tsx`):**
   - Condiciones de licenciamiento SaaS multi-tenant B2B exclusivo para agencias de turismo legalmente constituidas con RNT (Registro Nacional de Turismo) vigente.
   - Normas de uso del canal nativo WhatsApp Cloud API: cumplimiento de la ventana de 24 horas de Meta, plantillas autorizadas y prohibición estricta de SPAM o envíos masivos no consentidos.
   - Prevención obligatoria de ESCNNA bajo las Leyes 679/2001 y 1336/2009, con tolerancia cero y reporte inmediato a autoridades colombianas (Fiscalía / Policía Nacional / SIC).
   - Propiedad de los datos y aislamiento multi-tenant estricto mediante PostgreSQL Row Level Security (RLS R1, R2).
   - Marca visible de borrador (`badge-borrador`).

3. **Página pública `/cookies` (`apps/web/src/app/cookies/page.tsx`):**
   - Renderizado del inventario oficial completo desde `INVENTARIO_COOKIES` (`apps/web/src/lib/privacidad-cookies.ts`).
   - Tabla responsiva detallando: nombre técnico, categoría (`NECESARIAS`, `PREFERENCIAS`, `ANALITICA`), tipo y origen, duración y finalidad específica.
   - Botón interactivo de gestión de preferencias que dispara el evento global `EVENTO_ABRIR_MODAL_COOKIES`, permitiendo al visitante modificar o revocar consentimientos en cualquier momento.
   - Marca visible de borrador (`badge-borrador`).

4. **Integración en Componentes de Entrada y Pie de Página:**
   - `PieDePaginaPrivacidad` (`apps/web/src/components/privacidad/pie-de-pagina-privacidad.tsx`): Enlaces accesibles a `/privacidad`, `/terminos`, `/cookies` y botón de preferencias con touch targets `>= 44 px` respetando directrices WCAG 2.1 y responsive a 375 px.
   - `FormularioIngreso` (`apps/web/src/components/auth/formulario-ingreso.tsx`): Pie legal de acceso con enlaces a las tres políticas públicas para cumplir con el deber de información previa a la autenticación.
   - Actualización de `apps/web/src/app/politica-cookies/page.tsx` para sincronizar la marca `badge-borrador`.

5. **Pruebas y Verificación:**
   - `apps/web/src/app/privacidad/page.spec.tsx` (4 pruebas unitarias).
   - `apps/web/src/app/terminos/page.spec.tsx` (4 pruebas unitarias).
   - `apps/web/src/app/cookies/page.spec.tsx` (3 pruebas unitarias).
   - `apps/web/src/components/privacidad/pie-de-pagina-privacidad.spec.tsx` (3 pruebas unitarias).
   - Total `@viajapro/web`: 77 suites, 620 pruebas en verde.
   - Typecheck (9/9 paquetes), Linter (7/7 paquetes) y Next.js build (21 rutas estáticas/dinámicas) en verde.
   - Hooks de repositorio (`pnpm test:hooks`): 59/59 política de ramas, 19/19 detección de secretos, 6/6 fronteras de módulos.

## Decisiones y Límites
- Los textos son borradores juríico-técnicos acordes a `docs/05-seguridad/02-politica-privacidad-datos.md` y a los requerimientos normativos del turismo en Colombia. La aprobación definitiva se coordinará en T-093 sin bloquear el desarrollo.
- Se mantuvieron touch targets mínimos de 44x44 px (`min-h-[44px]`) y diseño 100% fluido a 375 px conforme a las directrices de accesibilidad y responsive design del proyecto.
