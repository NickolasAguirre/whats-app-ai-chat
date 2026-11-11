# Instrucciones del bot y base de conocimiento — diseño

Fecha: 2026-11-09 · Proyectos: `whatsapp-chat-bot-API` (bot), `Rag-API`, `whatsapp-chat-bot-WEB` (panel)

## 1. Intención

Hoy el panel permite escribir las instrucciones del bot y subir archivos de conocimiento, pero todo es mock: el bot no
expone nada para el panel, Rag-API solo entiende texto plano y el bot no consulta el conocimiento al responder.

Este diseño conecta las tres piezas para que:

1. El bot tenga un comportamiento general por defecto (claro, formal, en español) que el cliente puede cambiar.
2. El cliente suba archivos (PDF, Excel/CSV, imágenes, TXT/MD) o notas; Rag-API los reciba, transcriba su contenido y
   los vuelva buscables.
3. El bot use ese conocimiento al contestar por WhatsApp.
4. El panel deje de usar mocks en Instrucciones y Conocimiento y llame a endpoints reales del bot.

## 2. Objetivos, no-objetivos y anti-objetivos

**Objetivos**
- Una única instrucción activa, con valor por defecto cuando el cliente no definió ninguna.
- Subida de archivos y notas con estados `processing → ready | failed`, listado, edición de notas y borrado.
- Transcripción en Rag-API; imágenes con el modelo `qwen-vl-ocr`.
- El bot busca en el conocimiento antes de responder y degrada sin él si Rag-API falla.
- Quitar de Rag-API lo relacionado con tenants (ver 5.2), igual que ya se hizo en el bot.

**No-objetivos (explícitamente fuera de alcance)**
- Guardar el archivo original en un blob storage. Solo se deja el punto de extensión (ver 5.2).
- Validar el token de `container.API` en los endpoints del bot.
- Pasar a datos reales Resumen, Números y Conversaciones del panel (siguen en mock).
- Más de 20 páginas por PDF en el respaldo con OCR (ver 5.2).
- Más de un número de WhatsApp o más de una instrucción activa por despliegue.

**Anti-objetivos (sería un fallo aunque "funcione")**
- Que el panel llame a Rag-API directo (expondría su API key): todo pasa por el bot.
- Atar `core/domain` a TypeORM, Qwen, Redis o a una librería de lectura de archivos.
- Que un fallo de Rag-API impida que el bot responda por WhatsApp.

## 3. Restricciones

- Clean Architecture por puertos y adapters en los tres proyectos; el dominio no importa infraestructura.
- Persistencia con TypeORM `EntitySchema` (sin decoradores en clases de dominio); tablas y migraciones como ya existen.
- Multi-tenant por infraestructura: un despliegue y una base por tenant; el código no conoce tenants.
- Texto de la UI y mensajes de error al usuario en español; código en inglés (web) y convención actual en bot/Rag.
- Límites ya definidos en el panel: 10 MB por archivo y 20 archivos en total.
- Orden de trabajo: primero el desarrollo completo y al final los tests.

## 4. Decisiones

**Del usuario**
- Las instrucciones por defecto son "lo normal": lenguaje claro, formal y en español. El cliente puede cambiarlas.
  Solo hay un registro de instrucciones activo.
- Lectura de imágenes con el modelo de Qwen `qwen-vl-ocr`.
- El archivo original irá a un blob storage más adelante; no es parte de este alcance.
- Los endpoints del bot no validan aún el token de `container.API`.
- El bot usa el conocimiento al responder.
- En el panel solo se pasan a real Instrucciones y Conocimiento.
- Hay que quitar de Rag-API cosas de tenant.

**Mías (para que las confirmes; marcadas también en la sección 8)**
- Las instrucciones del cliente **reemplazan** al texto por defecto (no se concatenan); volver al valor por defecto es
  borrar el registro.
- Rag-API conserva una autenticación mínima: una sola `X-API-Key` leída del entorno (`RAG_API_KEY`), sin tablas.
- La calidad de lectura decide el resultado de un PDF: se intenta leer su texto; si es insuficiente (se estima por
  caracteres útiles por página), se pasa cada página por `qwen-vl-ocr`; si aun así la lectura es pobre, el documento
  queda `failed` con un mensaje claro en español.
- Búsqueda al responder: 4 fragmentos como máximo y descarte por puntaje mínimo (valor inicial 0.35, ajustable por entorno).

## 5. Diseño

### 5.1 Bot (`whatsapp-chat-bot-API`)

