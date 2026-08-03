/** JSON-safe primitive values for all wire-level FamTutor Engine contracts. */
export type JsonPrimitive = string | number | boolean | null;

/** JSON-safe value tree. All DomainRuntime wire payloads must stay within this type. */
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/** JSON-safe object. */
export type JsonObject = { [key: string]: JsonValue };
