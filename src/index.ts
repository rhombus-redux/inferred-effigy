import type { DeepDictionary, Dictionary, Func, Inc, Join } from './toolkit-types.js';
import { flattenMap, type FlattenMap } from './flatten-map.js';

/**
 * The constraint for handler trees: arbitrarily nested string-keyed maps with
 * function leaves. Use `satisfies HandlerMap` on a handler object to get an
 * early error if a non-function leaf slips in.
 *
 * Keys must be literal strings (or numeric literals, which stringify); an
 * index-signature map degrades the message `type` to `string`. See the
 * Limitations section of the README.
 */
export type HandlerMap = DeepDictionary<Func>;

/**
 * A single message produced by a creator: the dotted-path string literal `T`
 * as `type`, and the payload tuple `P` as shaped by the active transform.
 */
export type Message<T extends string, P extends readonly any[]> = { type: T, payload: P };

/**
 * Registry of payload transforms — how a handler's parameter list maps to its
 * creator's parameter list / message payload. Augment it from user code with
 * declaration merging to register custom transforms, then pass the key to
 * {@link EffigyBuilder.withTransform}.
 *
 * Augmentation is **compilation-global**: merging a new key widens
 * {@link TransformKey} for every `effigy` user in the same TypeScript program,
 * not just the file that declares it.
 *
 * @typeParam TArgs - the handler's parameter tuple; each entry maps it to the
 *   creator's parameter tuple under that transform.
 */
export interface PayloadTransforms<TArgs extends readonly any[] = any> {
  /** identity — creator takes exactly the handler's parameters (mutable tuple) */
  default: TArgs;
  /** drops the leading state parameter — creator takes the handler's remaining parameters */
  reducer: TArgs extends readonly [any, ...infer Rest] ? Readonly<Rest> : readonly [];
}

/**
 * The union of every registered transform name (the keys of
 * {@link PayloadTransforms}). Widens automatically when `PayloadTransforms` is
 * augmented — compilation-globally.
 */
export type TransformKey = keyof PayloadTransforms<any>;
type Transform<Args extends readonly any[], Key extends TransformKey> = PayloadTransforms<Args>[Key];

type MessagesFlat<T extends Dictionary<Func>, Key extends TransformKey> = {
  // Coerce the key with a template literal rather than `string & K`: the latter
  // is `never` for a numeric-literal key (`string & 1`), silently dropping it.
  // Template coercion stringifies it to match the runtime's Object.entries.
  [K in keyof T]: T[K] extends Func<infer Args> ? Message<`${K & (string | number)}`, Transform<Args, Key>> : never;
}[keyof T];
/** Union of every message the handler tree can produce under the given transform. */
export type Messages<Map extends HandlerMap, Key extends TransformKey = 'default'> = MessagesFlat<FlattenMap<Map>, Key>;

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

/**
 * The builder returned by {@link effigy} and {@link EffigyBuilder.withTransform}.
 * Holds the handler tree and the active transform key; every method returns a
 * new instance rather than mutating this one.
 */
export class EffigyBuilder<Map extends HandlerMap, Key extends TransformKey = 'default'> {
  readonly #map: Map;
  readonly #transformKey: Key;
  /** Prefer the {@link effigy} factory. */
  constructor(map: Map, transformKey: Key) {
    this.#map = map;
    this.#transformKey = transformKey;
  }
  /** The transform key this builder is configured with (transforms are type-level only). */
  get transformKey(): Key {
    return this.#transformKey;
  }
  /**
   * Returns a new builder with the transform key set to `K`; does not mutate
   * this one. `K` must be a {@link TransformKey}. The switch is type-level only
   * — it changes what TypeScript infers for creator parameter lists and the
   * {@link Messages} union, never any runtime behaviour.
   */
  withTransform<K extends TransformKey>(key: K): EffigyBuilder<Map, K> {
    return new EffigyBuilder(this.#map, key);
  }
  /**
   * Flattens the handler tree to a single-level record keyed by dotted path.
   * Leaf functions are reference-identical to the originals (no wrapping), and
   * the result is independent of the transform key.
   *
   * @throws if a leaf is neither a function nor a plain nested map (the error
   *   names the dotted path and the value's type), or if a dotted key collides
   *   with a nested path (e.g. `{ 'a.b': f, a: { b: g } }`).
   */
  squash(): FlattenMap<Map> {
    return flattenMap(this.#map);
  }
  /**
   * Builds the creator tree: the same shape as the handler tree, but every leaf
   * is a message creator returning `Message<path, payload>`. The root proxy is
   * not callable — invoking it directly throws.
   */
  getCreators(): Creators<Map, Key>;
  /**
   * Builds the creator tree, dispatch-bound: every leaf passes its message to
   * `onInvoke` and returns that callback's result instead of the raw message.
   * `onInvoke` receives the discriminated {@link Messages} union, so narrowing
   * on `msg.type` yields the exact payload type for that path.
   *
   * @param onInvoke - called with each leaf's `{ type, payload }`; its return
   *   type becomes every creator's return type.
   */
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

/**
 * Front door: wrap a handler tree and return an {@link EffigyBuilder}
 * preconfigured with the `'default'` transform. Chain `.withTransform(...)` to
 * change the payload shape and `.getCreators(...)` / `.squash()` to consume it.
 *
 * Handler keys must be literal strings (numeric literals stringify); the tree
 * may nest up to 9 levels deep — beyond that the types collapse to `never`.
 * See the README Limitations section.
 *
 * @param handlers - an arbitrarily nested tree of string-keyed objects whose
 *   leaves are functions. Use `satisfies HandlerMap` for early leaf checks.
 */
export function effigy<Map extends HandlerMap>(handlers: Map): EffigyBuilder<Map, 'default'> {
  return new EffigyBuilder(handlers, 'default');
}
