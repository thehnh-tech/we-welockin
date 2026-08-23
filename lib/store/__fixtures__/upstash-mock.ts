// An in-process stand-in for the Upstash REST API, so lib/store/redis.ts —
// the backend production actually runs — is exercised by the contract suite
// on a machine with no Redis and no Docker. Before this, the preferred
// backend was the only one nothing tested: the atomic seat script, every
// pipeline, the feed snapshot.
//
// It serves exactly the commands redis.ts issues, and it runs the seat script
// on a real Lua VM (fengari) with redis.call bridged to the same store, so
// the script under test is the one that ships rather than a JavaScript
// restatement of it. That distinction is load-bearing and was measured: with
// a hand-written mirror, changing `<` to `<=` in the capacity check — seven
// students in a room of six — left the suite green.
//
// It is still not Redis. Eviction, clustering, real concurrency and the exact
// error taxonomy are absent, so when a real Redis is reachable (CI, or a
// local hiett/serverless-redis-http container) the contract suite points at
// THAT and never loads this file — see contract.test.ts.

import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
// @ts-expect-error - fengari ships no type declarations
import { lua, lauxlib, lualib, to_luastring } from "fengari";

type ZSet = Map<string, number>;
type Value = string | number | null | Value[];

export type UpstashMock = {
  url: string;
  token: string;
  close: () => Promise<void>;
};

class Store {
  strings = new Map<string, string>();
  hashes = new Map<string, Map<string, string>>();
  zsets = new Map<string, ZSet>();
  expiries = new Map<string, number>();

  private sweep(key: string): void {
    const at = this.expiries.get(key);
    if (at !== undefined && Date.now() > at) {
      this.strings.delete(key);
      this.hashes.delete(key);
      this.zsets.delete(key);
      this.expiries.delete(key);
    }
  }

  exists(key: string): boolean {
    this.sweep(key);
    return this.strings.has(key) || this.hashes.has(key) || this.zsets.has(key);
  }

  hash(key: string): Map<string, string> {
    this.sweep(key);
    let h = this.hashes.get(key);
    if (!h) {
      h = new Map();
      this.hashes.set(key, h);
    }
    return h;
  }

  zset(key: string): ZSet {
    this.sweep(key);
    let z = this.zsets.get(key);
    if (!z) {
      z = new Map();
      this.zsets.set(key, z);
    }
    return z;
  }

  string(key: string): string | undefined {
    this.sweep(key);
    return this.strings.get(key);
  }

  expire(key: string, seconds: number, nx = false): 0 | 1 {
    if (!this.exists(key)) return 0;
    if (nx && this.expiries.has(key)) return 0;
    this.expiries.set(key, Date.now() + seconds * 1000);
    return 1;
  }

  del(key: string): void {
    this.strings.delete(key);
    this.hashes.delete(key);
    this.zsets.delete(key);
    this.expiries.delete(key);
  }
}

// Runs the script for real, on a Lua VM, with redis.call bridged to the same
// store the REST commands use. This is the difference between testing the
// seat script and testing a JavaScript restatement of it: a hand-written
// mirror agrees with itself by construction, so an off-by-one in the real
// Lua (`<` becoming `<=`, seven students in a room of six) sails straight
// through. Verified by mutation: with the mirror the suite stayed green,
// with this it fails.
function runLuaScript(
  store: Store,
  scripts: Map<string, string>,
  script: string,
  keys: string[],
  argv: string[]
): Value {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);

  lua.lua_newtable(L);
  lua.lua_pushstring(L, to_luastring("call"));
  lua.lua_pushcfunction(L, (state: unknown) => {
    const top = lua.lua_gettop(state);
    const args: string[] = [];
    for (let i = 1; i <= top; i++) args.push(lua.lua_tojsstring(state, i));
    pushValue(state, execCommand(store, scripts, args));
    return 1;
  });
  lua.lua_settable(L, -3);
  lua.lua_setglobal(L, to_luastring("redis"));

  for (const [name, list] of [
    ["KEYS", keys],
    ["ARGV", argv],
  ] as const) {
    lua.lua_createtable(L, list.length, 0);
    list.forEach((item, i) => {
      lua.lua_pushstring(L, to_luastring(item));
      lua.lua_rawseti(L, -2, i + 1);
    });
    lua.lua_setglobal(L, to_luastring(name));
  }

  if (lauxlib.luaL_dostring(L, to_luastring(script)) !== lua.LUA_OK) {
    throw new Error(`upstash-mock: Lua error: ${lua.lua_tojsstring(L, -1)}`);
  }
  return lua.lua_isnil(L, -1) ? null : lua.lua_tointeger(L, -1);
}

