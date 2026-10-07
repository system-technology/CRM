# ADR-0004 — Monolito modular, no microservicios

- **Estado:** Aceptado
- **Fecha:** 2026-10-06
- **Decide:** Propietario del producto
- **Consultados:** `arquitecto`, `devops`, `backend`

---

## Contexto

Hay que decidir la forma del sistema antes de escribir código, porque esta decisión es de las más
caras de revertir.

Las fuerzas reales, nombradas sin adorno:

- **El equipo es de 3 a 5 personas.** Los microservicios resuelven un problema **organizacional**:
  permitir que muchos equipos desplieguen sin coordinarse. Ese problema no existe aquí.
- **El dominio no está cerrado.** Las fronteras entre `quoting` y `booking` se moverán conforme
  aprendamos del negocio. Mover una frontera dentro de un proceso es una refactorización;
  entre servicios es una migración de datos con ventana de caída.
- **El perfil de carga no es uniforme.** El webhook de WhatsApp debe responder siempre en
  milisegundos; generar un PDF puede tardar segundos. Eso sí exige separación, pero por carga,
  no por dominio.
- **No hay equipo de plataforma.** Nadie va a operar una malla de servicios a las 3 de la mañana.

## Opciones consideradas

### A — Monolito modular (elegida)
Un código base, módulos con fronteras explícitas, desplegado como tres procesos según su perfil de
carga (`api`, `worker`, `web`), sobre una base de datos.

- **Gana:** una transacción abarca lo que tenga que abarcar; refactorizar una frontera es mover
  archivos; un despliegue; depurar es leer una traza, no correlacionar siete; costo de
  infraestructura mínimo.
- **Cuesta:** el escalado es del proceso entero, no de una parte; las fronteras se erosionan si no
  se vigilan; un fallo grave puede afectar a todo.
- **Cierra:** nada permanente — con las fronteras bien puestas, extraer un servicio después es
  trabajo acotado.

### B — Microservicios desde el inicio
Un servicio por contexto delimitado, comunicados por eventos.

- **Gana:** escalado independiente real; aislamiento de fallos; libertad tecnológica por servicio.
- **Cuesta:** transacciones distribuidas (sagas) desde el día uno, para un dominio que todavía no
  entendemos; siete repositorios y siete pipelines que mantener; depuración distribuida;
  infraestructura que un equipo de cuatro no puede operar; y lo peor: **cada movimiento de frontera
  se vuelve una migración entre servicios**, justo cuando más van a moverse.
- **Cierra:** la velocidad de aprendizaje, que es lo único que importa en esta etapa.

### C — Monolito sin modularidad
Un código base sin fronteras internas.

- **Gana:** máxima velocidad inicial.
- **Cuesta:** en dieciocho meses, todo depende de todo y extraer cualquier cosa es imposible.
- **Cierra:** el futuro.

## Decisión

**Opción A: monolito modular.** Tres procesos por perfil de carga, no por dominio.

La frase que resume el criterio: **los microservicios son una solución a un problema que todavía
no tenemos, y cuyo costo sí tendríamos desde el primer día.**

### Qué hace que sea "modular" y no solo un monolito

1. **Un módulo por contexto delimitado**, con cuatro capas:
   `domain/` (sin framework) → `application/` → `infrastructure/` + `interface/`.
2. **Ninguna importación directa entre módulos.** Verificado por el hook `PostToolUse` y por una
   regla de ESLint.
3. **Comunicación por eventos de dominio** (patrón outbox) o por **puertos explícitos** declarados
   en el módulo consumidor.
4. **Cada módulo posee sus tablas.** Nadie consulta las de otro, ni "solo para leer".
5. **Los eventos son contrato público y se versionan**, igual que una API.

Esos cinco puntos son lo que convierte "extraer un servicio" en un trabajo de días en vez de un
proyecto de meses. Sin ellos, esta decisión degenera en la opción C.

### Cuándo extraer un servicio

No por elegancia. Solo cuando se cumpla una de estas condiciones:

- Un módulo necesita escalar de forma radicalmente distinta al resto.
- Un módulo tiene requisitos de cumplimiento o residencia de datos propios.
- Hay equipos suficientes para que la coordinación del despliegue sea el cuello de botella real.

El primer candidato natural sería `inbox`: mayor volumen, requisito de latencia más duro y
frontera muy clara. Segundo candidato, la generación de PDFs del cotizador, por perfil de CPU.

## Consecuencias

### Positivas
- Transacciones locales: una cotización aceptada crea el archivo de viaje en una sola transacción.
- Refactorizar una frontera es mover archivos, no migrar datos.
- Un despliegue, una traza, un lugar donde mirar cuando algo falla.
- Infraestructura que un equipo de cuatro personas puede operar de verdad.

### Negativas
- **Las fronteras se erosionan.** Es la amenaza real de esta decisión, y es gradual: la primera
  importación cruzada "solo esta vez" se convierte en veinte. Mitigación: hook, regla de ESLint,
  y revisión en cada auditoría integral.
- Escalado grueso: si `inbox` necesita el triple de recursos, escala todo `api`.
- Un fallo en memoria puede tumbar el proceso completo. Mitigación: múltiples instancias,
  verificación de salud, despliegue progresivo.
- Una base de datos compartida es un punto único de fallo. Mitigación: réplica, respaldo continuo,
  recuperación a un punto en el tiempo probada cada trimestre.

### Qué habría que cambiar para revertir
Si las cinco reglas de modularidad se cumplen, extraer un módulo es: duplicar el despliegue,
reemplazar las llamadas a puertos por HTTP o cola, separar sus tablas. Semanas para el primero,
días para los siguientes. **Si no se cumplen, es una reescritura.** De ahí la insistencia.

## Cuándo revisar esta decisión

- Cuando haya más de dos equipos que se bloqueen entre sí al desplegar.
- Cuando un módulo necesite un perfil de escalado incompatible con el resto.
- Cuando una auditoría encuentre que las fronteras ya se erosionaron: ahí la decisión no se revisa,
  **se repara**, antes de que sea tarde.
