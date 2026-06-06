# @rhombus-redux/inferred-effigy

Like `createSlice`, but arbitrary-depth and decoupled from Redux. Type-level tree transposition with a tiny proxy runtime.

## The problem

You have a deep tree of handler functions — reducers, RPC stubs, command processors. You want the exact same tree back, but with every leaf transposed into a typed message creator: the dotted path becomes the `type` string, the handler's parameters become the payload, and the whole set collapses into a discriminated union. The alternative is maintaining string literals by hand, running codegen, or accepting `any` types at the dispatch boundary. `inferred-effigy` does the transposition at the type level, with a ~30-line Proxy runtime that needs no knowledge of the tree's shape.

## Install

```sh
npm install @rhombus-redux/inferred-effigy
```

Requires TypeScript 5.x. Strict mode is recommended — the conditional types that drive the transform inference assume non-widened tuples.

## Quick start

Define a handler tree where every leaf is a function. With the `'reducer'` transform, the leading state parameter is dropped from each creator's signature:

```ts
import { effigy, type Messages } from '@rhombus-redux/inferred-effigy';

const handlers = {
  increment(state: number, by: number) { return state + by; },
  user: {
    rename(state: number, name: string) { return state; },
    avatar: {
      clear(state: number) { return state; },
    },
  },
};

const slice = effigy(handlers).withTransform('reducer');
const creators = slice.getCreators();

creators.increment(5);
// => { type: 'increment', payload: [5] }

creators.user.rename('ada');
// => { type: 'user.rename', payload: ['ada'] }

creators.user.avatar.clear();
// => { type: 'user.avatar.clear', payload: [] }

// The inferred type of the deep leaf:
// creators.user.avatar.clear : Func<readonly [], Message<'user.avatar.clear', readonly []>>

type Action = Messages<typeof handlers, 'reducer'>;
// | { type: 'increment';           payload: readonly [by: number]   }
// | { type: 'user.rename';         payload: readonly [name: string] }
// | { type: 'user.avatar.clear';   payload: readonly []             }
```

## Dispatch-bound creators

Pass a callback to `getCreators` and every creator returns that callback's result instead of the raw message. The callback receives the full discriminated union, so narrowing on `msg.type` gives you exact payload types:

```ts
const creators = effigy(handlers)
  .withTransform('reducer')
  .getCreators((msg: Messages<typeof handlers, 'reducer'>) => store.dispatch(msg));

// msg is the discriminated union — narrowing works:
// if (msg.type === 'user.rename') msg.payload is readonly [name: string]

creators.user.rename('ada');
// => store.dispatch({ type: 'user.rename', payload: ['ada'] })
// return type: whatever store.dispatch returns
```

The `onInvoke` signature is `(msg: Messages<Map, Key>) => TReturn`. When present, every creator's return type becomes `TReturn`; when absent, creators return `Message<path, payload>` directly.

## Payload transforms

A transform describes how a handler's parameter list maps to its creator's parameter list. The key distinction: **transforms are type-level only**. The runtime always passes whatever arguments you supply directly through as the payload — the transform key you choose never changes runtime behaviour, only what TypeScript infers.

Built-in transforms:

- `'default'` — identity. The creator accepts exactly the same parameters as the handler.
- `'reducer'` — drops the leading parameter. Given `(state: S, x: X, y: Y)`, the creator accepts `(x: X, y: Y)` and the payload is `readonly [x: X, y: Y]`.

### Augmenting PayloadTransforms

`PayloadTransforms` is a standard TypeScript interface; extend it with declaration merging to register custom transforms. The merge must target the bare specifier `'@rhombus-redux/inferred-effigy'`:

```ts
// my-transforms.d.ts (or inline in your entry point)
declare module '@rhombus-redux/inferred-effigy' {
  interface PayloadTransforms<TArgs extends readonly any[]> {
    /**
     * Drops the trailing parameter — creator takes all but the last arg.
     * Given (state: S, x: X, init: I), creator accepts (state: S, x: X).
     */
    initless: TArgs extends readonly [...infer Rest, any] ? Readonly<Rest> : readonly [];
  }
}
```

