# Demo 3 · p95 de la analítica

Medido el 2026-11-07 con `pnpm analytics:p95` (criterio 4 de P14 y RNF-01, ADR-096). Cada consulta se pide una tras
otra sobre pacientes al azar de la organización de carga, como la dueña (ve a todos) y como una profesional (solo su equipo
de atención, RN-A05). Es una medición local: k6 sobre un servidor idéntico al de producción, con carga sostenida, va en P16.

**Resultado:** todas las consultas con p95 de 300 ms o menos y sin errores.

| Consulta | Como | Pedidos | Errores | p50 | p95 | p99 | Máximo |
|---|---|---:|---:|---:|---:|---:|---:|
| Dieta, 4 semanas (RF-32) | Dueña | 200 | 0 | 18 ms | 25 ms | 32 ms | 45 ms |
| Dieta, 1 año (RF-32) | Dueña | 200 | 0 | 50 ms | 60 ms | 72 ms | 73 ms |
| Tendencia, 24 meses (RN-G09) | Dueña | 200 | 0 | 73 ms | 89 ms | 101 ms | 109 ms |
| Rutina del programa vigente (RF-33) | Dueña | 200 | 0 | 37 ms | 44 ms | 47 ms | 48 ms |
| Panel con alertas (RF-34) | Dueña | 200 | 0 | 68 ms | 78 ms | 90 ms | 110 ms |
| Dieta, 4 semanas (RF-32) | Profesional | 200 | 0 | 16 ms | 21 ms | 29 ms | 53 ms |
| Dieta, 1 año (RF-32) | Profesional | 200 | 0 | 52 ms | 61 ms | 70 ms | 85 ms |
| Tendencia, 24 meses (RN-G09) | Profesional | 200 | 0 | 78 ms | 102 ms | 110 ms | 125 ms |
| Rutina del programa vigente (RF-33) | Profesional | 200 | 0 | 39 ms | 44 ms | 47 ms | 59 ms |
| Panel con alertas (RF-34) | Profesional | 200 | 0 | 81 ms | 93 ms | 112 ms | 144 ms |

## Datos y máquina

- Pacientes con historia: 500
- Pacientes de la profesional medida: 34
- Comidas registradas: 1,584,285
- Series registradas: 1,820,520
- Días de resumen: 365,063
- Tamaño de la base: 2968 MB
- Máquina: Intel(R) Core(TM) i5-7400 CPU @ 3.00GHz (4 hilos), 19 GB de memoria, Node v24.21.0
