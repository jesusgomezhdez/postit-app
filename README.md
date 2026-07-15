# Post-it

Un post-it virtual compartible por enlace, con edición en tiempo real vía Supabase Realtime.

## 1. Crear el backend en Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com) (free tier).
2. Ve a **SQL Editor** y ejecuta el contenido de [`schema.sql`](schema.sql). Esto crea la tabla `postits`, sus políticas RLS y habilita Realtime sobre ella.
3. Ve a **Project Settings → API** y copia:
   - `Project URL`
   - `anon public` key

> **Nota de seguridad:** no hay login. El UUID de cada post-it (parte de su enlace) actúa como token de acceso: cualquiera con el enlace puede leer, editar y borrar esa nota. Las políticas RLS permiten `select`/`insert`/`update`/`delete` a cualquiera con la anon key, así que en teoría alguien podría listar todas las filas de la tabla directamente vía API si lo intenta deliberadamente. Es un riesgo aceptado para este proyecto (pensado para compartir un enlace puntual, no para datos sensibles).

> **Aviso de free tier:** los proyectos gratuitos de Supabase se pausan automáticamente tras ~1 semana sin actividad. Si el enlace deja de funcionar, entra al dashboard de Supabase y reactiva el proyecto manualmente.

## 2. Configurar variables de entorno

Copia `.env.example` a `.env` y rellena con los valores del paso anterior:

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

## 3. Desarrollo local

```bash
pnpm install
pnpm dev
```

Abre la URL que indique Vite. Al entrar sin `?id=` en la URL se crea una nota nueva y redirige automáticamente a su enlace.

## 4. Build y despliegue

```bash
pnpm build
```

Esto genera una carpeta `dist/` 100% estática, desplegable en cualquier hosting gratuito sin VPS: **Cloudflare Pages**, Netlify, Vercel o GitHub Pages. En cualquiera de ellas configura:

- **Build command:** `pnpm build`
- **Output directory:** `dist`
- **Variables de entorno:** `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (las mismas del `.env`)

### Ejemplo con Cloudflare Pages

1. Conecta el repositorio (o sube `dist/` directamente con `pnpm dlx wrangler pages deploy dist`).
2. Configura el build command y output directory de arriba.
3. Añade las variables de entorno en **Settings → Environment variables**.

## Cómo funciona

- Cada post-it es una fila en la tabla `postits`, identificada por un `uuid` que forma parte de la URL (`/?id=<uuid>`).
- Al escribir, el contenido se guarda con un debounce de ~400ms.
- Los demás clientes con el mismo `id` reciben el cambio al instante vía Supabase Realtime (`postgres_changes`).
- El botón "Borrar" vacía el contenido de la nota sin eliminar la fila, así el enlace se mantiene válido.
