import { describe, expectTypeOf, it } from 'vitest';
import type { Func } from '@rhombus-toolkit/func';
import { effigy, type HandlerMap, type Message } from '../src/index.js';

// Declaration-merge a custom transform onto PayloadTransforms. Augmenting the
// published bare-specifier module name does not work against a relative import,
// so we augment via the relative module path the test resolves through.
//
// CAUTION: this augmentation is global to the whole typecheck compilation —
// it widens `TransformKey` for every test file. The sibling type tests assert
// membership/extends (never exact equality) on TransformKey / PayloadTransforms
// keys precisely so this file cannot break them.
declare module '../src/index.js' {
  interface PayloadTransforms<TArgs extends readonly any[]> {
    /** drops the trailing argument — creator takes all but the last param */
    initless: TArgs extends readonly [...infer Rest, any] ? Readonly<Rest> : readonly [];
  }
}

type State = '😀';
const demohandlers = {
  dothis(state: State, n: number) { return state; },
  huzza: {
    omgaw(state: State, b: boolean, n: number) { return state; },
  },
} satisfies HandlerMap;

describe('PayloadTransforms augmentation', () => {
  const creators = effigy(demohandlers).withTransform('initless').getCreators();

  it('a user-registered transform drops the LAST arg', () => {
    expectTypeOf(creators.dothis).toEqualTypeOf<
      Func<readonly [state: State], Message<'dothis', readonly [state: State]>>
    >();
    expectTypeOf(creators.huzza.omgaw).toEqualTypeOf<
      Func<readonly [state: State, b: boolean], Message<'huzza.omgaw', readonly [state: State, b: boolean]>>
    >();
  });
});