After that merge, `'initless'` is a valid `TransformKey` and can be passed to `withTransform`:

```ts
import { effigy } from '@rhombus-redux/inferred-effigy';

const handlers = {
  doThing(state: string, value: number, init: boolean) { return state; },
};

const creators = effigy(handlers).withTransform('initless').getCreators();

// creators.doThing : Func<readonly [state: string, value: number], Message<'doThing', readonly [state: string, value: number]>>
creators.doThing('s', 42);
// => { type: 'doThing', payload: ['s', 42] }
```

## squash()

`squash()` flattens the handler tree to a single-level record keyed by dotted path. The function references are identical to the originals — no wrapping occurs:

```ts
const flat = effigy(handlers).squash();
// {
//   'increment':         handlers.increment,
//   'user.rename':       handlers.user.rename,
//   'user.avatar.clear': handlers.user.avatar.clear,
// }

flat['user.rename'] === handlers.user.rename; // true
```

`squash()` is independent of the transform key — it reflects the raw handler tree.

It validates as it flattens. A leaf that is neither a function nor a plain nested map (a `null`, a primitive, an array) throws an error naming the offending dotted path and the value's type, rather than silently dropping the key or surfacing an opaque `Cannot convert undefined or null to object`. A dotted key that collides with a nested path — `{ 'a.b': f, a: { b: g } }` both flatten to `'a.b'` — also throws, naming the collision, instead of one silently overwriting the other.

## API reference

### `effigy(handlers)`

```ts
function effigy<Map extends HandlerMap>(handlers: Map): EffigyBuilder<Map, 'default'>
```

The front door. Accepts any `HandlerMap` — an arbitrarily nested tree of string-keyed objects whose leaves are functions — and returns an `EffigyBuilder` preconfigured with the `'default'` transform. Subsequent calls to `withTransform` or `getCreators` do not mutate the builder; each returns a new instance.

---

### `EffigyBuilder<Map, Key>`

The builder returned by `effigy()` and by `withTransform`. Holds a reference to the handler tree and the currently active transform key.

#### `withTransform(key: K): EffigyBuilder<Map, K>`

Returns a new builder with the transform key set to `K`. `K` must be a `TransformKey` (i.e. a key of `PayloadTransforms<any>`). The switch is type-level only; no runtime work is performed.

#### `getCreators(): Creators<Map, Key>`

#### `getCreators<TReturn>(onInvoke: (msg: Messages<Map, Key>) => TReturn): Creators<Map, Key, TReturn>`

Builds and returns the creator tree via a recursive Proxy. With no argument, every leaf creator returns `Message<path, payload>`. With an `onInvoke` callback, every leaf creator passes its message to the callback and returns the callback's result. The root proxy node is not invokable — calling it directly throws `'Cannot invoke the root command map object'`.

#### `squash(): FlattenMap<Map>`

