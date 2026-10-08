# apps/web — reglas del frontend

- Next.js App Router con grupos de rutas: (public), (panel), (paciente), (admin).
- Componentes de servidor por defecto; "use client" solo para interacción.
- Datos (ADR-036): los componentes de servidor leen con serverApi (cache: 'no-store', cookie y X-Forwarded-For,
  API_INTERNAL_URL en ejecución); toda mutación va del navegador a /api/v1 con TanStack Query (apiFetch), nunca
  con Server Actions. Errores con errorMessage: español según el code y, en un 5xx, el requestId.
- Sesión: el layout de (panel) pide /account en cada petición; sin sesión, /entrar?next= (safeNext: solo rutas
  internas). PLATFORM va a /admin/plataforma, con la guardia en su layout anidado. Al cambiar de organización o
  salir: queryClient.clear() y router.refresh(). La interfaz oculta lo que el rol no puede; decide la API.
- Tokens de invitación y recuperación: del fragmento con useFragmentToken (se borran con history.replaceState)
  y por POST.
- Formularios: react-hook-form con los esquemas Zod de @nutricoach/contracts. Mensajes en español.
- UI: componentes de @nutricoach/ui. Colores solo por tokens CSS: la marca y el tema del paciente cambian tokens.
  La marca se pinta con <BrandStyle> desde el layout del servidor (ADR-027); nunca colores fijos en componentes.
- Estados (en rango, avisos, errores): color + ícono + texto, nunca solo color. Números con formatNumber (RN-D09)
  y columnas numéricas con tabular-nums. Recharts solo desde `@nutricoach/ui/chart` y en componentes de cliente.
- Íconos y funciones no cruzan de servidor a cliente: la lista de navegación vive en el componente de cliente.
- APP_ENV decide lo que solo existe en local y staging (catálogo en /admin/componentes); se lee en ejecución.
- Números clínicos: se muestran los de la API, siempre con su método (MethodBadge, RN-D02).
  @nutricoach/engine solo para vistas previas mientras se escribe.
- App del paciente: primero el celular, objetivos táctiles de 44 px o más, teclado numérico, registrar una comida
  del plan en tres toques o menos (RN-G06). Cada registro envía clientId e Idempotency-Key.
- La palabra "Paciente" sale de la configuración de la organización (puede ser "Asesorado").
- Accesibilidad: etiquetas, foco visible y contraste AA; axe en las pruebas de Playwright.
- Un spec de Playwright por demo en e2e/, en escritorio (Chromium) y en móvil (iPhone, WebKit). Los enlaces de
  correo se leen de Mailpit; nunca rutas de prueba que devuelvan tokens.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
