# Diseño: Rag-API multi-tenant, conocimiento por tenant e historial en BD

**Fecha:** 2026-11-10
**Estado:** BORRADOR. D21 resuelta (constante de tenant en el bot). Las demás dudas de la sección 5 quedan con mi recomendación como valor por defecto hasta que el usuario diga otra cosa. No hay plan ni código hasta que se apruebe.

Proyectos afectados: `Rag-API`, `whatsapp-chat-bot-API` y, en un punto menor, `Container/container.API`.

## 1. Resumen

Tres cambios relacionados:

1. **Rag-API pasa a ser multi-tenant real y proyecto independiente.** Hoy es "una base y un despliegue por tenant, sin tenants en el código" (`X-API-Key` única). Debe poder atender a proyectos internos y externos desde un solo despliegue, aislando el conocimiento por tenant.
2. **Rag-API arranca con una colección por defecto `qwen`** (el modelo de embeddings que se usa por defecto). El bot deja de configurar `RAG_COLLECTION`/crear colecciones y busca el conocimiento **por tenant**.
3. **El bot guarda el historial de mensajes en PostgreSQL.** Redis sigue siendo la memoria corta que se envía al LLM. La BD es la fuente de verdad para revisar conversaciones desde el panel.

## 2. Decisiones ya tomadas (dichas por el usuario)

- Rag-API se trabaja como proyecto independiente, usable por proyectos internos y externos.
- Rag-API se inicializa con una colección `qwen`, el modelo que se usa por defecto.
- El bot **no** lleva "knowledge" configurado a mano: lo busca por tenant.
- El historial de mensajes se guarda en la BD (para revisar conversaciones). Redis queda solo para armar el historial que se envía al LLM.
- **Seguridad: por ahora sin ella.** A futuro, la autenticación será con los tokens de container.API (que el bot deberá obtener). El bot hoy no usa tokens, aunque container.API ya los genera.
- **El tenant sale de la tabla `Tenant` de container.API**, que tiene un solo registro por instalación. Ese tenant es el que llega a Rag-API.
- **Flujo del tenant (aclarado 2026-11-10):** al inicializar Security (container) ya se conoce el tenant y el frontend lo guarda en `localStorage` para usarlo después. El panel lo envía al bot en sus peticiones y el bot se lo reenvía a Rag-API, que busca los archivos por tenant. Solo existe un tenant por instalación de Security.
- El "knowledge" configurado a mano en el bot (`RAG_COLLECTION`) deja de funcionar/usarse. (Mi lectura de "deja de funcionar knowledge"; ver D21.)

## 3. Estado actual (lo que encontré en el código)

**Rag-API**
- `Collection`: `id` uuid, `name` **único global**, `embeddingModel`, `dimension`, `createdAt`. No hay noción de tenant.
- Auth: un solo `ApiKeyGuard` con `RAG_API_KEY`.
- Rutas: `/collections`, `/collections/:name/documents`, `/collections/:name/search`, etc.

**whatsapp-chat-bot-API**
- `RagCollectionBootstrap` crea la colección `RAG_COLLECTION` (default `knowledge`) al arrancar. `RagKnowledgeService` arma las URLs con esa variable.
- `MessageMemoryPort` (`getRecentMessages`, `appendMessage`) con adapter Redis. No existe tabla de mensajes (solo `Person` e `Instructions`).
- Una base por tenant, sin `tenantId` en el código.

**container.API**
- `POST /auth/login` firma un JWT con solo `{ sub, email }`. **No lleva tenant.**
- `Tenant` es una sola fila con `id = 1` fijo (marca: nombre de empresa, logo, colores). No tiene identificador único entre instalaciones.

## 4. Propuesta (mis supuestos, a validar con las dudas)

> Todo lo de esta sección es propuesta mía, no decisión del usuario.

### 4.1 Identidad de tenant
- `Tenant` en container.API gana un identificador único entre instalaciones (columna nueva, ver duda D1).
- El bot lo obtiene de container.API al arrancar (o de configuración) y lo envía a Rag-API en cada llamada.

### 4.2 Rag-API
- `Collection` gana `tenantId`; la unicidad pasa de `name` a `(tenantId, name)`. Items y documentos quedan aislados por su colección; toda consulta se filtra por tenant.
- El tenant llega en un header `X-Tenant-Id` (las rutas no cambian).
- Un tenant se aprovisiona de forma perezosa en su primera llamada: se crea su colección por defecto `qwen` (modelo y dimensión desde la configuración de Rag-API).
- El tenant no se valida contra container.API por ahora (sin seguridad).

### 4.3 Bot
- Se elimina `RAG_COLLECTION` y la lógica de crear colección en `RagCollectionBootstrap`.
- `RagKnowledgeService` busca/sube conocimiento en la colección por defecto del tenant (`qwen`), enviando `X-Tenant-Id`.

