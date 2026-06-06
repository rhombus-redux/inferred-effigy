import type { DeepDictionary, Dictionary, Func, Inc, Join } from './toolkit-types.js';
import { flattenMap } from './flatten-map.js';

/** The constraint for handler trees: arbitrarily nested string-keyed maps with function leaves. */
export type HandlerMap = DeepDictionary<Func>;

export type Message<T extends string, P extends readonly any[]> = { type: T, payload: P };

/**
 * Registry of payload transforms — how a handler's parameter list maps to its
 * creator's parameter list / message payload. Augmentable from user code via
 * declaration merging; pass the key to `withTransform`.
 */
export interface PayloadTransforms<TArgs extends readonly any[] = any> {
  /** identity — creator takes exactly the handler's parameters */
  default: TArgs;
  /** drops the leading state parameter — creator takes the handler's remaining parameters */
  reducer: TArgs extends readonly [any, ...infer Rest] ? Readonly<Rest> : readonly [];
}

export type TransformKey = keyof PayloadTransforms<any>;
type Transform<Args extends readonly any[], Key extends TransformKey> = PayloadTransforms<Args>[Key];

type MessagesFlat<T extends Dictionary<Func>, Key extends TransformKey> = {
  // Coerce the key with a template literal rather than `string & K`: the latter
  // is `never` for a numeric-literal key (`string & 1`), silently dropping it.
  // Template coercion stringifies it to match the runtime's Object.entries.
  [K in keyof T]: T[K] extends Func<infer Args> ? Message<`${K & (string | number)}`, Transform<Args, Key>> : never;
}[keyof T];
/** Union of every message the handler tree can produce under the given transform. */
export type Messages<Map extends HandlerMap, Key extends TransformKey = 'default'> = MessagesFlat<flattenMap<Map>, Key>;

/**
 * Sentinel marking "no onInvoke callback supplied" in {@link Creators}. A
 * dedicated unique symbol (not `never`) so that an onInvoke that legitimately
 * returns `never` — e.g. a dispatch that always throws — is not mistaken for
 * the no-callback case and does not fall back to the message branch.
 * @internal
 */
declare const NoReturn: unique symbol;
/** @internal */
export type NoReturn = typeof NoReturn;

/**
 * The handler tree transposed: same shape, every leaf a creator function.
 *
 * Recursion is bounded by the same depth ceiling the vendored `flattenMap`
 * type enforces (see {@link FlattenMap}): the deepest leaf path that resolves
 * is 9 nesting levels. Beyond that the branch collapses to `never`, exactly
 * as `Messages` does — so an over-deep tree fails loudly and consistently on
 * both the creator and message sides rather than typing callable leaves whose
 * messages silently vanish.
 *
 * @typeParam Return - the onInvoke return type; defaults to {@link NoReturn}
 *   (no callback), which makes each leaf return its `Message` directly.
 * @typeParam CurrentDepth - internal recursion counter; do not pass explicitly.
 */
export type Creators<
  T extends Func | HandlerMap,
  Key extends TransformKey,
  Return = NoReturn,
  Prefix extends string = '',
  CurrentDepth extends number = 0,
> =
  CurrentDepth extends 10 ? never :
  T extends HandlerMap ? {
    // `${K & (string | number)}` (not `string & K`) so numeric-literal keys
    // stringify into the dotted path instead of collapsing to `never`.
    [K in keyof T]: Creators<T[K], Key, Return, Join<[Prefix, `${K & (string | number)}`], '.'>, Inc<CurrentDepth>>
  } :
  // `[NoReturn] extends [Return]` (not the reverse): `never` is assignable to
  // every tuple, so `[Return] extends [NoReturn]` would be true even when
  // Return is `never` — misclassifying a never-returning onInvoke as the
  // no-callback case. Asking instead whether NoReturn is assignable to Return
  // is true only when Return *is* NoReturn.
  T extends Func<infer Args> ? Func<Transform<Args, Key>, ([NoReturn] extends [Return] ? Message<Prefix, Transform<Args, Key>> : Return)> :
  never;

export class EffigyBuilder<Map extends HandlerMap, Key extends TransformKey = 'default'> {
  readonly #map: Map;
  readonly #transformKey: Key;
  /** Prefer the `effigy()` factory. */
  constructor(map: Map, transformKey: Key) {
    this.#map = map;
    this.#transformKey = transformKey;
  }
  /** The transform key this builder is configured with (transforms are type-level only). */
  get transformKey(): Key {
    return this.#transformKey;
  }
  withTransform<K extends TransformKey>(key: K): EffigyBuilder<Map, K> {
    return new EffigyBuilder(this.#map, key);
  }
  squash(): flattenMap<Map> {
    return flattenMap(this.#map);
  }
  getCreators(): Creators<Map, Key>;
  getCreators<TReturn>(onInvoke: Func<[msg: Messages<Map, Key>], TReturn>): Creators<Map, Key, TReturn>;
  getCreators(onInvoke?: any): any {
    function _getCreators(path?: string): any {
      return new Proxy(() => { }, {
        get(target, prop) {
          // Symbol props (Symbol.iterator, Symbol.toPrimitive, …) can't be
          // joined into a dotted path — passing one to String#join throws
          // `Cannot convert a Symbol value to a string`. Forward them to the
          // target so `String(node)`, `Array.from(node)`, template coercion
          // etc. behave like an ordinary function object.
          if (typeof prop === 'symbol') {
            return Reflect.get(target, prop);
          }
          // `then` is reserved: if a node exposed a callable `then`, every node
          // would look like a thenable and `await node` / `Promise.resolve(node)`
          // would hang forever (the apply trap never calls resolve/reject).
          // Returning undefined makes nodes non-thenable, so awaiting one yields
          // the node itself. `then` therefore cannot be used as a handler key.
          if (prop === 'then') {
            return undefined;
          }
          // Primitive-coercion hooks: forward to the function target so
          // `String(node)` / template interpolation coerce like an ordinary
          // function object instead of recursing into a fresh proxy (which has
          // no primitive form and throws "Cannot convert object to primitive
          // value"). These names — like `then` — are reserved, not usable as
          // handler keys.
          if (prop === 'toString' || prop === 'valueOf') {
            return Reflect.get(target, prop);
          }
          return _getCreators([path, prop].filter(Boolean).join('.'));
        },
        apply(target, thisArg, payload: any) {
          if (!path) {
            throw new Error('Cannot invoke the root command map object');
          }
          const msg = { type: path, payload };
          if (onInvoke) {
            return onInvoke(msg);
          }
          return msg;
        },
      });
    }
    return _getCreators();
  }
}

/** Front door: wrap a handler tree, then `.withTransform(...)` / `.getCreators(...)`. */
export function effigy<Map extends HandlerMap>(handlers: Map): EffigyBuilder<Map, 'default'> {
  return new EffigyBuilder(handlers, 'default');
}
