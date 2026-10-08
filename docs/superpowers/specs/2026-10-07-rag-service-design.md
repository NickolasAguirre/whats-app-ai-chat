# Diseño: Servicio RAG (microservicio) y su integración con el bot

**Fecha:** 2026-10-07
**Estado:** Pendiente de revisión

## Resumen

Hoy el bot manda a Qwen el historial reciente completo de cada conversación, y ese historial solo vive en Redis (6 horas, máximo 20 mensajes). Esto gasta tokens y pierde todo lo anterior.

Este diseño introduce un **servicio RAG** independiente: guarda datos estructurados y documentos, genera sus embeddings y los compara por similitud. El bot deja de mandar el historial completo. Para cada mensaje busca en el RAG solo los fragmentos relevantes (mensajes pasados de esa persona y conocimiento del negocio) y arma con eso un contexto mucho más chico.

El servicio RAG es un producto aparte, que podría venderse sin el bot. Por eso es un repo propio, con API pública y sin ningún concepto de WhatsApp.

## Objetivos

- Reducir de forma notable los tokens que se envían a Qwen en cada mensaje.
- Guardar de forma permanente todos los mensajes, con su embedding, para recuperarlos por significado.
- Permitir una base de conocimiento por tenant (FAQ, precios, políticas) consultable en el mismo flujo.
- Un servicio RAG genérico, reutilizable y con aislamiento fuerte entre clientes.
- Poder cambiar el proveedor de embeddings (Qwen hoy, un servicio local propio después) sin tocar el resto del sistema.
- Mantener la regla de dependencia de Clean Architecture en ambos proyectos: `core` solo conoce puertos.

## No-objetivos

- **Interfaz de carga de documentos en el bot.** El RAG tendrá el endpoint, pero el bot no lo expone. La primera carga se hace directo contra la API del RAG.
- **Panel de administración de tenants del RAG.** Los tenants y sus API keys se crean por un mecanismo interno (seed o comando), no por un panel.
- **Reranking, búsqueda híbrida (texto + vector) y resúmenes de conversación.** Son mejoras posibles, pero no forman parte de esta primera versión.
- **Streaming de respuestas, o cualquier cambio en el proveedor de IA conversacional.**
- **Facturación y métricas por tenant.** Siguen como diseño aparte.
- **gRPC y colas entre servicios.** El contrato público es REST. Queda como opción futura sin romper la API.

## Decisiones de diseño

| Decisión | Elección | Motivo |
|---|---|---|
| Ubicación | Repo nuevo e independiente (`rag-service`), NestJS | Poder venderlo aparte; reutiliza los patrones del bot |
| Contrato | REST con OpenAPI, header `X-API-Key` | Cualquier cliente lo consume, sea cual sea su lenguaje; fácil de depurar |
| Modelo de datos | Genérico: colecciones, ítems y metadata | No queda atado a WhatsApp |
| Aislamiento | Una API key pertenece a un tenant del RAG | El cliente no puede acceder a datos de otro por error |
| Fuente de verdad de mensajes | Solo el servicio RAG | Una sola copia, sin desincronización |
| Base de datos | PostgreSQL + pgvector (`pgvector/pgvector:pg18`, v0.8.7) | Verificado que la imagen existe |
| Acceso a vectores | Prisma para lo relacional, SQL crudo para `vector` | Prisma no soporta el tipo de forma nativa |
| Procesamiento diferido | BullMQ sobre Redis | Redis ya está en el stack |

## Parte 1: el servicio RAG (`rag-service`)

### Entidades

- **Tenant:** cliente del RAG. Tiene una o más API keys, guardadas solo como hash.
- **Collection:** pertenece a un tenant, con un nombre único dentro del tenant. Guarda el `embeddingModel` y la `dimension` con los que se creó. Ambos son inmutables.
- **Item:** pertenece a una colección. Campos: `text`, `metadata` (JSON), `embedding` (vector, nulo hasta que se procese), `status` (`pending`, `ready`, `failed`), `createdAt`, y opcionalmente `documentId` y `chunkIndex`.
- **Document:** el archivo original de una colección, con su estado de procesamiento. Se trocea en varios `Item`.

Los mensajes del bot son `Item` de una colección `conversations`, con metadata `{ personId, role, timestamp }`. El conocimiento del negocio son `Document` de una colección `knowledge`.

### API REST

Todos los endpoints exigen `X-API-Key`. El tenant se deduce de la key y ninguna consulta puede salir de él.

| Endpoint | Función |
|---|---|
| `POST /collections` | Crea una colección (`name`, `embeddingModel`) |
| `GET /collections` | Lista las colecciones del tenant |
| `POST /collections/:c/items` | Agrega uno o varios ítems `{ text, metadata }`. Responde `202`: se guardan en estado `pending` y el embedding se genera en segundo plano |
| `POST /collections/:c/documents` | Sube un documento; se trocea y se indexa en segundo plano |
| `POST /collections/:c/search` | `{ query, topK, filter }` devuelve `[{ id, text, metadata, score }]` |
| `GET /collections/:c/items/:id` y `DELETE` sobre ítems y documentos | Consulta y borrado |
| `DELETE /collections/:c/items?filter=...` | Borrado por metadata (por ejemplo, todo lo de un `personId`) |

La búsqueda solo considera ítems en estado `ready`. `filter` compara igualdad exacta sobre campos de la metadata.

### Embeddings