### 4.4 Historial en BD
- Tabla nueva `Message` en la base del bot: `id` (uuid), `personId`, `role` (`inbound` | `outbound`, los roles que ya usa el código), `content`, `providerMessageId` (nullable, único), `createdAt`. Índice `(personId, createdAt)`.
- Nuevo puerto de dominio (p. ej. `MessageHistoryPort`) con adapter TypeORM, separado de `MessageMemoryPort` (Redis).
- Flujo: se guarda el mensaje entrante en BD, se llama al LLM con la memoria de Redis y se guarda la respuesta en BD y en Redis.
- Redis mantiene su TTL; si está vacío para una persona, se rehidrata desde la BD (últimos N mensajes).

## 5. Dudas abiertas

Cada duda lleva mi recomendación, que es lo que haré si no se dice otra cosa.

### Identidad y llamadas entre proyectos

**D1. Identificador único del tenant.** `Tenant.id = 1` es fijo en cada instalación; en un Rag-API compartido dos instalaciones chocarían. ¿Agregamos a `Tenant` en container.API un identificador único (uuid o código tipo `acme`)?
*Recomiendo:* una columna `code` (texto único, legible) generada/definida al instalar, y usar ese valor como tenant en Rag-API.

**D2. Cómo se transporta el tenant a Rag-API.** ¿Header `X-Tenant-Id` o parte de la ruta (`/tenants/:id/collections/...`)?
*Recomiendo:* header, para no romper las rutas ni el OpenAPI. Ruta explícita solo si quieres que se vea en logs/proxy.

**D3. Qué pasa con la `X-API-Key` actual.** "Sin seguridad por ahora" ¿significa mantener la `X-API-Key` compartida y solo agregar tenant, o quitar también la key?
*Recomiendo:* mantener la `X-API-Key` (es lo que ya hay y evita dejar el servicio abierto), sin validar el tenant contra container.API todavía.

**D4. Cómo obtiene el bot su tenant.** (a) variable de entorno, (b) llamada a container.API (¿qué endpoint? hoy no hay uno que devuelva el `Tenant` público) al arrancar y cachear, (c) en cada petición.
*Recomiendo:* (b) al arrancar con caché, con fallback a variable de entorno mientras no exista el endpoint. Ojo: esto implica que el bot dependa de container.API para arrancar.

> **Actualización 2026-11-10:** el usuario aclaró que el tenant se obtiene en el frontend (container.WEB, `localStorage`) y viaja panel → bot → Rag-API. Esto cambia D4 en el caso del panel, pero deja abierto el caso del webhook de WhatsApp, que no pasa por el panel (ver D21).

**D21. Tenant en el flujo del webhook.** Cuando un cliente escribe por WhatsApp no interviene el panel ni su `localStorage`: el bot debe buscar conocimiento con un tenant propio. ¿De dónde lo toma el bot en ese caso?
**RESUELTA (usuario, 2026-11-10):** por ahora el bot usa una **constante** de tenant para el flujo del webhook; se ajustará después. Mi implementación: una constante única en el bot (un solo lugar), fácil de reemplazar luego por configuración o por lo que resuelva container.API.

**D22. Qué es "deja de funcionar knowledge".** ¿Significa que se elimina `RAG_COLLECTION`/el bootstrap y que `/admin/knowledge` pasa a requerir el tenant, o que el conocimiento queda apagado hasta terminar este cambio?
*Recomiendo:* lo primero; el conocimiento no se apaga, solo cambia a funcionar por tenant.

**D23. ¿Cómo viaja el tenant del panel al bot?** Header (p. ej. `X-Tenant-Id`) en `/admin/*` o parámetro de ruta. Recuerda que un valor que viene del navegador puede ser manipulado: es aceptable sin seguridad, pero debe ir a la lista de pendientes de la autenticación futura.
*Recomiendo:* header `X-Tenant-Id`.

**D5. ¿El bot sigue siendo un despliegue por tenant?** `CLAUDE_CONTEXT.md` dice "una base por tenant, sin `tenantId` en el código", pero el spec de 2026-09-14 modelaba tenants por número de WhatsApp. ¿Cuál vale hoy?
*Recomiendo:* seguir con un despliegue (y base) del bot por tenant, con un único tenant fijo por despliegue.

**D6. Alta de tenants en Rag-API.** ¿Se crean al vuelo en la primera llamada o con un endpoint explícito (`POST /tenants`)?
*Recomiendo:* al vuelo (upsert) mientras no haya seguridad; el endpoint explícito llegará con la autenticación para que un tercero no se auto-cree tenants.

### Colección `qwen`

**D7. Significado de "colección qwen".** ¿Es la colección por defecto de cada tenant (y luego puede haber otras, p. ej. otro modelo de embeddings), o la única colección?
*Recomiendo:* es la colección por defecto de cada tenant (nombre `qwen`); el modelo/dimensión salen de la config de Rag-API. El bot no elige colección: usa la por defecto.

