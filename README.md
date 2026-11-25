# Recordatorios de citas · ClinicSay

API HTTP en Node 22, TypeScript y PostgreSQL que crea clínicas, pacientes y citas, programa un recordatorio por cita, lo envía a través del proveedor de mensajes y aplica las respuestas SI y NO del paciente.

| Archivo | Qué define |
|---|---|
| [`enunciado.pdf`](enunciado.pdf) | Las reglas de negocio y cómo se evalúa |
| [`openapi.yaml`](openapi.yaml) | El contrato HTTP |
| [`docs/architecture.md`](docs/architecture.md) | Cómo está construido: carpetas, tipos, casos de uso, modelo de datos, tests y plan de implementación |
| [`AGENTS.md`](AGENTS.md) | Las reglas del repo para personas y agentes |

## 1. Cómo levantarlo y cómo pasar los tests

Requisitos: Docker con Compose y Node 22 o superior.

```sh
docker compose up --build
```

Levanta la API en el puerto 3000 (con `CLOCK_MODE=test`, así que `PUT /test/clock` existe), PostgreSQL y el proveedor simulado en el 4010. El contenedor de la API corre `prisma migrate deploy` antes de arrancar, y `GET /health` responde 200 cuando una consulta a la base de datos funciona.

Para los tests:

```sh
npm ci
npx prisma generate   # genera el cliente de Prisma que necesita el typecheck
npm run check         # lint, typecheck y tests unitarios
npm run test:api      # tests de extremo a extremo por HTTP
```

| Comando | Qué hace |
|---|---|
| `npm run check` | `eslint .`, `tsc --noEmit` y `vitest run src` (las reglas que solo calculan: hora de envío, decisión de envío, texto, reintentos, respuestas) |
| `npm run test:api` | `scripts/test-api.sh`: levanta su propio stack con `docker compose` en un proyecto y unos puertos derivados de la ruta del worktree (no choca con el de `docker compose up`), corre `tests/api` y lo baja al terminar |
| `npx vitest run <ruta>` | Un solo archivo de tests |

Los tests de `tests/api` usan solo los endpoints públicos, `PUT /test/clock` y los endpoints `/admin/*` del proveedor. Corren de un archivo en uno porque el reloj del servicio es global.

CI (`.github/workflows/ci.yml`) corre en cada push a `main`: `npm ci`, `npx prisma generate`, `npm run check` y `npm run test:api`.

Variables de entorno de la API (`src/infra/config.ts`, validadas con Zod al arrancar):

| Variable | Por defecto |
|---|---|
| `DATABASE_URL` | obligatoria |
| `PROVIDER_URL` | obligatoria |
| `PORT` | 3000 |
| `CLOCK_MODE` | sin definir; `test` habilita `PUT /test/clock` |
| `QUIET_HOURS_FROM`, `QUIET_HOURS_UNTIL` | 21 y 9 (hora local de la clínica) |

## 2. Decisiones

El detalle está en [`docs/architecture.md`](docs/architecture.md); aquí va el resumen y el porqué.

### Arquitectura

Tres carpetas, una pregunta cada una:

| Carpeta | Qué contiene |
|---|---|
| `src/domain/` | Cómo son los datos. Solo tipos, un archivo por entidad, ninguna función. |
| `src/app/` | Toda la lógica, un caso de uso por archivo. Los que usan base de datos, proveedor o reloj son closures `makeX(deps)` con sus dependencias inyectadas (`createAppointment`, `runReminderPass`, …). Los que solo calculan son funciones puras sin dependencias (`planReminder`, `decideSend`, `reminderText`, `afterAttempt`, `parseReply`) y tienen tests unitarios por tablas. |
| `src/infra/` | Lo que toca el exterior: base de datos (Prisma y repositorios), cliente del proveedor, HTTP (Express y Zod), configuración, reloj y el cableado que inyecta las dependencias reales. |

Las reglas de negocio no saben de Express ni de Prisma: dependen de los contratos de `src/app/ports.ts`. Las rutas solo validan la entrada, llaman al caso de uso y traducen el resultado a HTTP.

### Tipado

