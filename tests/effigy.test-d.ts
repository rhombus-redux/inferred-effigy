import { describe, expectTypeOf, it } from 'vitest';
import type { Func } from '@rhombus-toolkit/func';
import {
  effigy,
  type Creators,
  type HandlerMap,
  type Message,
  type Messages,
} from '../src/index.js';

type State = '😀';
const demohandlers = {
  dothis(state: State, n: number) { return state; },
  dothat(state: State, s: string) { return state; },
  huzza: {
    ineedtopee: {
      rightnow: (state: State) => state,
    },
    omgaw(state: State, b: boolean, n: number) { return state; },
  },
} satisfies HandlerMap;
type DH = typeof demohandlers;

describe('creators — reducer transform leaves', () => {
  const creators = effigy(demohandlers).withTransform('reducer').getCreators();

  it('shallow leaves drop the state arg', () => {
    expectTypeOf(creators.dothis).toEqualTypeOf<
      Func<readonly [n: number], Message<'dothis', readonly [n: number]>>
    >();
    expectTypeOf(creators.dothat).toEqualTypeOf<
      Func<readonly [s: string], Message<'dothat', readonly [s: string]>>
    >();
  });

  it('deep leaves carry the dotted path', () => {
    expectTypeOf(creators.huzza.ineedtopee.rightnow).toEqualTypeOf<
      Func<readonly [], Message<'huzza.ineedtopee.rightnow', readonly []>>
    >();
    expectTypeOf(creators.huzza.omgaw).toEqualTypeOf<
      Func<readonly [b: boolean, n: number], Message<'huzza.omgaw', readonly [b: boolean, n: number]>>
    >();
  });
});

describe('creators — onInvoke return replaces the message', () => {
  const auto = effigy(demohandlers).withTransform('reducer').getCreators((msg) => {
    // msg is the discriminated union; narrowing on type narrows payload.
    if (msg.type === 'huzza.omgaw') {
      expectTypeOf(msg.payload).toEqualTypeOf<Readonly<[b: boolean, n: number]>>();
    }
    return 33;
  });

  it('leaves return the callback result, not the message', () => {
    expectTypeOf(auto.dothis).toEqualTypeOf<Func<readonly [n: number], number>>();
    expectTypeOf(auto.huzza.omgaw).toEqualTypeOf<Func<readonly [b: boolean, n: number], number>>();
  });
});

describe('Messages union', () => {
  it('reducer: each member present, payload sans state', () => {
    type MR = Messages<DH, 'reducer'>;
    expectTypeOf<MR>().toEqualTypeOf<
      | Message<'dothis', readonly [n: number]>
      | Message<'dothat', readonly [s: string]>
      | Message<'huzza.ineedtopee.rightnow', readonly []>
      | Message<'huzza.omgaw', readonly [b: boolean, n: number]>
    >();
  });

  it('default: payload includes the leading state arg', () => {
    type MD = Messages<DH>;
    // membership: under the identity (default) transform the payload keeps the
    // full handler parameter list — state included — as a mutable tuple.
    type IsMember = Message<'dothis', [state: State, n: number]> extends MD ? true : false;
    expectTypeOf<IsMember>().toEqualTypeOf<true>();
  });
});

describe('Creators full shape', () => {
  it('reducer (neh): every leaf a message creator', () => {
    expectTypeOf<Creators<DH, 'reducer'>>().toEqualTypeOf<{
      dothis: Func<readonly [n: number], Message<'dothis', readonly [n: number]>>,
      dothat: Func<readonly [s: string], Message<'dothat', readonly [s: string]>>,
      huzza: {
        ineedtopee: {
          rightnow: Func<readonly [], Message<'huzza.ineedtopee.rightnow', readonly []>>,
        },
        omgaw: Func<readonly [b: boolean, n: number], Message<'huzza.omgaw', readonly [b: boolean, n: number]>>,
      },
    }>();
  });

  it('reducer + return (noh): every leaf returns the override type', () => {
    expectTypeOf<Creators<DH, 'reducer', number>>().toEqualTypeOf<{
      dothis: Func<readonly [n: number], number>,
      dothat: Func<readonly [s: string], number>,
      huzza: {
        ineedtopee: { rightnow: Func<readonly [], number> },
        omgaw: Func<readonly [b: boolean, n: number], number>,
      },
    }>();
  });
});

describe('squash type', () => {
  it('has exactly the four dotted keys with handler Func types', () => {
    const flat = effigy(demohandlers).squash();
    expectTypeOf(flat).toEqualTypeOf<{
      dothis: Func<[state: State, n: number], State>,
      dothat: Func<[state: State, s: string], State>,
      'huzza.ineedtopee.rightnow': Func<[state: State], State>,
      'huzza.omgaw': Func<[state: State, b: boolean, n: number], State>,
    }>();
  });
});
