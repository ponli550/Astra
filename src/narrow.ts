/**
 * Runtime narrowing for the tenant control-plane calls.
 *
 * Several `TenantClient` namespace methods are typed `Promise<unknown>`
 * in SDK 5.2 even though the response shapes are exported as types.
 * Casting would hide a wire change behind a compile-time lie, so these
 * check the fields actually read and name what was missing.
 */
import type { MapResponse, TenantMeResponse } from "@terminal3/t3n-sdk";

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

/** Narrow a `tenant.maps.create()` response to the fields this app reads. */
export function asMapResponse(value: unknown): Pick<MapResponse, "name" | "tail"> {
  return {
    name: requireString(value, "maps.create", "name"),
    tail: requireString(value, "maps.create", "tail"),
  };
}
