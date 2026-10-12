// Prohibido (web-no-database): ni la E2E de la web lee la base; lo cifrado lo prueba la integración de la API.
import pg from 'pg';

export const client = new pg.Client();