Flattens the handler tree to `{ [dottedPath: string]: Func }`. Keys are joined with `'.'`. Leaves are reference-identical to the originals. The transform key is not involved. Throws on an invalid leaf or a dotted-key/nested-path collision (see the [squash()](#squash) section above).

#### `transformKey: Key`

Read-only getter. Returns the transform key currently set on this builder instance.

---

### `Message<T, P>`

```ts
type Message<T extends string, P extends readonly any[]> = { type: T; payload: P }
```

A single message object. `T` is the dotted-path string literal; `P` is the payload tuple as shaped by the active transform.

---

### `Messages<Map, Key>`

```ts
type Messages<Map extends HandlerMap, Key extends TransformKey = 'default'>
```

The discriminated union of every message the handler tree can produce under the given transform. Defaults to `'default'`. Use this as the type of the `msg` parameter in an `onInvoke` callback, or as the action union for a reducer switch.

---

### `Creators<T, Key, Return, Prefix>`

```ts
type Creators<
  T extends Func | HandlerMap,
  Key extends TransformKey,
  Return = NoReturn,    // NoReturn → leaf returns Message; otherwise → leaf returns Return
  Prefix extends string = ''
  // (plus an internal CurrentDepth counter — never pass it explicitly)
>
```

The transposed tree type. For each branch in `T`, produces an object with the same keys. For each leaf function, produces a creator `Func<Transform<Args, Key>, Return | Message<path, payload>>`. When `Return` is left at its default `NoReturn` sentinel — the no-callback case — the leaf returns its message directly. `NoReturn` is a dedicated unique symbol rather than `never`, so an `onInvoke` that legitimately returns `never` (e.g. a dispatch that always throws) types its leaves as `never` instead of falling back to the message branch. Recursion is bounded by the depth ceiling (see Limitations).

---

### `PayloadTransforms<TArgs>`

```ts
interface PayloadTransforms<TArgs extends readonly any[] = any> {
  default: TArgs;
  reducer: TArgs extends readonly [any, ...infer Rest] ? Readonly<Rest> : readonly [];
}
```

The transform registry. Augment this interface via declaration merging to register custom transforms. Each entry maps a `TArgs` tuple to the creator's parameter tuple under that transform. The interface is generic in `TArgs`; the transform computation is expressed as a conditional type on that parameter.

---

### `TransformKey`

```ts
type TransformKey = keyof PayloadTransforms<any>
```

The union of every registered transform name. Widens automatically when `PayloadTransforms` is augmented.

---

### `HandlerMap`

```ts
type HandlerMap = DeepDictionary<Func>
```

The constraint for handler trees: string-keyed objects, arbitrarily nested, with function leaves. Use `satisfies HandlerMap` on your handler object to get an early type error if you accidentally put a non-function leaf in the tree.

## Notes and caveats

- **Transforms are type-level only.** `withTransform` changes what TypeScript infers for the creator's parameter list. The runtime `getCreators` proxy does not inspect the transform key; it always captures every argument passed and stores them verbatim as the `payload` array.
- **Root proxy is not callable.** Invoking the object returned by `getCreators()` directly (without first accessing a property) throws at runtime. Only leaf-path creators are callable.
- **`squash()` is transform-agnostic.** It returns the original handler functions, not creator functions. The transform key on the builder has no effect on what `squash()` returns.

## Limitations

| # | Limitation |
|---|---|
| 1 | **Keys must be literal strings.** An index-signature map (`Record<string, …>`) degrades the message `type` to `string`; union-keyed handler maps aren't supported. Numeric-literal keys work — they stringify (`1` → `"1"`), matching the runtime. |
| 2 | **Handlers are mandatory.** Optional handler properties (only expressible via a deliberately-optional type alias) collapse `Messages` to `unknown`. Every leaf must be present. |
| 3 | **Dotted keys are reserved as path separators.** Nested keys are joined with `'.'`. A literal key containing `'.'` that collides with a nested path now throws at `squash()` (e.g. `{ 'a.b': f, a: { b: g } }`); a non-colliding dotted key still produces an ambiguous path — avoid dots in handler keys. |
| 4 | **`then` is reserved.** Creator nodes deliberately expose no `then`, so `await node` resolves to the node itself rather than hanging. `then` (and the coercion hooks `toString` / `valueOf`) cannot be used as handler keys. |
| 5 | **Creator leaves are Proxies, not real functions.** `.call` / `.apply` / `.bind` are not supported — invoke a creator directly. |
| 6 | **`PayloadTransforms` augmentation is compilation-global.** Merging a custom transform widens `TransformKey` for every `effigy` user in the same TypeScript program, not just the declaring file. |
| 7 | **Depth ceiling is 9 levels.** The type-level flattening behind `squash()`, `Messages` and `Creators` resolves leaves up to 9 nesting levels deep; at depth 10 and beyond the affected branches collapse to `never` consistently on both the message and creator sides. `getCreators()` has no hard *runtime* depth limit, but its *types* go `never` past the ceiling. |
