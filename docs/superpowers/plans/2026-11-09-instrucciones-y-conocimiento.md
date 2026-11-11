# Instrucciones del bot y base de conocimiento — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar el panel, el bot y Rag-API para editar las instrucciones del bot y subir conocimiento (archivos y notas) que el bot usa al responder.

**Architecture:** Rag-API gana documentos (subida, extracción de texto asíncrona, fragmentos, embeddings) y pierde los tenants; el bot expone `/admin/*` como BFF hacia Rag-API y busca conocimiento antes de responder; el panel cambia dos adapters mock por adapters HTTP. Todo por puertos y adapters, sin tocar la regla de dependencias del dominio.

**Tech Stack:** NestJS 12 (ESM), TypeORM `EntitySchema`, BullMQ, Qwen (`qwen-vl-ocr` vía API compatible con OpenAI), Angular 22 (signals, Vitest).

**Spec:** `docs/superpowers/specs/2026-11-09-instrucciones-y-conocimiento-design.md` (en este repo).

## Global Constraints

- Orden de trabajo del usuario: **primero todo el desarrollo (solo `pnpm build` / `ng build` para comprobar que compila) y los tests al final** (fase 4). Las tareas 1–8 no escriben ni corren tests.
- No hacer commits ni push: el usuario los pide cuando quiera.
- Clean Architecture: `core/domain` no importa TypeORM, Qwen, Redis, multer ni librerías de lectura de archivos.
- Sin decoradores de ORM en clases de dominio; persistencia con `EntitySchema` en `infrastructure/persistence/` (sin carpeta ni sufijo `typeorm`).
- Multi-tenant por infraestructura: ningún `tenantId` en el código.
- Límites: 10 MB por archivo (`10 * 1024 * 1024`), 20 documentos por colección, PDF respaldado con OCR hasta 20 páginas, instrucciones 1–8000 caracteres.
- Búsqueda al responder: `KNOWLEDGE_TOP_K=4`, `KNOWLEDGE_MIN_SCORE=0.35` (por entorno). Fragmentos de ~1000 caracteres con solape ~150. Calidad mínima de PDF: `MIN_USEFUL_CHARS_PER_PAGE = 50` (valor mío, ajustable).
- Textos de error y UI en español; código en inglés en el panel y con la convención actual en bot y Rag-API.
- Variables nuevas: bot `RAG_API_URL, RAG_API_KEY, RAG_COLLECTION=knowledge, CORS_ORIGINS, KNOWLEDGE_TOP_K, KNOWLEDGE_MIN_SCORE`; Rag-API `RAG_API_KEY, OCR_MODEL=qwen-vl-ocr, UPLOAD_DIR`.
- Rutas de Rag-API: `/collections` (plural). Auth: header `X-API-Key` igual a `RAG_API_KEY`.

## Review Focus

- Archivo corrupto o con extensión falsa (PDF/Excel que no se puede abrir): el documento queda `failed` con mensaje en español, nunca atascado en `processing` ni un 500.
- Nombre de archivo con tildes/ñ (`catálogo.pdf`): el título se guarda bien (multer decodifica como latin1 por defecto).
- Borrar un documento mientras sus fragmentos siguen en la cola: el worker no falla ni deja fragmentos huérfanos.
- Rag-API caído o lento cuando el cliente escribe por WhatsApp: el bot igual responde, sin conocimiento.
- Dos `PUT /admin/instructions` simultáneos: queda exactamente una fila.

---

## Fase 1 — Rag-API (`Rag-API/`)

### Task 1: Quitar tenants de Rag-API

**Files:**
- Delete: `src/core/domain/ports/tenant-access-port/`, `src/core/domain/api-key.ts` (+spec), `src/core/service/tenant/`, `src/cli/create-tenant.ts`, `src/controller/decorators/tenant-id.decorator.ts`, `src/infrastructure/persistence/{tenant-access.module.ts,repositories/tenant-access.repository.ts,repositories/tenant-access.repository.int-spec.ts,schemas/tenant.schema.ts,schemas/api-key.schema.ts}`
- Modify: `collection.entity.ts` (sin `tenantId`), `collection.schema.ts` (único por `name`, sin relación), `schemas/index.ts`, `database.options.ts`, `migrations/1730000000000-init-schema.ts` (reescribir: sin `Tenant`/`ApiKey`, `Collection.name` único), `collection.repository.ts`, `collection.port.ts`, `collection.service.ts`, `item.service.ts`, `api-key.guard.ts`, los 3 controllers, `rag-api.module.ts`, `package.json` (script `tenant:create`), `.env.example`, `test/rag-api.e2e-spec.ts`, `test/helpers/{db,fixtures}.ts`
- Modify: `src/controller/collections.controller.ts` — `@Controller('collections')`

