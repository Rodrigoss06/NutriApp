# apps/web — reglas del frontend

- Next.js App Router con grupos de rutas: (public), (panel), (paciente), (admin).
- Componentes de servidor por defecto; "use client" solo para interacción.
- Datos: el servidor llama a la API reenviando la cookie; mutaciones con TanStack Query hacia /api/v1.
- Formularios: react-hook-form con los esquemas Zod de @nutricoach/contracts. Mensajes en español.
- UI: componentes de @nutricoach/ui. Colores solo por tokens CSS: la marca y el tema del paciente cambian tokens.
- Números clínicos: se muestran los de la API, siempre con su método (MethodBadge, RN-D02).
  @nutricoach/engine solo para vistas previas mientras se escribe.
- App del paciente: primero el celular, objetivos táctiles de 44 px o más, teclado numérico, registrar una comida
  del plan en tres toques o menos (RN-G06). Cada registro envía clientId e Idempotency-Key.
- La palabra "Paciente" sale de la configuración de la organización (puede ser "Asesorado").
- Accesibilidad: etiquetas, foco visible y contraste AA; axe en las pruebas de Playwright.
- Un spec de Playwright por demo en e2e/, en escritorio y en móvil.