- `EmbeddingPort` interno con `embed(texts: string[]): Promise<number[][]>`.
- Adapter inicial para Qwen, con el modelo configurable por variable de entorno.
- Después, un adapter hacia el servicio local de embeddings del usuario. Cambiar de adapter no debe tocar el dominio.
- La dimensión se fija por colección. Cambiar de modelo implica una colección nueva y reindexar.

### Procesamiento asincrónico

Cola con BullMQ sobre Redis, con reintentos con espera creciente. Un ítem que agota los reintentos pasa a `failed` y queda registrado. Un ítem recién agregado puede tardar unos segundos en ser buscable, lo cual es aceptable para historial y documentos.

### Estructura (misma convención que el bot)

`core/domain` (entidades y puertos), `core/use-case`, `controller`, `infrastructure/persistence` (Prisma + SQL de vectores), `infrastructure/extern` (embeddings), `infrastructure/queue`.

## Parte 2: el bot como cliente (este repo)

### Puerto y adapter

- `RagPort` en `core/domain/ports/rag-port/`:
  - `search(tenantId, collection, query, options)` devuelve fragmentos con `text`, `metadata` y `score`.
  - `addItems(tenantId, collection, items)` guarda ítems.
- `RagHttpService` en `infrastructure/extern/rag/` (el proxy), con `RagModule`. Llama por REST a `RAG_BASE_URL`, una única variable de entorno.
- Cada tenant del bot tiene su API key del RAG. Se agrega `ragApiKeySecretRef` al modelo `Tenant` de Prisma, con migración. El adapter la resuelve con `SecretsPort`, como ya se hace con las credenciales de YCloud. El `tenantId` del bot nunca viaja al RAG.

### Cambios en `handleIncomingMessage`

1. Lee de Redis los últimos 2 o 3 mensajes, solo para mantener el hilo inmediato.
2. Busca en el RAG, en paralelo: los `topK` mensajes más parecidos de la colección `conversations` filtrados por `personId`, y los `topK` fragmentos más parecidos de la colección `knowledge`.
3. Arma el contexto para la IA: instrucciones del tenant, conocimiento relevante, historial relevante y mensajes recientes. `AiGenerateOptions` incorpora un campo para el conocimiento recuperado, además de `history`.
4. Responde por WhatsApp.
5. Después de responder, guarda el mensaje entrante y la respuesta con `addItems`. No bloquea la respuesta.

Redis sigue guardando el historial corto. Las `Instructions` siguen en la base del bot.

### Manejo de fallos

- La búsqueda en el RAG tiene un timeout corto. Si falla o expira, el bot responde solo con las instrucciones y los mensajes recientes de Redis, y deja una advertencia en el log.
- Si falla `addItems`, se registra y no se aborta la respuesta. Mientras el RAG esté caído, esos mensajes no se indexan. Es un riesgo aceptado al tener una sola fuente de verdad.

## Pruebas

- **`rag-service`:** unit tests con mocks para troceado, validación y casos de uso. La búsqueda por similitud y el filtro por metadata se prueban contra un Postgres real con pgvector, levantado con docker-compose de test: un mock no demuestra que el SQL de `vector` funcione.
- **Bot:** `RagHttpService` con `HttpService` mockeado. El use-case con `RagPort` mockeado, incluyendo RAG caído y respuestas lentas.
- **Contrato:** un test comprueba que lo que el adapter manda y espera coincide con la especificación OpenAPI del RAG.

## Despliegue

- Dos docker-compose independientes. El del RAG trae su Postgres con pgvector, su Redis para la cola y la API. El del bot solo suma `RAG_BASE_URL`.
- En local, ambos comparten una red de Docker externa.
- Reemplazar Qwen por el servicio local de embeddings es cambiar de adapter con una variable de entorno.

## Fases de construcción

1. **RAG base:** repo, esquema, API keys por tenant, `EmbeddingPort` con Qwen, `POST /items` y `search` con cola.
2. **Cliente en el bot:** `RagPort`, adapter, migración de `ragApiKeySecretRef` y cambios del use-case. Aquí ya baja el gasto de tokens.
3. **Documentos en el RAG:** subida de archivos, parsers (PDF, texto) y troceado.
4. **Endurecimiento:** reintentos finos, métricas, borrado de datos de una persona y reindexado al cambiar de modelo.

Las fases 1 y 2 se validan de punta a punta con mensajes reales antes de empezar la 3. Cada fase tiene su propio plan de implementación.

## Riesgos

- La calidad de la búsqueda depende del modelo de embeddings, y un servicio local puede rendir distinto a Qwen. Se recomienda un conjunto chico de consultas de referencia para compararlos.
- Un mensaje corto como "sí" o "ok" tiene poco significado por sí solo. Por eso se mantienen los últimos 2 o 3 mensajes de Redis y no se confía solo en la búsqueda.
- Como el embedding de un ítem nuevo es asincrónico, un mensaje muy reciente puede no ser buscable todavía. Los mensajes recientes de Redis cubren ese hueco.
- Con una sola fuente de verdad, una caída prolongada del RAG pierde esos mensajes. Si la persistencia se vuelve crítica, se puede sumar una copia en la base del bot como mejora posterior.

## Preguntas abiertas

- Valores iniciales de `topK` para `conversations` y `knowledge`, y el umbral mínimo de `score`. Se ajustan con pruebas reales.
- Tamaño y solapamiento de los fragmentos al trocear documentos (fase 3).
- Nombre del repo y del modelo de embeddings de Qwen que se usará en las primeras pruebas.
