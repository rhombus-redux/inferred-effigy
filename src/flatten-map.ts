// Vendored runtime copy of `flattenMap` from @rhombus-toolkit/type-helpers.
//
// type-helpers@1.10.0 ships `flattenMap` (type + runtime), but its package root
// is not importable at runtime: `lib/index.js` re-exports with extensionless
// ESM specifiers (`export * from './array'`) while the package declares no
// `"type": "module"` and no `"exports"` map, so both `require()` and `import`
// of the root throw `ERR_MODULE_NOT_FOUND` before `flattenMap` is reached. The
// only working entry is the private subpath `.../lib/flattenMap.js`, which is
// not a stable public export. Until type-helpers ships a loadable root (an
// `"exports"` map or extensioned specifiers), the runtime stays vendored here.
//
// TODO: delete this module and re-export flattenMap from
// @rhombus-toolkit/type-helpers once a version with a runtime-loadable root is
// published.
import type { DeepDictionary, DeepDictionaryItem, Func, Inc } from './toolkit-types.js';

type fromEntries<T extends readonly [PropertyKey, any]> = {
  [E in T as E[0]]: E[1];
};

type _flattenMap<T extends DeepDictionaryItem<Func>, prefix extends string = '', CurrentDepth extends number = 0> =
  CurrentDepth extends 10 ? never :
  T extends DeepDictionary<Func> ? {
    // `${K & (string | number)}` (not `string & K`) so a numeric-literal key
    // stringifies into the dotted path instead of collapsing to `never`,
    // matching the runtime's Object.entries key stringification.
    [K in keyof T]: _flattenMap<T[K], prefix extends '' ? `${K & (string | number)}` : `${prefix}.${K & (string | number)}`, Inc<CurrentDepth>>
  }[keyof T] : [prefix, T];

export type flattenMap<T extends DeepDictionary<Func>> = fromEntries<_flattenMap<T>>;
export function flattenMap<T extends DeepDictionary<Func>>(map: T): flattenMap<T> {
  const result: any = {};
  const stack = Object.entries(map);
  while (stack.length) {
    const [prefix, mapOrFun] = stack.pop()!;
    if (typeof mapOrFun === 'function') {
      // A dotted leaf key (`'a.b'`) and a nested path (`a: { b }`) flatten to
      // the same dotted key; without this guard one silently overwrites the
      // other, order-dependently. Fail loudly naming the collision.
      if (prefix in result) {
        throw new Error(
          `inferred-effigy: duplicate handler at "${prefix}" — a dotted key collides with a nested path`,
        );
      }
      result[prefix] = mapOrFun;
    } else if (isPlainObject(mapOrFun)) {
      for (const [key, p] of Object.entries(mapOrFun)) {
        stack.push([join(prefix, key), p]);
      }
    } else {
      // Anything that is neither a function nor a plain nested map is an
      // invalid leaf. Object.entries on it would either silently drop the key
      // (primitives, arrays) or throw an opaque "Cannot convert undefined or
      // null to object" with no path context. Throw a library-attributable
      // error naming the offending path and the value's type instead.
      throw new Error(
        `inferred-effigy: invalid handler at "${prefix}" — expected function or nested map, got ${typeName(mapOrFun)}`,
      );
    }
  }
  return result;
}

/** True for ordinary `{ … }` maps; false for null, arrays, class instances. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** A human-readable type label for an invalid-leaf error message. */
function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function join(...args: string[]): string {
  return args.filter(Boolean).join('.');
}