**Interfaces:**
- Produces: `CollectionRepositoryPort { create(data: NewCollection): Promise<Collection>; list(): Promise<Collection[]>; findByName(name: string): Promise<Collection | null> }`; `CollectionService { create(name: string); list() }`; `ItemService { add(collection: string, items: NewItem[]); get(collection: string, itemId: string); search(collection: string, request: SearchRequest) }`; `ApiKeyGuard` (`constructor(config: ConfigService)`, compara `x-api-key` con `RAG_API_KEY` usando `timingSafeEqual`, 401 si falta o no coincide).

- [ ] **Step 1:** Aplicar las firmas anteriores y eliminar los archivos listados; `DatabaseModule` y `TypeOrmModule.forFeature` siguen igual con las entidades restantes.
- [ ] **Step 2:** Reescribir la migración inicial sin tenants (las bases se recrean) y actualizar `truncateAll`/`createTenantAndCollection` → `createCollection(dataSource, options)` para no romper `build`.
- [ ] **Step 3:** `pnpm build` — esperado: compila sin errores.

### Task 2: Dominio y persistencia de documentos

**Files:**
- Create: `src/core/domain/entities/document.entity.ts`, `src/core/domain/ports/document-port/document.port.ts`, `src/infrastructure/persistence/schemas/document.schema.ts`, `src/infrastructure/persistence/repositories/document.repository.ts`, `src/infrastructure/persistence/document-repository.module.ts`
- Modify: `item.entity.ts`, `item.schema.ts` (+`documentId` uuid nullable, FK `FK_Item_documentId`, índice), `item.port.ts`, `item.repository.ts`, `schemas/index.ts`, `database.options.ts`, migración inicial (tabla `Document` + enum `DocumentKind`/`DocumentStatus`), `src/core/domain/errors.ts`, `controller/filters/domain-error.filter.ts`

**Interfaces:**
- Produces: `type DocumentKind = 'pdf'|'spreadsheet'|'image'|'text'|'note'`; `type DocumentStatus = 'processing'|'ready'|'failed'`; `class Document { id; collectionId; title; kind: DocumentKind; sizeBytes?: number; content?: string; status: DocumentStatus; failureReason?: string; createdAt: Date }`.
- `DocumentRepositoryPort { create(collectionId: string, data: NewDocument): Promise<Document>; findById(collectionId: string, id: string): Promise<Document | null>; findByIdInternal(id: string): Promise<Document | null>; list(collectionId: string): Promise<Document[]>; count(collectionId: string): Promise<number>; updateNote(id: string, data: { title: string; content: string }): Promise<Document>; markExtracted(id: string): Promise<void>; markFailed(id: string, reason: string): Promise<void>; refreshStatus(id: string): Promise<void>; remove(id: string): Promise<void> }` — `refreshStatus` pasa a `failed` si algún fragmento falló, a `ready` solo si ya se marcó extraído y no quedan `pending`; si no, no cambia.
- `ItemRepositoryPort` gana `createPending(collectionId, items, documentId?)`, `deleteByDocument(documentId: string): Promise<void>`, `countByStatus(documentId: string): Promise<Record<ItemStatus, number>>`, `documentIdOf(itemId: string): Promise<string | null>`.
- Errores (`DomainError`) con su código en el filtro: `UnsupportedFileTypeError` 400, `EmptyFileError` 400, `FileTooLargeError` 413, `DocumentLimitReachedError` 409, `DocumentNotFoundError` 404 — todos con mensaje en español.

