# Arquitectura

## Capas (Clean Architecture / Hexagonal)

```
controller/              → Interface Adapters (HTTP: controllers, guards, DTOs de entrada)
infrastructure/extern/    → Interface Adapters (adapters concretos: YCloud, Gemini, Qwen)
core/use-case/            → Application (casos de uso, orquestan los puertos)
core/domain/               → Domain (entidades + puertos/interfaces) — la capa más interna
```

## Regla de dependencia

Solo se puede depender **hacia adentro**:

```
infrastructure/extern  →  core/use-case  →  core/domain
controller              →  core/use-case  →  core/domain
```

`core/domain` no importa nada de `core/use-case`, `infrastructure` ni `controller`. `core/use-case` puede importar `core/domain` libremente, pero nunca `infrastructure` ni `controller`.

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

```
AppModule
├── WhatsappMessagesControllerModule
│   ├── AiModule
│   │   ├── GeminiModule   → exporta GEMINI_AI_PORT
│   │   └── QwenModule     → exporta QWEN_AI_PORT
│   │       (AiModule bindea AiPort → AiService, exporta AiPort)
│   └── WhatsAppModule     → exporta WhatsAppPort (adapter: WhatsAppService / YCloud)
```

## Base de datos

**No definida todavía.** El sistema hoy no persiste nada (ni conversaciones, ni mensajes, ni estado de usuarios) — cada mensaje entrante se procesa y se responde sin guardar historial.
