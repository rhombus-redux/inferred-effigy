# @rhombus-redux/inferred-effigy

Like `createSlice`, but arbitrary-depth and decoupled from Redux: type-level tree transposition with a tiny proxy runtime.

You write a tree of handlers; `inferred-effigy` hands you back the *same tree* with every leaf transposed into a typed message-creator — and a discriminated union of every message that tree can produce. No code generation, no string literals to keep in sync: the dotted message types are inferred from where the function lives in the tree.

## Install

```sh
npm install @rhombus-redux/inferred-effigy
```

## Quick start

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

// The `reducer` transform drops the leading `state` param from each creator.
const slice = effigy(handlers).withTransform('reducer');

// `dispatch` receives a discriminated union of every message in the tree.
const creators = slice.getCreators((msg) => {
  if (msg.type === 'user.rename') {
    msg.payload; // Readonly<[name: string]>
  }
  return store.dispatch(msg);
});

creators.increment(5);            // { type: 'increment',   payload: [5] }
creators.user.rename('ada');      // { type: 'user.rename', payload: ['ada'] }
creators.user.avatar.clear();     // { type: 'user.avatar.clear', payload: [] }

type Action = Messages<typeof handlers, 'reducer'>;
//   | { type: 'increment';        payload: readonly [by: number] }
//   | { type: 'user.rename';      payload: readonly [name: string] }
//   | { type: 'user.avatar.clear'; payload: readonly [] }
```

## API

- **`effigy(handlers)`** — the front door. Wraps a handler tree (any depth, string keys, function leaves) and returns an `EffigyBuilder` on the `'default'` transform.
- **`EffigyBuilder#withTransform(key)`** — switch the payload transform (type-level only; the runtime always passes args through). Built in: `'default'` (identity) and `'reducer'` (drops the leading `state` param). Returns a new builder.
- **`EffigyBuilder#getCreators(onInvoke?)`** — transpose the tree into creators. With no argument, each creator returns its `{ type, payload }` message. Pass an `onInvoke` callback (e.g. a `dispatch`) and each creator returns that callback's result instead; the callback receives the message as a discriminated union.
- **`EffigyBuilder#squash()`** — flatten the handler tree to a single-level record keyed by dotted path (`{ 'user.rename': fn, ... }`), preserving the original function references.
- **`Messages<Map, Key>`** — the union of every message the tree produces under the given transform (defaults to `'default'`).
- **`Creators<...>`** — the transposed tree type: same shape, every leaf a creator function.

### Custom transforms

`PayloadTransforms` is an augmentable registry. Declaration-merge a new key, then pass it to `withTransform`:

```ts
declare module '@rhombus-redux/inferred-effigy' {
  interface PayloadTransforms<TArgs extends readonly any[]> {
    // drop the trailing argument
    initless: TArgs extends readonly [...infer Rest, any] ? Readonly<Rest> : readonly [];
  }
}

effigy(handlers).withTransform('initless').getCreators();
```

---

> These docs are a skeleton and are being expanded.