- [ ] **Step 1:** Crear entidad, puerto, schema (columnas `markExtracted` interna: `extracted boolean default false`), repositorio y módulo; `remove` borra los fragmentos y el documento en una transacción.
- [ ] **Step 2:** `ProcessItemEmbeddingService` llama a `documents.refreshStatus(documentId)` (usando `documentIdOf`) tras `markReady` y tras `fail`, sin fallar si el ítem ya no existe.
- [ ] **Step 3:** `pnpm build` — esperado: compila.

### Task 3: Fragmentado, almacenamiento temporal y extractores

**Files:**
- Create: `src/core/domain/chunking.ts` (+ constantes), `src/core/domain/document-quality.ts`, `src/core/domain/ports/{file-storage-port/file-storage.port.ts,text-extractor-port/text-extractor.port.ts,ocr-port/ocr.port.ts,page-renderer-port/page-renderer.port.ts}`, `src/infrastructure/extern/storage/local-file-storage.ts`, `src/infrastructure/extern/extraction/{composite-text-extractor.ts,plain-text.extractor.ts,spreadsheet.extractor.ts,pdf.extractor.ts,image.extractor.ts,pdf-page-renderer.ts,extraction.module.ts}`, `src/infrastructure/extern/ocr/qwen-ocr.service.ts` (+módulo)
- Modify: `package.json` (librerías: lectura de PDF, render de páginas, Excel/CSV, `@types/multer`)

**Interfaces:**
- Produces: `chunkSections(sections: string[], options?: { size: number; overlap: number }): string[]` (por defecto 1000/150; parte por párrafos, nunca une secciones, descarta vacíos).
- `hasEnoughText(sections: string[], pageCount: number): boolean` — verdadero si los caracteres no blancos por página ≥ `MIN_USEFUL_CHARS_PER_PAGE`.
- `FileStoragePort { save(id: string, bytes: Buffer): Promise<void>; read(id: string): Promise<Buffer>; delete(id: string): Promise<void> }` — adapter en `UPLOAD_DIR`.
- `TextExtractorPort.extract(input: { kind: DocumentKind; name: string; bytes: Buffer }): Promise<string[]>` — devuelve secciones (página, grupo de filas, texto completo). Hojas: cada fila como `Columna: valor | …` en grupos de filas con encabezados repetidos. Falla con `Error` en español si no se puede leer.
- `OcrPort.readImage(bytes: Buffer, mimeType: string): Promise<string>` — `qwen-vl-ocr` con `QWEN_API_KEY`, `QWEN_URL_BASE_OPEN_AI`, `OCR_MODEL`, imagen como data URL base64.
- `PageRendererPort.render(pdf: Buffer, maxPages: number): Promise<Buffer[]>` (PNG por página).
- PDF: texto de la capa de texto; si `!hasEnoughText` → render (≤ 20 páginas) + OCR por página; si sigue sin `hasEnoughText` → `Error('No se pudo leer el contenido del PDF con suficiente calidad')`.

- [ ] **Step 1:** Implementar `chunkSections`, `hasEnoughText` y los puertos.
- [ ] **Step 2:** Implementar adapters y `CompositeTextExtractor` (despacha por `kind`; `note` no pasa por aquí).
- [ ] **Step 3:** `pnpm build` — esperado: compila.

### Task 4: Servicio, cola y endpoints de documentos

**Files:**
- Create: `src/core/service/document/document.service.ts`, `src/core/service/process-document/process-document.service.ts`, `src/core/domain/ports/document-queue-port/document-queue.port.ts`, `src/infrastructure/queue/bull-document-queue.ts`, `src/controller/documents.controller.ts`, `src/controller/dto/{create-note.dto.ts}`
- Modify: `src/infrastructure/queue/embedding-queue.module.ts` (o módulo nuevo `document-queue.module.ts`), `rag-api.module.ts`