**Instrucciones.** El texto por defecto vive como constante en `core` (`DEFAULT_INSTRUCTIONS`), por ejemplo:
"Eres el asistente virtual de atención al cliente del negocio. Responde siempre en español, con un lenguaje claro y
formal. Sé breve y preciso. Si no conoces la respuesta o la información no está disponible, indícalo con honestidad y
ofrece derivar la consulta a una persona."

- `InstructionsRepositoryPort` gana `save(content)` y `delete()` además de `get()`. Nunca puede haber más de una fila,
  ni siquiera con dos `save` concurrentes.
- Un caso de uso de instrucciones resuelve la "instrucción efectiva" (`fila ?? DEFAULT_INSTRUCTIONS`) y la usa tanto el
  flujo del mensaje entrante como el endpoint `GET`.
- Límite de longitud del contenido: 8000 caracteres (400 si se excede o está vacío).

**Conocimiento (BFF).** Un puerto `KnowledgePort` en `core` con un adapter HTTP hacia Rag-API (reemplaza al módulo
`rag/` actual, que está vacío y llama a rutas que no existen). El bot asegura al arrancar que existe la colección
(`RAG_COLLECTION`, por defecto `knowledge`), tolerando "ya existe".

**Respuesta con conocimiento.** `AiGenerateOptions` gana `knowledge?: string[]`. Antes de generar, el caso de uso busca
con el texto del cliente; los fragmentos se pasan a los adapters de Gemini y Qwen, que los agregan a las instrucciones
indicando que son la información del negocio y que no deben inventar datos fuera de ella. Si la búsqueda falla se
registra una advertencia y se responde sin fragmentos (igual que hoy con la memoria en Redis).

**Endpoints para el panel** (prefijo `/admin`, CORS habilitado para los orígenes del panel vía `CORS_ORIGINS`):

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /admin/instructions` | — | `{ content, updatedAt, isDefault }` (`updatedAt` es `null` si es el valor por defecto) |
| `PUT /admin/instructions` | `{ content }` | igual que el `GET` |
| `DELETE /admin/instructions` | — | 204; vuelve al valor por defecto |
| `GET /admin/knowledge` | — | `KnowledgeItem[]` |
| `POST /admin/knowledge/files` | multipart, campo `file` (un archivo por request) | 202 + `KnowledgeItem` |
| `POST /admin/knowledge/notes` | `{ title, content }` | 201 + `KnowledgeItem` |
| `PUT /admin/knowledge/notes/:id` | `{ title, content }` | `KnowledgeItem` |
| `DELETE /admin/knowledge/:id` | — | 204 |

`KnowledgeItem` es el mismo que ya usa el panel: `{ id, kind: 'pdf'|'spreadsheet'|'image'|'text'|'note', title,
status: 'processing'|'ready'|'failed', createdAt, sizeBytes?, content? (solo notas), errorMessage? }`.
Errores: 400 (tipo no admitido, archivo vacío, cuerpo inválido), 413 (más de 10 MB), 409 (ya hay 20 archivos),
404 (no existe). El mensaje viaja en `message`, en español.

### 5.2 Rag-API

**Quitar tenants.** Se eliminan `Tenant`, `ApiKey`, `TenantAccessPort` y su repositorio, `TenantService`, el CLI
`tenant:create`, el decorador `@TenantId` y la columna `tenantId` de `Collection` (el nombre pasa a ser único por
base). El guard compara `X-API-Key` con `RAG_API_KEY` en tiempo constante. La migración inicial se reescribe (las bases
se recrean). Se actualizan e2e, README y `CLAUDE_CONTEXT.md`. Se corrige además la ruta del controlador de colecciones
(`/collection` → `/collections`), que hoy contradice el README y los tests.

**Documentos.** Nueva entidad `Document`: `id, collectionId, title, kind, sizeBytes?, content? (solo notas), status,
failureReason?, createdAt`. `Item` gana `documentId` (nullable, con borrado en cascada desde la aplicación).

Endpoints nuevos (todos bajo `/collections/:collection/documents`, con `X-API-Key`):

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /` | multipart, campo `file` | 202 + documento |
| `POST /text` | `{ title, content }` | 202 + documento (`kind: 'note'`) |
| `PUT /:id/text` | `{ title, content }` | 202 + documento; reemplaza los fragmentos |
| `GET /` · `GET /:id` | — | documento(s) |
| `DELETE /:id` | — | 204; borra el documento y todos sus fragmentos |