- **Ids y valores con marca** (`ClinicId`, `AppointmentId`, `Phone`, `Timezone`): no se puede pasar el id de un paciente donde se espera el de una cita, y un `Phone` ya pasó la validación E.164. Las marcas solo se crean en `src/infra/http/schemas.ts` (entrada) y en los mappers de los repositorios (base de datos).
- **Uniones discriminadas**: un recordatorio `sent` siempre tiene `sentAt` y uno `skipped` siempre tiene `skipReason`; las combinaciones imposibles no compilan. La base de datos lo refuerza con dos `CHECK`.
- **`Result<T, E>`** para los errores esperados (cita no encontrada, cita cancelada…). `throw` queda para fallos de infraestructura, que el manejador de errores convierte en 500. El mapa de error a código HTTP está tipado para que un error nuevo no compile hasta tener su código.

### Cómo se evitan los envíos duplicados

- **El id del recordatorio es la `Idempotency-Key`** del proveedor, la misma en todos los intentos. Si se pierde la respuesta (504, error de red o más de 5 s), el reintento lleva la misma clave y el paciente recibe un solo mensaje.
- **Una llamada al proveedor por intento**, aunque corran varias pasadas a la vez. Antes de llamar, la pasada reserva el intento con un único `UPDATE` condicional: solo si el recordatorio sigue `pending` y con el número de intentos que leyó. De las pasadas que leyeron el mismo recordatorio, solo una actualiza la fila y envía. La reserva además mueve el siguiente intento un minuto adelante, así que una pasada que empiece durante la llamada no lo ve pendiente. La pasada no toma bloqueos de fila ni usa SQL a mano.
- **Un recordatorio pendiente por cita**, garantizado por un índice único parcial (`WHERE status = 'pending'`).
- **Operaciones simultáneas sobre una misma cita**: reprogramar, cancelar y el webhook toman un bloqueo de fila sobre la cita (`SELECT … FOR UPDATE`, la única línea de SQL a mano, porque Prisma no lo ofrece). Se ejecutan una tras otra y cada una decide sobre el estado que dejó la anterior: una reprogramación ya no revive una cita cancelada ni dos reprogramaciones simultáneas responden 500.
- **Webhooks repetidos**: los mensajes entrantes se guardan por `messageId`, en la misma transacción que los aplica; un aviso repetido se aplica una vez.

### Zonas horarias

Los instantes son UTC en todas partes: `Date` en el código y `timestamptz` en la base de datos. La zona de la clínica solo se usa en dos sitios: para calcular la hora del recordatorio (`planReminder`) y para escribir la fecha y la hora del texto (`reminderText`). "El día anterior a la misma hora local" es aritmética de calendario en la zona de la clínica con Luxon (`minus({ days: 1 })`), no restar 24 horas, así que los cambios de hora y Canarias salen bien; los casos del enunciado están en los tests unitarios.

### Decisiones donde el enunciado o el contrato dejaban margen

| Caso | Decisión |
|---|---|
| Un id que no es UUID | Responde el mismo 404 que una entidad que no existe |
| Reprogramar una cita cancelada o que ya empezó | 409, como dice `openapi.yaml` |
| Reprogramar a la misma hora | Devuelve la cita sin cambios, sin crear otro recordatorio |
| A qué cita se aplica una respuesta | A la que recibió el recordatorio enviado más reciente a ese teléfono, entre las no canceladas que no han empezado en el momento de procesar el webhook |
| SI después de un NO | Se ignora: la cita cancelada queda fuera de la búsqueda |
| Qué cuenta como SI o NO | Se quitan tildes, mayúsculas y lo que no sea letra o dígito en los extremos: `¡Sí!` cuenta, `Sí, gracias` se ignora |
| Respuesta del webhook | 200 con un cuerpo `{ "outcome": "applied" \| "duplicate" \| "ignored" }` que el contrato no define |
| Franja sin envíos | Configurable por entorno, de 21 a 9 por defecto |

### Qué descarté

- **Bloqueos de fila (`SELECT … FOR UPDATE SKIP LOCKED`) en la pasada**: la reserva condicional da la garantía que pide el enunciado con menos código.
- **Una cola o un proceso worker**: el enunciado lanza la pasada por HTTP.
- **Un paso de build**: TypeScript corre con `tsx`; `tsc` solo comprueba tipos.

## 3. Qué quedó fuera y qué haría con más tiempo

Límites conocidos:

- **Recordatorio en el instante de inicio.** Si una pasada llega a un recordatorio justo cuando la cita empieza mientras otra pasada lo está entregando, puede quedar `skipped` aunque el mensaje salió.
- **El proceso muere tras reservar un intento.** Ese intento cuenta; el recordatorio se reintenta un minuto después con la misma clave y el proveedor no lo duplica.
- **Timeout y error de red sin test automático.** Están implementados (5 s), pero el simulador no puede producirlos de forma determinista. El camino "puede que se haya entregado" se prueba con su 504.
- **Validación de zona horaria.** Acepta lo que acepta Luxon, incluidos nombres en minúsculas y nombres antiguos.
- **Sin autenticación, paginación ni rate limiting**: no están en el contrato.