**Interfaces:**
- Produces: `DocumentService { uploadFile(collection: string, file: { name: string; size: number; bytes: Buffer }): Promise<Document>; createNote(collection: string, input: { title: string; content: string }): Promise<Document>; updateNote(collection: string, id: string, input: { title: string; content: string }): Promise<Document>; list(collection: string): Promise<Document[]>; get(collection: string, id: string): Promise<Document>; remove(collection: string, id: string): Promise<void> }`.
- Reglas de `uploadFile`: extensión → `kind` (`pdf`; `xlsx|xls|csv`→spreadsheet; `png|jpg|jpeg|webp`→image; `txt|md`→text) o `UnsupportedFileTypeError`; `size === 0` → `EmptyFileError`; `> 10 MB` → `FileTooLargeError`; `count >= 20` → `DocumentLimitReachedError`. Guarda en `FileStoragePort`, crea el documento `processing`, encola; si encolar falla, marca `failed`.
- `ProcessDocumentService { execute(documentId: string): Promise<void>; fail(documentId: string, reason: string): Promise<void> }`: lee archivo (o `content` si es nota), extrae, `chunkSections`, `items.createPending(collectionId, chunks, documentId)`, encola embeddings, `markExtracted`, `refreshStatus`; borra el archivo temporal al terminar o fallar. Si el documento ya no existe, retorna sin error. `updateNote` borra los fragmentos viejos y vuelve a encolar.
- `DocumentQueuePort { enqueue(documentId: string): Promise<void> }` — cola BullMQ `document-extraction`, 2 intentos, concurrencia 2; al agotar intentos llama `ProcessDocumentService.fail`.
- `DocumentsController` en `collections/:collection/documents`: `POST /` (`FileInterceptor('file')`, 202, decodificar `originalname` de latin1 a UTF-8), `POST /text` (202), `PUT /:id/text` (202), `GET /`, `GET /:id`, `DELETE /:id` (204). Respuesta: `{ id, kind, title, status, createdAt, sizeBytes?, content?, errorMessage? }` (`failureReason` se expone como `errorMessage`).

- [ ] **Step 1:** Implementar servicios, cola y controller con las firmas anteriores.
- [ ] **Step 2:** Registrar todo en `RagApiModule` y levantar con `pnpm start:dev` + Redis/Postgres de desarrollo; subir un `.txt` con `curl -F file=@x.txt` y ver que pasa a `ready`.
- [ ] **Step 3:** `pnpm build` — esperado: compila.

---

## Fase 2 — Bot (`whatsapp-chat-bot-API/`)

### Task 5: Instrucciones por defecto y endpoints

**Files:**
- Create: `src/core/domain/default-instructions.ts`, `src/core/use-case/instructions/instructions.service.ts`, `src/controller/admin-instructions.controller.ts`, `src/controller/dto/save-instructions.dto.ts`
- Modify: `instructions.port.ts`, `infrastructure/persistence/repositories/instructions.repository.ts`, `whats-app-message.service.ts` (usa `InstructionsService`), `main.ts` (`ValidationPipe` global, `enableCors` con `CORS_ORIGINS`), `package.json` (`class-validator`, `class-transformer`), `.env.example`

**Interfaces:**
- Produces: `DEFAULT_INSTRUCTIONS: string` — "Eres el asistente virtual de atención al cliente del negocio. Responde siempre en español, con un lenguaje claro y formal. Sé breve y preciso. Si no conoces la respuesta o la información no está disponible, indícalo con honestidad y ofrece derivar la consulta a una persona."
- `InstructionsRepositoryPort { get(): Promise<Instructions | null>; save(content: string): Promise<Instructions>; delete(): Promise<void> }` — `save` mantiene una sola fila aunque haya llamadas concurrentes.
- `InstructionsService { getEffective(): Promise<{ content: string; updatedAt: Date | null; isDefault: boolean }>; save(content: string): Promise<same>; reset(): Promise<void> }`.
- Endpoints: `GET /admin/instructions`, `PUT /admin/instructions` (`{ content }`, 1–8000 caracteres, 400 si no), `DELETE /admin/instructions` (204).

- [ ] **Step 1:** Implementar lo anterior y cambiar el caso de uso para pedir `getEffective().content`.
- [ ] **Step 2:** `pnpm build` — esperado: compila.

### Task 6: Adapter de conocimiento y endpoints `/admin/knowledge`

**Files:**
- Create: `src/core/domain/entities/knowledge-item.entity.ts`, `src/core/domain/ports/knowledge-port/knowledge.port.ts`, `src/infrastructure/extern/rag/knowledge/rag-knowledge.service.ts`, `src/infrastructure/extern/rag/knowledge/rag-collection.bootstrap.ts`, `src/controller/admin-knowledge.controller.ts`, `src/controller/dto/note.dto.ts`
- Modify: `rag.module.ts` (provee `KnowledgePort`, importa `HttpModule`), `app.module.ts`, `main.ts` si hace falta, `package.json` (`@types/multer`)
- Delete: `src/infrastructure/extern/rag/collention/`, `src/infrastructure/extern/rag/item/` (vacíos, con sus specs)

