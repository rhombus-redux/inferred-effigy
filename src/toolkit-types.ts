// Vendored type aliases from @rhombus-toolkit/*.
//
// The toolkit packages can't be referenced by the *published* d.ts: a bare
// `import … from '@rhombus-toolkit/type-helpers'` survives into dist/index.d.ts,
// and that package exposes its raw `src/*.ts` sources as its `"types"` (no
// exports map, no `"type"` field). Any consumer typechecking against our d.ts
// then pulls those raw sources into their own program and fails (TS1036 in
// ambient contexts, TS1479 under nodenext). tsup's `dts: { resolve: true }`
// could not inline them (it follows neither the raw-.ts nor the .d.ts-only
// entry of these packages), so we hand-vendor the handful of aliases we use.
//
// Each alias below mirrors the upstream definition it replaces, read from the
// installed node_modules copies:
//   - Func                     @rhombus-toolkit/func        src/index.d.ts
//   - Dictionary / DeepDictionary / DeepDictionaryItem
//                              @rhombus-toolkit/type-helpers src/deep-record.d.ts
//   - Join (+ Stringable, ClearEmpties)
//                              @rhombus-toolkit/type-helpers src/string.d.ts
//   - Inc                      @rhombus-toolkit/type-helpers src/counter.d.ts
//                              (upstream ships a 4096-entry lookup table; we
//                               only need 0..10 — the depth-guard ceiling — so
//                               a small explicit tuple suffices and stays
//                               self-contained).
//
// TODO: drop this module and import from @rhombus-toolkit/* once those packages
// publish self-contained declaration files (an exports map pointing at emitted
// .d.ts, or inlinable types tsup can resolve).

/** A function with a typed parameter tuple and return type. */
export type Func<Args extends readonly any[] = any[], Return = any> = (...args: Args) => Return;

/** A flat string-keyed record. */
export type Dictionary<T = any> = Record<string, T>;

/** An arbitrarily nested string-keyed record whose leaves are `T`. */
export type DeepDictionary<T = any> = {
  [K in string]: DeepDictionaryItem<T>;
};
/** A node in a {@link DeepDictionary}: either a `T` leaf or a nested map. */
export type DeepDictionaryItem<T = any> = T | DeepDictionary<T>;

type Stringable = string | number | boolean | bigint | undefined | null;

/** Joins a tuple of stringables with delimiter `D`, dropping empty segments. */
export type Join<T extends readonly Stringable[], D extends string> = _Join<ClearEmpties<T>, D>;
type _Join<T extends readonly Stringable[], D extends string> =
  T extends [] ? '' :
  T extends [Stringable] ? `${T[0]}` :
  T extends [Stringable, ...infer U extends Stringable[]] ? `${T[0]}${D}${_Join<U, D>}` :
  string;

type ClearEmpties<T extends readonly Stringable[]> = _ClearEmpties<T, []>;
type _ClearEmpties<T extends readonly Stringable[], Result extends readonly Stringable[]> =
  T extends [infer X extends Stringable, ...infer Rest extends readonly Stringable[]]
    ? _ClearEmpties<Rest, X extends '' ? Result : [...Result, X]>
    : Result;

/**
 * Increments a numeric literal by one. Upstream ships a large lookup table;
 * this library only increments a 0-based depth counter up to the depth ceiling
 * (10), so the table only needs to cover that range.
 */
export type Inc<T extends number> = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11][T];
