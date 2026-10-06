/**
 * Desarrollo local: carga apps/api/.env (copia de env.local.example) antes que cualquier otro módulo, porque
 * la configuración se valida al importarse. En los contenedores las variables llegan del entorno y no hay
 * archivo. main.ts y worker.ts lo importan primero.
 */
try {
  process.loadEnvFile();
} catch {
  // Sin .env: las variables ya están en el entorno.
}