// Marshal a command result back onto the Lua stack, following Redis's own
// conversion rules: nil answers arrive in Lua as `false`.
function pushValue(L: unknown, value: Value): void {
  if (value === null) {
    lua.lua_pushboolean(L, false);
  } else if (typeof value === "number") {
    lua.lua_pushinteger(L, value);
  } else if (Array.isArray(value)) {
    lua.lua_createtable(L, value.length, 0);
    value.forEach((item, i) => {
      pushValue(L, item);
      lua.lua_rawseti(L, -2, i + 1);
    });
  } else {
    lua.lua_pushstring(L, to_luastring(String(value)));
  }
}

// Sorted-set order: by score, ties broken lexicographically, as Redis does.
function sorted(z: ZSet): [string, number][] {
  return [...z.entries()].sort(
    (a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
  );
}

function resolveRange(len: number, start: number, stop: number) {
  const s = start < 0 ? Math.max(0, len + start) : start;
  const e = stop < 0 ? len + stop : Math.min(stop, len - 1);
  return { s, e };
}

function execCommand(
  store: Store,
  scripts: Map<string, string>,
  cmd: (string | number)[]
): Value {
  const name = String(cmd[0]).toUpperCase();
  const key = cmd[1] !== undefined ? String(cmd[1]) : "";
  const rest = cmd.slice(2);

  switch (name) {
    case "HSET": {
      const h = store.hash(key);
      let added = 0;
      for (let i = 0; i < rest.length; i += 2) {
        const field = String(rest[i]);
        if (!h.has(field)) added++;
        h.set(field, String(rest[i + 1]));
      }
      return added;
    }
    case "HGET": {
      const v = store.hash(key).get(String(rest[0]));
      return v === undefined ? null : v;
    }
    case "HGETALL": {
      const h = store.hash(key);
      if (h.size === 0) return [];
      const out: Value[] = [];
      for (const [f, v] of h) out.push(f, v);
      return out;
    }
    case "HDEL": {
      const h = store.hash(key);
      let n = 0;
      for (const f of rest) if (h.delete(String(f))) n++;
      return n;
    }
    case "ZADD": {
      const z = store.zset(key);
      let added = 0;
      for (let i = 0; i < rest.length; i += 2) {
        const member = String(rest[i + 1]);
        if (!z.has(member)) added++;
        z.set(member, Number(rest[i]));
      }
      return added;
    }
    case "ZSCORE": {
      const v = store.zset(key).get(String(rest[0]));
      return v === undefined ? null : String(v);
    }
    case "ZCARD":
      return store.zset(key).size;
    case "ZREM": {
      const z = store.zset(key);
      let n = 0;
      for (const m of rest) if (z.delete(String(m))) n++;
      return n;
    }
    case "ZRANGE": {
      const flags = rest.slice(2).map((t) => String(t).toUpperCase());
      let arr = sorted(store.zset(key));
      if (flags.includes("REV")) arr.reverse();
      const range = resolveRange(arr.length, Number(rest[0]), Number(rest[1]));
      arr =
        range.s > range.e || range.s >= arr.length
          ? []
          : arr.slice(range.s, range.e + 1);
      const withScores = flags.includes("WITHSCORES");
      const out: Value[] = [];
      for (const [member, score] of arr) {
        out.push(member);
        if (withScores) out.push(String(score));
      }
      return out;
    }
    case "ZRANGEBYSCORE": {
      // Only what the seat script asks for: a numeric or -inf/+inf bound,
      // optionally exclusive with a leading "(".
      const bound = (raw: string, whenInfinite: number): number => {
        const t = String(raw);
        if (t.endsWith("inf")) return whenInfinite;
        return Number(t.startsWith("(") ? t.slice(1) : t);
      };
      const minRaw = String(rest[0]);
      const maxRaw = String(rest[1]);
      const min = bound(minRaw, -Infinity);
      const max = bound(maxRaw, Infinity);
      const minExclusive = minRaw.startsWith("(");
      const maxExclusive = maxRaw.startsWith("(");
      return sorted(store.zset(key))
        .filter(([, score]) => {
          const okMin = minExclusive ? score > min : score >= min;
          const okMax = maxExclusive ? score < max : score <= max;
          return okMin && okMax;
        })
        .map(([member]) => member);
    }
    case "ZREMRANGEBYRANK": {
      const z = store.zset(key);
      const arr = sorted(z);
      const range = resolveRange(arr.length, Number(rest[0]), Number(rest[1]));
      if (range.s > range.e || range.s >= arr.length) return 0;
      let n = 0;
      for (const [member] of arr.slice(range.s, range.e + 1)) {
        z.delete(member);
        n++;
      }
      return n;
    }
    case "EXPIRE": {
      const nx = rest.slice(1).some((t) => String(t).toUpperCase() === "NX");
      return store.expire(key, Number(rest[0]), nx);
    }
    case "EXISTS": {
      let n = 0;
      for (const k of cmd.slice(1)) if (store.exists(String(k))) n++;
      return n;
    }
    case "INCR": {
      const next = Number(store.string(key) ?? 0) + 1;
      store.strings.set(key, String(next));
      return next;
    }
    case "GET": {
      const v = store.string(key);
      return v === undefined ? null : v;
    }
    case "SET": {
      const flags = rest.slice(1).map((t) => String(t).toUpperCase());
      if (flags.includes("NX") && store.exists(key)) return null;
      store.strings.set(key, String(rest[0]));
      store.expiries.delete(key);
      const exAt = flags.indexOf("EX");
      if (exAt >= 0) store.expire(key, Number(rest[1 + exAt + 1]));
      return "OK";
    }
    case "DEL": {
      let n = 0;
      for (const k of cmd.slice(1)) {
        if (store.exists(String(k))) n++;
        store.del(String(k));
      }
      return n;
    }
    case "EVAL":
    case "EVALSHA": {
      const script =
        name === "EVAL"
          ? String(cmd[1])
          : scripts.get(String(cmd[1]).toLowerCase());
      // The SDK's createScript sends EVALSHA first and falls back to EVAL on
      // this exact error, so answering it is what exercises that path.
      if (!script) {
        throw new Error("NOSCRIPT No matching script. Please use EVAL.");
      }
      if (name === "EVAL") {
        scripts.set(createHash("sha1").update(script).digest("hex"), script);
      }
      const numKeys = Number(cmd[2]);
      return runLuaScript(
        store,
        scripts,
        script,
        cmd.slice(3, 3 + numKeys).map(String),
        cmd.slice(3 + numKeys).map(String)
      );
    }
    default:
      throw new Error(`upstash-mock: unsupported command ${name}`);
  }
}

// The SDK asks for base64-encoded results by default; mirror that when it does.
function encode(value: Value, base64: boolean): unknown {
  if (value === null || typeof value === "number") return value;
  if (Array.isArray(value)) return value.map((v) => encode(v, base64));
  return base64
    ? Buffer.from(String(value), "utf8").toString("base64")
    : String(value);
}

export async function startUpstashMock(): Promise<UpstashMock> {
  const store = new Store();
  const scripts = new Map<string, string>();

  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const base64 =
        String(req.headers["upstash-encoding"] ?? "").toLowerCase() === "base64";
      res.setHeader("content-type", "application/json");
      try {
        const parsed = JSON.parse(body || "[]");
        if ((req.url ?? "").includes("pipeline")) {
          const results = (parsed as (string | number)[][]).map((c) => ({
            result: encode(execCommand(store, scripts, c), base64),
          }));
          res.end(JSON.stringify(results));
        } else {
          const result = execCommand(store, scripts, parsed);
          res.end(JSON.stringify({ result: encode(result, base64) }));
        }
      } catch (err) {
        // Upstash reports command errors as 400 + {error}, which the SDK
        // turns into a thrown UpstashError.
        res.statusCode = 400;
        res.end(JSON.stringify({ error: String((err as Error)?.message) }));
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}`,
    token: "upstash-mock-token",
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