**Interfaces:**
- Produces: `class KnowledgeItem { id; kind: 'pdf'|'spreadsheet'|'image'|'text'|'note'; title; status: 'processing'|'ready'|'failed'; createdAt: Date; sizeBytes?; content?; errorMessage? }`.
- `KnowledgePort { list(): Promise<KnowledgeItem[]>; uploadFile(file: { name: string; mimeType: string; bytes: Buffer }): Promise<KnowledgeItem>; createNote(input: { title: string; content: string }): Promise<KnowledgeItem>; updateNote(id: string, input: { title: string; content: string }): Promise<KnowledgeItem>; remove(id: string): Promise<void>; search(query: string): Promise<string[]> }`.
- Adapter: llama a Rag-API con `X-API-Key: RAG_API_KEY` sobre `RAG_COLLECTION`; `search` pide `topK = KNOWLEDGE_TOP_K` y devuelve los `text` con `score >= KNOWLEDGE_MIN_SCORE`; los errores de Rag-API se traducen a `HttpException` con el mismo código y `message`. `rag-collection.bootstrap.ts` crea la colección en `onModuleInit` tolerando 409 y registrando una advertencia (sin tumbar el arranque) si Rag-API no responde.
- Endpoints: `GET /admin/knowledge`, `POST /admin/knowledge/files` (`FileInterceptor('file')`, 202, `originalname` a UTF-8), `POST /admin/knowledge/notes` (201), `PUT /admin/knowledge/notes/:id`, `DELETE /admin/knowledge/:id` (204).

- [ ] **Step 1:** Implementar puerto, adapter, bootstrap y controller; registrar un `AdminModule` o ampliar `RagModule`.
- [ ] **Step 2:** `pnpm build` — esperado: compila.

### Task 7: Responder con conocimiento

**Files:**
- Create: `src/core/domain/compose-instructions.ts`
- Modify: `ai.port.ts` (`knowledge?: string[]` en `AiGenerateOptions`), `infrastructure/extern/ai/gemini/gemini-proxy.service.ts`, `infrastructure/extern/ai/qwen/qwen.service.ts`, `whats-app-message.service.ts`

**Interfaces:**
- Produces: `composeInstructions(base: string | undefined, knowledge: string[] | undefined): string | undefined` — sin fragmentos devuelve `base`; con fragmentos agrega a `base` un bloque en español con la información del negocio e indica no inventar datos fuera de ella.
- El caso de uso llama `knowledge.search(text)` dentro de un `try/catch` que registra una advertencia y sigue con `[]`; ambos proveedores de IA usan `composeInstructions`.

- [ ] **Step 1:** Implementar y conectar en el caso de uso y los dos adapters de IA.
- [ ] **Step 2:** `pnpm build` — esperado: compila.

---

## Fase 3 — Panel (`whatsapp-chat-bot-WEB/`)

### Task 8: Adapters HTTP de Instrucciones y Conocimiento

**Files:**
- Create: `src/app/infrastructure/http/{bot-api-url.ts,http-instructions-api.ts,http-knowledge-api.ts}`
- Modify: `core/domain/models/models.ts` (`Instructions { content; updatedAt: Date | null; isDefault: boolean }`), `core/domain/ports/instructions-api.port.ts` (+`reset()`), `infrastructure/mock/mock-instructions-api.ts` (+`reset`, `isDefault`), `app.routes.ts` (providers de `InstructionsApi` y `KnowledgeApi` a Http), `app.config.ts` (`provideHttpClient()` para la vista independiente), `features/instructions/instructions-editor.ts` (botón "Restaurar valor por defecto", muestra "Valor por defecto" cuando `isDefault`)

