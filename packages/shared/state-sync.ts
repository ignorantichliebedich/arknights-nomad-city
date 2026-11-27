/** A connection-local, lossless delta stream of an already filtered player view. */
export const STATE_SYNC_VERSION = 1;
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Path = (string | number)[];
export type StateChange =
  ["set", Path, Json] | ["remove", Path] | ["append", Path, number, Json[]];
export type StateFrame<T> =
  | { type: "state"; room: T; sync?: { version: number; sequence: number } }
  | {
      type: "state-delta";
      base: number;
      sequence: number;
      changes: StateChange[];
    };

function object(value: unknown): value is Record<string, Json> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function equal(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (Array.isArray(a))
    return (
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => equal(v, b[i]))
    );
  if (!object(a) || !object(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]))
  );
}
function difference(
  before: Json,
  after: Json,
  path: Path,
  changes: StateChange[],
) {
  if (before === after) return;
  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length === after.length) {
      before.forEach((value, i) =>
        difference(value, after[i], [...path, i], changes),
      );
    } else if (
      before.length < after.length &&
      before.every((v, i) => equal(v, after[i]))
    ) {
      changes.push(["append", path, before.length, after.slice(before.length)]);
    } else changes.push(["set", path, after]);
  } else if (object(before) && object(after)) {
    for (const key of Object.keys(before))
      if (!Object.hasOwn(after, key)) changes.push(["remove", [...path, key]]);
    for (const key of Object.keys(after)) {
      if (!Object.hasOwn(before, key))
        changes.push(["set", [...path, key], after[key]]);
      else difference(before[key], after[key], [...path, key], changes);
    }
  } else changes.push(["set", path, after]);
}

export class StateSender {
  private previous: Json | undefined;
  private sequence = 0;

  encode<T extends object>(room: T): StateFrame<T> | null {
    // Normalize optional properties exactly as JSON on legacy connections does.
    const serialized = JSON.stringify(room);
    const next = JSON.parse(serialized) as Json;
    const changes: StateChange[] = [];
    if (this.previous !== undefined)
      difference(this.previous, next, [], changes);
    if (this.previous !== undefined && !changes.length) return null;
    const sequence = this.sequence + 1;
    const full: StateFrame<T> = {
      type: "state",
      room: next as T,
      sync: { version: STATE_SYNC_VERSION, sequence },
    };
    const delta: StateFrame<T> = {
      type: "state-delta",
      base: this.sequence,
      sequence,
      changes,
    };
    const fullLength =
      serialized.length + JSON.stringify({ ...full, room: null }).length - 4;
    const frame =
      this.previous !== undefined && JSON.stringify(delta).length < fullLength
        ? delta
        : full;
    this.previous = next;
    this.sequence = sequence;
    return frame;
  }
}

/** Copy only the changed ancestors, preserving previous snapshots and stable UI references. */
function changeAt(
  value: Json,
  path: Path,
  change: StateChange,
  depth = 0,
): Json {
  if (depth === path.length) {
    if (change[0] === "set") return change[2];
    if (
      change[0] !== "append" ||
      !Array.isArray(value) ||
      value.length !== change[2] ||
      !Array.isArray(change[3])
    )
      throw new Error("Invalid state change");
    return value.concat(change[3]);
  }
  const key = path[depth];
  if (
    typeof key === "string" &&
    ["__proto__", "prototype", "constructor"].includes(key)
  )
    throw new Error("Unsafe state path");
  if (Array.isArray(value)) {
    if (
      !Number.isSafeInteger(key) ||
      typeof key !== "number" ||
      key < 0 ||
      key >= value.length
    )
      throw new Error("Invalid array path");
    if (change[0] === "remove" && depth === path.length - 1)
      throw new Error("Cannot remove array entries");
    const copy = value.slice();
    copy[key] = changeAt(value[key], path, change, depth + 1);
    return copy;
  }
  if (!object(value) || typeof key !== "string")
    throw new Error("Invalid object path");
  const copy = { ...value };
  if (depth === path.length - 1 && change[0] === "remove") {
    if (!Object.hasOwn(copy, key)) throw new Error("Missing state property");
    delete copy[key];
  } else {
    if (
      !Object.hasOwn(value, key) &&
      !(depth === path.length - 1 && change[0] === "set")
    )
      throw new Error("Missing state path");
    copy[key] = changeAt(value[key], path, change, depth + 1);
  }
  return copy;
}

export class StateReceiver<T extends object> {
  private current: Json | undefined;
  private sequence: number | null = null;

  receive(message: unknown): T | null {
    if (!object(message)) return null;
    if (message.type === "state") {
      if (!object(message.room)) throw new Error("Invalid state snapshot");
      const sync = message.sync;
      if (
        sync !== undefined &&
        (!object(sync) ||
          sync.version !== STATE_SYNC_VERSION ||
          !Number.isSafeInteger(sync.sequence) ||
          (sync.sequence as number) < 1)
      )
        throw new Error("Invalid state sequence");
      this.current = message.room;
      this.sequence = object(sync) ? (sync.sequence as number) : null;
      return this.current as T;
    }
    if (message.type !== "state-delta") return null;
    if (
      this.current === undefined ||
      this.sequence === null ||
      message.base !== this.sequence ||
      message.sequence !== this.sequence + 1 ||
      !Array.isArray(message.changes)
    )
      throw new Error("State sequence mismatch");
    let next = this.current;
    for (const operation of message.changes) {
      if (
        !Array.isArray(operation) ||
        !["set", "remove", "append"].includes(operation[0] as string) ||
        !Array.isArray(operation[1]) ||
        operation[1].length > 32 ||
        operation.length !==
          (operation[0] === "set" ? 3 : operation[0] === "append" ? 4 : 2)
      )
        throw new Error("Invalid state operation");
      next = changeAt(next, operation[1] as Path, operation as StateChange);
    }
    if (!object(next)) throw new Error("Invalid reconstructed state");
    this.current = next;
    this.sequence = message.sequence as number;
    return next as T;
  }
}
