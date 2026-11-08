/**
 * El p95 de la analítica (criterio 4 de P14, RNF-01; ADR-096): sobre la organización de carga de `pnpm seed:load`, pide cada consulta
 * de analítica muchas veces, una tras otra, como la dueña (ve a todos los pacientes) y como una profesional (solo a su equipo de
 * atención, RN-A05), y escribe un informe con p50, p95, p99 y máximo por consulta. Es una medición local de la API con su base; k6
 * sobre un servidor idéntico al de producción, con carga sostenida, sigue en P16.
 *
 * Uso: pnpm analytics:p95 [--requests 200] [--out ../../docs/demos/demo-3-p95.md]
 */
import { writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import pg from 'pg';

// Los mismos de scripts/seed-load.ts: Node corre los scripts quitando los tipos y no resuelve `.js` a `.ts` entre ellos.
const LOAD_ORGANIZATION = '019a3000-0000-7000-8000-0000000000d0';
const LOAD_OWNER_EMAIL = 'duena@carga.example.com';
const professionalEmail = (n: number): string =>
  `profesional-${String(n).padStart(2, '0')}@carga.example.com`;

/** El criterio 4 de P14 y RNF-01: lecturas con p95 de 300 ms o menos. */
export const P95_LIMIT_MS = 300;

/** El percentil por rango más cercano de una lista ya ordenada. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] ?? Number.NaN;
}

export interface QueryStats {
  readonly query: string;
  readonly role: string;
  readonly requests: number;
  readonly errors: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

export function summarize(
  query: string,
  role: string,
  samples: readonly number[],
  errors: number,
): QueryStats {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    query,
    role,
    requests: samples.length,
    errors,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.at(-1) ?? Number.NaN,
  };
}

const ms = (value: number): string => `${value.toFixed(0)} ms`;

/** El informe en Markdown: la tabla, el veredicto y con qué datos y en qué máquina se midió. */
export function reportMarkdown(
  stats: readonly QueryStats[],
  context: {
    readonly date: string;
    readonly machine: string;
    readonly dataset: readonly (readonly [label: string, value: string])[];
  },
): string {
  const passed = stats.every((row) => row.p95 <= P95_LIMIT_MS && row.errors === 0);
  return [
    '# Demo 3 · p95 de la analítica',
    '',
    `Medido el ${context.date} con \`pnpm analytics:p95\` (criterio 4 de P14 y RNF-01, ADR-096). Cada consulta se pide una tras`,
    'otra sobre pacientes al azar de la organización de carga, como la dueña (ve a todos) y como una profesional (solo su equipo',
    'de atención, RN-A05). Es una medición local: k6 sobre un servidor idéntico al de producción, con carga sostenida, va en P16.',
    '',
    `**Resultado:** ${passed ? `todas las consultas con p95 de ${String(P95_LIMIT_MS)} ms o menos y sin errores` : `alguna consulta pasa de ${String(P95_LIMIT_MS)} ms o tuvo errores`}.`,
    '',
    '| Consulta | Como | Pedidos | Errores | p50 | p95 | p99 | Máximo |',
    '|---|---|---:|---:|---:|---:|---:|---:|',
    ...stats.map(
      (row) =>
        `| ${row.query} | ${row.role} | ${String(row.requests)} | ${String(row.errors)} | ${ms(row.p50)} | ${ms(row.p95)} | ${ms(row.p99)} | ${ms(row.max)} |`,
    ),
    '',
    '## Datos y máquina',
    '',
    ...context.dataset.map(([label, value]) => `- ${label}: ${value}`),
    `- Máquina: ${context.machine}`,
    '',
  ].join('\n');
}

interface Session {
  get(path: string): Promise<number>;
  json(path: string): Promise<unknown>;
}

async function session(email: string, password: string): Promise<Session> {
  const base = new URL(process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001').origin;
  const origin = new URL(process.env.APP_URL ?? 'http://localhost:3000').origin;
  const cookieName = process.env.SESSION_COOKIE_NAME ?? 'nc_session';
  const login = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (login.status !== 200) {
    throw new Error(
      `No se pudo entrar como ${email} (${String(login.status)}): ¿corre la API y se corrió seed:load?`,
    );
  }
  const cookie =
    login.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.split(';')[0] ?? '';
  const headers = { Accept: 'application/json', Cookie: cookie };
  return {
    get: async (path) => {
      const response = await fetch(`${base}/api/v1${path}`, { headers });
      await response.arrayBuffer();
      return response.status;
    },
    json: async (path) => {
      const response = await fetch(`${base}/api/v1${path}`, { headers });
      if (response.status !== 200) throw new Error(`${path}: ${String(response.status)}`);
      return await response.json();
    },
  };
}

/** Los pacientes que ve la sesión, con su historia (sin la plantilla). */
async function patientsOf(api: Session): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const page = (await api.json(
      `/patients?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    )) as { patients: { id: string; firstName: string }[]; nextCursor: string | null };
    ids.push(...page.patients.filter((p) => p.firstName !== 'Plantilla').map((p) => p.id));
    cursor = page.nextCursor;
  } while (cursor);
  return ids;
}

const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** El primer día del mes, `back` meses antes del de esa fecha. */
const monthStart = (date: string, back: number): string => {
  const [year = 0, month = 1] = date.split('-').map(Number);
  const index = year * 12 + month - 1 - back;
  return `${String(Math.floor(index / 12))}-${String((index % 12) + 1).padStart(2, '0')}-01`;
};

async function measure(
  api: Session,
  role: string,
  patients: readonly string[],
  requests: number,
  today: string,
): Promise<QueryStats[]> {
  const pick = () => patients[Math.floor(Math.random() * patients.length)] ?? '';
  const queries: readonly (readonly [name: string, path: () => string])[] = [
    ['Dieta, 4 semanas (RF-32)', () => `/patients/${pick()}/analytics/diet`],
    [
      'Dieta, 1 año (RF-32)',
      () => `/patients/${pick()}/analytics/diet?from=${addDays(today, -364)}&to=${today}`,
    ],
    [
      'Tendencia, 24 meses (RN-G09)',
      () => `/patients/${pick()}/analytics/trend?from=${monthStart(today, 23)}&to=${today}`,
    ],
    ['Rutina del programa vigente (RF-33)', () => `/patients/${pick()}/analytics/training`],
    ['Panel con alertas (RF-34)', () => '/analytics/overview'],
  ];
  const stats: QueryStats[] = [];
  for (const [name, path] of queries) {
    for (let i = 0; i < 5; i += 1) await api.get(path());
    const samples: number[] = [];
    let errors = 0;
    for (let i = 0; i < requests; i += 1) {
      const started = performance.now();
      const status = await api.get(path());
      samples.push(performance.now() - started);
      if (status !== 200) errors += 1;
    }
    stats.push(summarize(name, role, samples, errors));
  }
  return stats;
}

if (import.meta.main) {
  try {
    process.loadEnvFile();
  } catch {
    // Sin .env: las variables ya están en el entorno.
  }
  const appEnv = process.env.APP_ENV ?? 'local';
  const password =
    process.env.SEED_DEMO_PASSWORD ?? (appEnv === 'local' ? 'Demostracion-Local-2026' : undefined);
  if (!password) {
    console.error('Falta SEED_DEMO_PASSWORD.');
    process.exit(1);
  }
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const at = argv.indexOf(name);
    return at === -1 ? undefined : argv[at + 1];
  };
  const requests = Number(flag('--requests') ?? 200);
  const out = flag('--out') ?? '../../docs/demos/demo-3-p95.md';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
  try {
    const owner = await session(LOAD_OWNER_EMAIL, password);
    const professional = await session(professionalEmail(1), password);
    const all = await patientsOf(owner);
    const team = await patientsOf(professional);
    if (all.length === 0)
      throw new Error('La organización de carga no tiene pacientes: corre pnpm seed:load.');
    const stats = [
      ...(await measure(owner, 'Dueña', all, requests, today)),
      ...(await measure(professional, 'Profesional', team, requests, today)),
    ];
    console.table(
      stats.map((row) => ({
        consulta: row.query,
        como: row.role,
        errores: row.errors,
        p50: Math.round(row.p50),
        p95: Math.round(row.p95),
        p99: Math.round(row.p99),
        max: Math.round(row.max),
      })),
    );
    const dataset: [string, string][] = [
      ['Pacientes con historia', String(all.length)],
      ['Pacientes de la profesional medida', String(team.length)],
    ];
    const ownerUrl = process.env.DATABASE_OWNER_URL;
    if (ownerUrl) {
      const client = new pg.Client({ connectionString: ownerUrl });
      await client.connect();
      try {
        const count = async (sql: string): Promise<string> => {
          const { rows } = await client.query<{ n: string }>(sql, [LOAD_ORGANIZATION]);
          return Number(rows[0]?.n ?? 0).toLocaleString('es-PE');
        };
        dataset.push(
          [
            'Comidas registradas',
            await count('SELECT count(*) AS n FROM tracking.food_log WHERE organization_id = $1'),
          ],
          [
            'Series registradas',
            await count('SELECT count(*) AS n FROM tracking.set_log WHERE organization_id = $1'),
          ],
          [
            'Días de resumen',
            await count(
              'SELECT count(*) AS n FROM analytics.patient_daily_summary WHERE organization_id = $1',
            ),
          ],
        );
        const size = await client.query<{ size: string }>(
          'SELECT pg_size_pretty(pg_database_size(current_database())) AS size',
        );
        dataset.push(['Tamaño de la base', size.rows[0]?.size ?? '?']);
      } finally {
        await client.end();
      }
    }
    const machine = `${cpus()[0]?.model ?? 'CPU'} (${String(cpus().length)} hilos), ${String(Math.round(totalmem() / 1024 ** 3))} GB de memoria, Node ${process.version}`;
    writeFileSync(out, reportMarkdown(stats, { date: today, machine, dataset }));
    const passed = stats.every((row) => row.p95 <= P95_LIMIT_MS && row.errors === 0);
    console.log(
      `${passed ? 'Cumple' : 'No cumple'} el p95 de ${String(P95_LIMIT_MS)} ms. Informe: ${out}`,
    );
    if (!passed) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