**Procesamiento asíncrono** (nueva cola BullMQ, junto a la de embeddings):
1. Se valida (extensión permitida, no vacío, ≤ 10 MB, ≤ 20 documentos) y se guarda el documento en `processing`.
2. El archivo se deja en un `FileStoragePort` y se encola un trabajo. El adapter inicial es disco local temporal
   (`UPLOAD_DIR`) y el archivo se borra tras extraer el texto; **este es el punto donde luego se conecta el blob storage**.
3. Un `TextExtractorPort` por tipo: PDF (capa de texto; si el texto es insuficiente se renderizan las páginas, hasta
   20, y se leen con el mismo OCR de las imágenes; si el resultado sigue siendo pobre, falla con
   "No se pudo leer el contenido del PDF con suficiente calidad"), hoja de cálculo (Excel/CSV, cada fila como "Columna: valor"),
   TXT/MD (directo) e imagen (`qwen-vl-ocr` por la API compatible con OpenAI, con `QWEN_API_KEY` y
   `QWEN_URL_BASE_OPEN_AI` ya existentes; modelo configurable con `OCR_MODEL`).
4. Un servicio de dominio parte el texto en fragmentos (~1000 caracteres, solape ~150, respetando párrafos; para
   hojas, grupos de filas repitiendo los encabezados) y crea los `Item` en `pending` con su `documentId`, que entran a
   la cola de embeddings existente.
5. Estado del documento: `processing` hasta que la extracción termine y todos sus fragmentos estén embebidos; `ready`
   si todo salió bien; `failed` (con `failureReason` en español) si la extracción falla, el PDF no tiene texto o algún
   fragmento falla definitivamente.

### 5.3 Panel (`whatsapp-chat-bot-WEB`)

- Nuevos adapters en `infrastructure/http/`: `HttpInstructionsApi` y `HttpKnowledgeApi` que implementan los puertos
  `InstructionsApi` y `KnowledgeApi` sin cambiarlos (salvo que `Instructions.updatedAt` pasa a admitir `null`).
- URL base del bot mediante un `InjectionToken` (`BOT_API_URL`, por defecto `http://localhost:3200`), para que el
  contenedor pueda sobrescribirla.
- `upload(file)` usa `HttpClient` con `reportProgress` para emitir `progress` y luego `done`; las fechas ISO se convierten
  a `Date`; los errores se muestran con el `message` que devuelve el bot.
- Se cambian solo los providers de `InstructionsApi` y `KnowledgeApi` de Mock a Http; el resto sigue en mock. Los mocks
  y sus tests se conservan.
- Se mantiene el sondeo cada 3 s mientras haya elementos en `processing`.
- Una acción "Restaurar valor por defecto" en el editor de instrucciones, que llama a `DELETE`.

## 6. Contratos entre proyectos (resumen)

Panel → Bot: la tabla de 5.1. Bot → Rag-API: `POST /collections`, `POST /collections/:c/search`,
`POST|GET|PUT|DELETE /collections/:c/documents…` de 5.2, siempre con `X-API-Key: RAG_API_KEY`.
Variables nuevas: bot (`RAG_API_URL`, `RAG_API_KEY`, `RAG_COLLECTION`, `CORS_ORIGINS`, `KNOWLEDGE_TOP_K`,
`KNOWLEDGE_MIN_SCORE`), Rag-API (`RAG_API_KEY`, `OCR_MODEL`, `UPLOAD_DIR`).

## 7. Lo que se deja al constructor

Librerías para leer PDF y Excel/CSV; el mecanismo exacto para garantizar una sola fila de instrucciones; el esquema
del prompt con fragmentos en cada proveedor de IA; el tamaño final de fragmentos y solape; el manejo de reintentos de la
cola de extracción; los tests (al final, incluidos integración y e2e de Rag-API con Docker).

## 8. Confirmado por el usuario (2026-11-09)

1. Las instrucciones del cliente reemplazan al texto por defecto (no se suman).
2. Rag-API mantiene una sola API key por entorno en vez de tablas de tenants y keys.
3. La calidad de lectura decide el resultado de un PDF (texto → OCR por página → falla con mensaje claro).
4. Búsqueda al responder: valores iniciales de 4 fragmentos y puntaje mínimo 0.35, ajustables por entorno.
5. Archivo guardado solo de forma temporal hasta extraer el texto; el blob storage llega después.
6. Los endpoints `/admin` quedan sin autenticación hasta que se integre `container.API` (riesgo conocido).
