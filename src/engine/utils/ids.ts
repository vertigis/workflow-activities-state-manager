/**
 * Generates a workflow identifier.
 *
 * Uses crypto.randomUUID() when available and formats the
 * result using uppercase braces to match existing engine IDs.
 *
 * Example:
 *   {550E8400-E29B-41D4-A716-446655440000}
 *
 * Falls back to a non-cryptographic identifier in runtimes
 * where randomUUID() is unavailable.
 */
export function guid(): string {

    const uuid =
        globalThis.crypto?.randomUUID?.();

    return uuid
        ? `{${uuid.toUpperCase()}}`
        : `{${Math.random().toString(16).slice(2)}-${Date.now()}}`;
}

/**
 * Returns the current UTC timestamp in milliseconds since
 * the Unix epoch.
 */
export function nowUtc(): number {
    return Date.now();
}