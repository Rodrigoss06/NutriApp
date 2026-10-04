---
description: Revisa los cambios contra la arquitectura, las reglas y la definición de terminado
---
Revisa git diff main...HEAD y lo no confirmado. Reporta por gravedad, sin editar nada:
1. Fronteras: imports entre módulos fuera de index.ts; dominio que importa frameworks (pnpm lint:arch).
2. Reglas de negocio: cada regla tocada tiene una prueba que la cita; casos dorados en verde.
3. Datos: tablas nuevas con organization_id, RLS forzada y política; índices para sus consultas;
   migración compatible hacia atrás; nada de prisma migrate dev.
4. Seguridad y privacidad: guardias y políticas, auditoría de lecturas clínicas, nada personal en logs.
5. Inmutabilidad: nada publicado se modifica; nada se recalcula en silencio.
6. Interfaz: método junto a cada número clínico; móvil y accesibilidad en la app del paciente.
7. Definición de terminado de Notion 06 Convenciones, sección 9.
Termina con la lista de cambios concretos que sugieres.
