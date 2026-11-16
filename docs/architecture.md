# Arquitectura

## Capas (Clean Architecture / Hexagonal)

```
controller/                → Interface Adapters (HTTP: controllers, decorators, DTOs de entrada)
infrastructure/extern/      → Interface Adapters (adapters concretos: YCloud, Gemini, Qwen, Rag-API, JWT)
infrastructure/persistence/ → Interface Adapters (repositorios, schemas, migraciones, Redis)
infrastructure/modules/     → Composición: TODOS los `*.module.ts` (DI de Nest), por feature
core/application/           → Application (casos de uso, orquestan los puertos)
core/domain/                → Domain (entidades + puertos/interfaces) — la capa más interna
```

Regla de ubicación: ningún `*.module.ts` vive fuera de `infrastructure/modules/` (salvo `app.module.ts`). Los módulos solo cablean; el código real (services, repositorios, guards) queda en `extern/` o `persistence/`.

## Regla de dependencia

Solo se puede depender **hacia adentro**:

```
infrastructure/extern  →  core/application  →  core/domain
controller              →  core/application  →  core/domain
```

`core/domain` no importa nada de `core/application`, `infrastructure` ni `controller`. `core/application` puede importar `core/domain` libremente, pero nunca `infrastructure` ni `controller`. `infrastructure/modules` es la capa de composición y puede importar de todas las demás.

Esta regla ya se violó y se corrigió dos veces en este proyecto: una vez con un DTO de envío que vivía en `use-case` pero lo importaba un puerto de `domain`, y otra con el payload crudo del webhook de YCloud que casi terminaba tipando un parámetro del use-case. Es el error más fácil de cometer al agregar un DTO nuevo sin pensar primero en qué capa vive el concepto que representa.

## Puertos y adapters

Cada integración externa (WhatsApp, un proveedor de IA) se expone a `core` como una interfaz declarada en `core/domain/ports/`. La implementación real vive en `infrastructure/extern/` y se bindea a esa interfaz vía el contenedor de DI de NestJS (`useExisting`) — `core` nunca importa la clase concreta.

Los puertos son `abstract class`, no `interface` de TypeScript: una interfaz se borra al compilar (no existe en runtime), y el contenedor de DI de Nest necesita un valor real en runtime como token de búsqueda. Una `abstract class` sí sobrevive a la compilación, así que sirve como tipo *y* como token de inyección al mismo tiempo. Ver `conventions.md` para el detalle del patrón.

Puertos actuales:

| Puerto | Ubicación | Implementado por |
|---|---|---|
| `AiPort` | `core/domain/ports/ai-port/ai.port.ts` | `AiService` (selector, ver abajo) |
| `WhatsAppPort` | `core/domain/ports/whats-app-port/whats-app.port.ts` | `WhatsAppService` (adapter de YCloud) |

## Selector de proveedor de IA

`AiPort` no lo implementa un adapter de un solo proveedor — lo implementa `AiService` (`infrastructure/extern/ai/ai.service.ts`), que actúa como **selector/strategy**: sostiene una referencia a cada proveedor concreto (`GeminiService`, `QwenService`), ambos implementando un segundo puerto interno, `AiSelectedPort` (`infrastructure/extern/ai/ports/ai-selected.port.ts`), y decide en runtime cuál usar.

`AiSelectedPort` vive en `infrastructure`, no en `core/domain` — es un detalle de cómo se organiza *internamente* la infraestructura de IA. `core` nunca lo ve, solo conoce `AiPort`.

Cada proveedor concreto tiene su **propio token de inyección** (`GEMINI_AI_PORT`, `QWEN_AI_PORT`, strings exportados desde cada módulo) porque `AiService` necesita sostener las dos instancias simultáneamente — pedir dos veces el mismo token (`AiSelectedPort`) solo daría una instancia, no dos distintas. Ver `conventions.md` para el patrón completo de cómo agregar un proveedor nuevo.

Hoy `AiService.getProvider()` devuelve siempre el proveedor de Qwen — no hay lógica de selección real todavía (fallback, costo, tipo de mensaje, etc.).

## Mapa de módulos actual

Todos en `src/infrastructure/modules/<feature>/`:

```
AppModule
├── DatabaseModule, RedisModule, AuthModule        (modules/persistence, modules/auth)
├── AdminModule                                    (modules/admin)
│   ├── InstructionsModule                         (modules/instructions)
│   └── RagModule                                  (modules/rag)
└── WhatsappMessagesControllerModule               (modules/whatsapp-message)
    ├── AiModule                                   (modules/ai)
    │   ├── GeminiModule   → exporta GEMINI_AI_PORT
    │   └── QwenModule     → exporta QWEN_AI_PORT
    │       (AiModule bindea AiPort → AiService, exporta AiPort)
    ├── WhatsAppModule     → exporta WhatsAppPort (modules/whats-app, adapter YCloud)
    ├── PersonRepositoryModule, InstructionsRepositoryModule,
    │   MessageHistoryRepositoryModule, MessageMemoryRepositoryModule   (modules/persistence)
    └── InstructionsModule, RagModule
```

`JwtAuth` (verificador de tokens de container-api) vive en `infrastructure/extern/auth/jwt-auth/`.

## Base de datos

PostgreSQL vía TypeORM (personas, instrucciones, historial `Message`) y Redis (contexto reciente de mensajes). Esquemas en `infrastructure/persistence/schemas/`, migraciones en `infrastructure/persistence/migrations/`.