**Interfaces:**
- Produces: `BOT_API_URL: InjectionToken<string>` (por defecto `http://localhost:3200`).
- `HttpInstructionsApi extends InstructionsApi`: `get()` → `GET /admin/instructions`, `save(content)` → `PUT`, `reset()` → `DELETE` y luego `get()`. Convierte `updatedAt` ISO a `Date | null`.
- `HttpKnowledgeApi extends KnowledgeApi`: `list`, `createNote`, `updateNote`, `remove` según la tabla del bot; `upload(file)` con `FormData` (campo `file`), `reportProgress: true, observe: 'events'`, emitiendo `{ type: 'progress', percent }` y `{ type: 'done', item }`. Fechas ISO → `Date`. Los errores propagan el `message` del bot.

- [ ] **Step 1:** Implementar adapters y cambiar los providers; los mocks y el resto de pantallas no cambian.
- [ ] **Step 2:** `ng build` — esperado: compila.
- [ ] **Step 3:** Con el bot, Rag-API, Postgres y Redis arriba: guardar instrucciones, subir un `.txt` y una nota, ver `processing → ready` y mandar un mensaje de prueba al webhook que use ese conocimiento.

---

## Fase 4 — Tests y cierre (al final)

### Task 9: Tests de Rag-API

**Files:** specs junto a cada archivo nuevo; `test/rag-api.e2e-spec.ts`; helpers en `test/`.

- [ ] **Step 1:** Unitarios: `chunkSections` (tamaño ≤ 1000, solape de 150, no une secciones, ignora vacíos); `hasEnoughText` (50 caracteres por página); `DocumentService.uploadFile` rechaza `virus.exe` (400), archivo vacío (400), `10 MB + 1` (413) y el documento 21 (409); `ProcessDocumentService` con un documento ya borrado no lanza; `ApiKeyGuard` acepta `RAG_API_KEY` y rechaza falta/error con 401; extractor PDF usa OCR cuando el texto es insuficiente y falla con "No se pudo leer el contenido del PDF con suficiente calidad".
- [ ] **Step 2:** Integración (`docker compose -f docker-compose.test.yml up -d`, `pnpm test:int`): `DocumentRepository` (`refreshStatus` pasa a `failed` si un fragmento falla, a `ready` solo con extracción hecha y sin `pending`; `remove` borra fragmentos); `ItemRepository` con `documentId`.
- [ ] **Step 3:** e2e: subir `catálogo.pdf` y comprobar `title === 'catálogo.pdf'`; subir un `.txt` y verlo `ready` y encontrable por `search`; borrar un documento con fragmentos en cola; archivo corrupto → `failed` con `errorMessage` en español. `pnpm test && pnpm test:int && pnpm test:e2e` — esperado: todos pasan.

### Task 10: Tests del bot

- [ ] **Step 1:** `InstructionsService` (sin fila → `isDefault: true` y `DEFAULT_INSTRUCTIONS`; con fila → su contenido; `reset` vuelve al valor por defecto); `AdminInstructionsController` (400 con contenido vacío o de 8001 caracteres); repositorio con dos `save` concurrentes deja una fila (contra Postgres temporal); `composeInstructions` (sin fragmentos devuelve `base`; con fragmentos incluye cada texto); caso de uso: si `knowledge.search` lanza, igual se envía la respuesta sin fragmentos; `RagKnowledgeService.search` descarta puntajes < 0.35 y pide `topK = 4`; los errores 4xx de Rag-API conservan código y mensaje.
- [ ] **Step 2:** `pnpm test` — esperado: todo pasa salvo la falla previa y ajena de `collention.service.spec.ts`, que desaparece al borrar ese módulo.

### Task 11: Tests del panel

- [ ] **Step 1:** `HttpInstructionsApi` y `HttpKnowledgeApi` con `HttpTestingController`: URLs, método y cuerpo; `upload` emite `progress` y luego `done`; fechas ISO convertidas a `Date`; error con `message` del bot; `updatedAt: null` para el valor por defecto; `MockInstructionsApi.reset`.
- [ ] **Step 2:** `ng test` — esperado: todo pasa.

### Task 12: Documentación

- [ ] **Step 1:** Actualizar `CLAUDE_CONTEXT.md` de los tres proyectos (estructura nueva, variables), `what-app/CLAUDE.md` (contratos: el panel llama al bot, el bot a Rag-API), las notas de Obsidian de cada proyecto y de la plataforma (avances 2026-11-09 y decisiones: un registro de instrucciones, Rag-API con API key única, blob storage pendiente), y `.env.example` de bot y Rag-API.
