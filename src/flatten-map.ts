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
import type { Func } from '@rhombus-toolkit/func';
import type { DeepDictionary, DeepDictionaryItem, Inc } from '@rhombus-toolkit/type-helpers';

type fromEntries<T extends readonly [PropertyKey, any]> = {
  [E in T as E[0]]: E[1];
};

type _flattenMap<T extends DeepDictionaryItem<Func>, prefix extends string = '', CurrentDepth extends number = 0> =
  CurrentDepth extends 10 ? never :
  T extends DeepDictionary<Func> ? {
    [K in keyof T]: _flattenMap<T[K], prefix extends '' ? string & K : `${prefix}.${string & K}`, Inc<CurrentDepth>>
  }[keyof T] : [prefix, T];

export type flattenMap<T extends DeepDictionary<Func>> = fromEntries<_flattenMap<T>>;
export function flattenMap<T extends DeepDictionary<Func>>(map: T): flattenMap<T> {
  const result: any = {};
  const stack = Object.entries(map);
  while (stack.length) {
    const [prefix, mapOrFun] = stack.pop()!;
    if (typeof mapOrFun === 'function') {
      result[prefix] = mapOrFun;
    } else {
      for (const [key, p] of Object.entries(mapOrFun)) {
        stack.push([join(prefix, key), p]);
      }
    }
  }
  return result;
}

function join(...args: string[]): string {
  return args.filter(Boolean).join('.');
}