Con más tiempo:

- Tests del timeout y del error de red contra un servidor falso.
- Logs estructurados y métricas.
- Un índice para la búsqueda de recordatorios enviados por teléfono, ordenados por `sent_at` (hoy solo hay índice sobre el teléfono del paciente).

## 4. Nota de producción

**Carga.** 500 clínicas y unos 20 000 recordatorios al día son menos de uno por segundo de media, pero con un pico a las 09:00 locales, cuando termina la franja sin envíos y salen los aplazados de la noche. La pasada debería tomar los recordatorios en lotes acotados en vez de todos los que tocan, y puede correr en varias instancias a la vez gracias a la reserva condicional.

**Disparo.** Un cron o un scheduler gestionado cada minuto en lugar del disparo por HTTP de los tests. El endpoint se queda para operaciones (forzar una pasada).

**WhatsApp real.**
- Plantillas aprobadas de antemano: un recordatorio fuera de la ventana de 24 h solo puede ir como plantilla, así que el texto pasa a ser una plantilla con variables.
- Límites de envío por número: respetarlos en la pasada y tratar el 429 como "no entregado, reintentar".
- Confirmaciones de entrega por webhook: aceptado no es entregado. Guardaría el estado de entrega aparte del `sent` actual.
- Bajas: un paciente que pide no recibir más mensajes pasa a `acceptsReminders = false`.
- Verificar la firma de los webhooks entrantes antes de aplicarlos.

**Despliegue.** Contenedores sin estado detrás de un balanceador; PostgreSQL gestionado con backups y restauración probada; las migraciones como paso del release, no al arrancar cada instancia; secretos fuera de la imagen (gestor de secretos del proveedor cloud); `CLOCK_MODE` nunca definido en producción.

**Monitorización.**
- Recordatorios que debían haber salido y siguen pendientes después de N minutos (alerta).
- Tasa de fallos por resultado: rechazados, no entregados, desconocidos (alerta).
- Latencia del proveedor, número de reintentos y errores del webhook.

## 5. Uso de IA

Usé Claude Code como pareja para el diseño, y Orca para lanzar por cada tarea un agente implementador y un revisor independiente, cada tarea en su propio worktree. Los tests los escribe otro agente que nunca lee la implementación: parte de la firma y de las reglas del enunciado.

Lo que corregí yo:

- El primer diseño separaba reglas puras en `domain` y "orquestación" en `app`. Lo cambié a `domain` = solo tipos y toda la lógica en `app`.
- Quité bloqueos y SQL a mano que sobraban para la tarea.
- Renombré funciones cuyo nombre engañaba.
- Lo hice seguir `openapi.yaml` donde había elegido otra cosa (409 al reprogramar una cita que ya empezó).
- Más tarde un test mostró que varias pasadas a la vez llamaban al proveedor más de una vez por intento, contra el enunciado. Elegí la reserva condicional en vez de bloqueos.
- Añadí una lista de code smells (sin ternarios, guard clauses, sin abstracciones de un solo uso), porque el código lo leen personas.

## Cómo se trabaja en este repo con agentes

| Pieza | Para qué |
|---|---|
| [`AGENTS.md`](AGENTS.md) (y `CLAUDE.md`, que lo importa) | Fuentes de verdad, estructura, reglas de código, comandos y commits |
| [`.claude/skills/implementation/`](.claude/skills/implementation/SKILL.md) | Cómo implementar un cambio: unidades pequeñas, cada una validada con `npm run check`, probada por `test-writer`, revisada contra [`code-smells.md`](.claude/skills/implementation/code-smells.md) y con su commit |
| [`.claude/skills/implement-task/`](.claude/skills/implement-task/SKILL.md) | Cómo un coordinador ejecuta el plan de `docs/architecture.md` con Orca: un implementador y un revisor por tarea, cada una en su worktree |
| [`.claude/agents/test-writer.md`](.claude/agents/test-writer.md) | El agente que escribe los tests a partir de la firma y de las reglas, sin leer la implementación |

Antes de cambiar código, lee `docs/architecture.md` entero. Si no cubre algo o contradice el enunciado, pregunta antes de decidir.
