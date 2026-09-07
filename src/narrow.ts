/**
 * Runtime narrowing for the tenant control-plane calls.
 *
 * Several `TenantClient` namespace methods are typed `Promise<unknown>`
 * in SDK 5.2 even though the response shapes are exported as types.
 * Casting would hide a wire change behind a compile-time lie, so these
 * check the fields actually read and name what was missing.
 */
import type { TenantMeResponse } from "@terminal3/t3n-sdk";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, path: string, field: string): string {
  if (!isRecord(value)) {
    throw new Error(`${path}: expected an object, got ${value === null ? "null" : typeof value}`);
  }
  const found = value[field];
  if (typeof found !== "string") {
    throw new Error(
      `${path}: expected a string "${field}", got ${found === undefined ? "nothing" : typeof found}`,
    );
  }
  return found;
}

/** Narrow a `tenant.tenant.me()` response to the fields this app reads. */
export function asTenantMe(value: unknown): Pick<TenantMeResponse, "tenant" | "status" | "label"> {
  const tenant = requireString(value, "tenant.me", "tenant");
  const status = requireString(value, "tenant.me", "status");
  // `label` is documented as present but empty for an unlabelled tenant.
  const label = isRecord(value) && typeof value["label"] === "string" ? value["label"] : "";
  return { tenant, status: status as TenantMeResponse["status"], label };
}

/**
 * Narrow a `tenant.maps.create()` response to the canonical map name.
 *
 * The SDK exports a `MapResponse` type claiming `name`, `tail`,
 * `visibility`, `writers` and `readers`, but the wire actually returns a
 * single `map_name`. Trusting the exported type produced a confusing
 * failure AFTER the map had already been created, so this reads what the
 * server really sends and falls back to the tail that was requested.
 */
export function mapNameFrom(value: unknown, requestedTail: string): string {
  if (isRecord(value) && typeof value["map_name"] === "string") {
    return value["map_name"];
  }
  // Older or future shapes may use `name`; either is enough to report.
  if (isRecord(value) && typeof value["name"] === "string") {
    return value["name"];
  }
  return requestedTail;
}