**D8. Nombre/ruta para "la colección por defecto".** ¿El bot llama a `/collections/qwen/...` con el nombre fijo, o Rag-API ofrece un alias (p. ej. `/collections/default/...`)?
*Recomiendo:* nombre fijo `qwen` por ahora; es lo más simple y evita un alias que luego haya que migrar.

**D9. Datos existentes.** Hoy hay (al menos en dev) una colección `knowledge` con documentos. ¿Se migra a `qwen` bajo un tenant concreto, o se descarta?
*Recomiendo:* si solo es data de desarrollo, descartarla; si hay datos que importen, migración que asigna un tenant (¿cuál?) y renombra a `qwen`. Dime cuál es el caso.

**D10. Aislamiento.** ¿Basta con la columna `tenantId` (una sola base compartida), o los externos exigirán base/esquema aparte?
*Recomiendo:* columna `tenantId` + filtro obligatorio en cada consulta y test e2e de aislamiento. La base por tenant queda descartada para Rag-API, ya que el objetivo es un solo despliegue.

**D11. Compatibilidad hacia atrás.** El cambio rompe el contrato actual (el bot es el único consumidor interno). ¿Se permite romperlo, o hay otros consumidores?
*Recomiendo:* romper limpio; Rag-API no tiene remoto ni otros consumidores conocidos.

### Historial en BD

**D12. Campos del mensaje.** ¿Basta con `role`, `content`, `createdAt`, `providerMessageId`, o hay que guardar más (tipo de mensaje/media, estado de entrega, modelo de IA usado, tokens, `from`/`to`)?
*Recomiendo:* el conjunto mínimo de 4.4; lo demás se agrega cuando el panel lo pida.

**D13. ¿Concepto de "conversación"?** ¿Una conversación = todos los mensajes de una `Person` (sin tabla propia), o hay sesiones/hilos con inicio y fin?
*Recomiendo:* sin tabla de conversación; una persona = un hilo continuo. La lista del panel se arma agrupando por `personId`.

**D14. Política de fallo al guardar.** Si falla la BD, ¿el bot igual responde y registra el error, o no responde?
*Recomiendo:* responder igual y loguear (el cliente no debe quedar sin respuesta por un fallo de auditoría), guardando el mensaje entrante **antes** de llamar al LLM.

**D15. Reintentos del webhook.** YCloud puede reenviar el mismo evento. ¿Deduplicamos por `providerMessageId` (índice único) para no duplicar mensajes ni respuestas?
*Recomiendo:* sí, único por `providerMessageId` y descartar duplicados.

**D16. Rehidratar Redis desde la BD.** Si Redis expira/se vacía, ¿el contexto del LLM se reconstruye con los últimos N mensajes de la BD? ¿Cuántos, y con qué TTL en Redis?
*Recomiendo:* sí; N = el mismo límite que ya usa `getRecentMessages`, TTL actual sin cambios.

**D17. Alcance del panel.** ¿Entra ahora un endpoint `/admin/conversations` (listar personas, mensajes paginados) o solo la persistencia, dejando el endpoint para otra iteración? (`whatsapp-chat-bot-WEB` tiene "Conversaciones" sobre datos mock.)
*Recomiendo:* solo persistencia ahora; el esquema se diseña para permitirlo después.

**D18. Retención y datos personales.** ¿Hay política de borrado/anonimización de mensajes (p. ej. derecho al olvido, retención en meses)?
*Recomiendo:* ninguna por ahora, pero dejarlo anotado como pendiente.

### Proceso

**D19. Orden de trabajo.** *Recomiendo:* (1) Rag-API (tenant + colección `qwen` + tests de aislamiento), (2) container.API (campo único de `Tenant` y, si D4 lo pide, endpoint de lectura), (3) bot (consumir tenant, quitar `RAG_COLLECTION`), (4) historial en BD (independiente de lo anterior; puede ir en paralelo).

**D20. Interpretación de un mensaje.** Entendí que "para entrar a Rag-API se autentica con mi módulo de seguridad, que WhatsApp debe obtener; hoy WhatsApp no usa tokens aunque container ya los genera" describe el **futuro**, fuera de alcance de este diseño. ¿Es correcto?

## 6. Fuera de alcance (propuesto)

- Autenticación/autorización con tokens de container.API (ni en Rag-API ni en el bot).
- Alta/baja de tenants por un panel; onboarding de proyectos externos.
- Endpoint de conversaciones para el panel (D17) y UI.
- Facturación/uso por tenant.
- Retención y anonimización de mensajes.

## 7. Qué actualizar al terminar

- `CLAUDE_CONTEXT.md` y nota de Obsidian de `Rag-API`, `whatsapp-chat-bot-API` y `container.API` (contrato del tenant).
- `what-app/CLAUDE.md`: la línea "una base y un despliegue por tenant, sin tenants en el código" deja de ser cierta para Rag-API.
