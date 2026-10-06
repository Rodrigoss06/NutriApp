import { canonicalJson } from './canonical-json.js';
import { sha256Hex } from './sha256.js';

export { canonicalJson, type JsonObject, type JsonValue } from './canonical-json.js';
export { sha256Hex } from './sha256.js';

/** inputsHash = SHA-256 del JSON canónico de los insumos (RN-D01). */
export const inputsHash = (inputs: unknown): string => sha256Hex(canonicalJson(inputs));
