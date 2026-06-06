import { describe, expect, it, vi } from 'vitest';
import { effigy, type HandlerMap } from '../src/index.js';

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

describe('getCreators — shallow', () => {
  it('default transform: creator returns a message carrying every arg passed', () => {
    const creators = effigy(demohandlers).getCreators();
    expect(creators.dothis('😀' as State, 5)).toEqual({ type: 'dothis', payload: ['😀', 5] });
  });

  it('reducer transform: runtime passes through whatever args are given', () => {
    const creators = effigy(demohandlers).withTransform('reducer').getCreators();
    expect(creators.dothis(5)).toEqual({ type: 'dothis', payload: [5] });
  });
});

describe('getCreators — deep path', () => {
  it('builds the dotted type from the access path', () => {
    // reducer transform drops the state arg, so the deep leaf is zero-arity.
    const creators = effigy(demohandlers).withTransform('reducer').getCreators();
    expect(creators.huzza.ineedtopee.rightnow()).toEqual({
      type: 'huzza.ineedtopee.rightnow',
      payload: [],
    });
  });
});

describe('getCreators — onInvoke', () => {
  it('returns the callback result and receives the {type, payload} message', () => {
    const onInvoke = vi.fn((msg: { type: string, payload: readonly any[] }) => `dispatched:${msg.type}`);
    const creators = effigy(demohandlers).withTransform('reducer').getCreators(onInvoke);

    const result = creators.huzza.omgaw(true, 7);

    expect(result).toBe('dispatched:huzza.omgaw');
    expect(onInvoke).toHaveBeenCalledTimes(1);
    expect(onInvoke).toHaveBeenCalledWith({ type: 'huzza.omgaw', payload: [true, 7] });
  });
});

describe('root proxy', () => {
  it('throws when the root command map object is invoked', () => {
    const creators = effigy(demohandlers).getCreators();
    expect(() => (creators as any)()).toThrow('Cannot invoke the root command map object');
  });
});

describe('traversal', () => {
  it('intermediate nodes are independent and re-accessible', () => {
    const creators = effigy(demohandlers).getCreators();

    // two distinct leaves under the same intermediate node
    const a = creators.huzza.ineedtopee.rightnow('😀' as State);
    const b = creators.huzza.omgaw('😀' as State, false, 1);
    expect(a).toEqual({ type: 'huzza.ineedtopee.rightnow', payload: ['😀'] });
    expect(b).toEqual({ type: 'huzza.omgaw', payload: ['😀', false, 1] });

    // accessing the same path twice produces equivalent results
    expect(creators.dothis('😀' as State, 2)).toEqual(creators.dothis('😀' as State, 2));
  });
});

describe('squash', () => {
  it('flattens to exactly the four dotted keys with reference-identical functions', () => {
    const flat = effigy(demohandlers).squash();
    expect(Object.keys(flat).sort()).toEqual([
      'dothat',
      'dothis',
      'huzza.ineedtopee.rightnow',
      'huzza.omgaw',
    ]);
    expect(flat.dothis).toBe(demohandlers.dothis);
    expect(flat.dothat).toBe(demohandlers.dothat);
    expect(flat['huzza.ineedtopee.rightnow']).toBe(demohandlers.huzza.ineedtopee.rightnow);
    expect(flat['huzza.omgaw']).toBe(demohandlers.huzza.omgaw);
  });
});

describe('transformKey getter', () => {
  it('starts at default and reflects withTransform', () => {
    const base = effigy(demohandlers);
    expect(base.transformKey).toBe('default');
    expect(base.withTransform('reducer').transformKey).toBe('reducer');
  });
});
