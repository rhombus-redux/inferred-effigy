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

describe('squash — invalid leaves (F4)', () => {
  it('throws a contextful error for a null leaf, naming the path and type', () => {
    const bad = { x: () => 1, z: null } as unknown as HandlerMap;
    expect(() => effigy(bad).squash()).toThrowError(
      /inferred-effigy: invalid handler at "z" — expected function or nested map, got null/,
    );
  });

  it('throws a contextful error for an undefined leaf', () => {
    const bad = { x: () => 1, z: undefined } as unknown as HandlerMap;
    expect(() => effigy(bad).squash()).toThrowError(
      /invalid handler at "z" — expected function or nested map, got undefined/,
    );
  });

  it('throws a contextful error for a primitive (number) leaf — no silent drop', () => {
    const bad = { x: () => 1, n: 5 } as unknown as HandlerMap;
    expect(() => effigy(bad).squash()).toThrowError(
      /invalid handler at "n" — expected function or nested map, got number/,
    );
  });

  it('throws a contextful error for an array leaf', () => {
    const bad = { x: () => 1, a: [1, 2] } as unknown as HandlerMap;
    expect(() => effigy(bad).squash()).toThrowError(
      /invalid handler at "a" — expected function or nested map, got array/,
    );
  });

  it('names the dotted path for a nested invalid leaf', () => {
    const bad = { outer: { inner: null } } as unknown as HandlerMap;
    expect(() => effigy(bad).squash()).toThrowError(
      /invalid handler at "outer.inner" — expected function or nested map, got null/,
    );
  });

  it('keeps current behavior for an empty sub-map: produces no keys', () => {
    const m = { x: () => 1, empty: {} } as unknown as HandlerMap;
    const flat = effigy(m).squash();
    expect(Object.keys(flat).sort()).toEqual(['x']);
  });
});

describe('squash — dotted/nested key collision (F11)', () => {
  it('throws naming the colliding key when a dotted key and nested path overlap', () => {
    const clash = { 'a.b': () => 1, a: { b: () => 2 } } as unknown as HandlerMap;
    expect(() => effigy(clash).squash()).toThrowError(/a\.b/);
  });
});

describe('symbol property access', () => {
  it('String(node) does not throw', () => {
    const creators = effigy(demohandlers).getCreators();
    expect(() => String(creators.huzza)).not.toThrow();
  });

  it('template interpolation does not throw', () => {
    const creators = effigy(demohandlers).getCreators();
    expect(() => `${creators.huzza}`).not.toThrow();
  });

  it('Array.from(node) does not throw and yields []', () => {
    const creators = effigy(demohandlers).getCreators();
    expect(() => Array.from(creators.huzza as any)).not.toThrow();
    expect(Array.from(creators.huzza as any)).toEqual([]);
  });

  it('node[Symbol.iterator] is undefined (not a path-extending proxy)', () => {
    const creators = effigy(demohandlers).getCreators();
    expect((creators.huzza as any)[Symbol.iterator]).toBeUndefined();
  });
});

describe('then trap (thenable poisoning)', () => {
  it('node.then is undefined so a node is not a thenable', () => {
    const creators = effigy(demohandlers).getCreators();
    expect(typeof (creators.huzza as any).then).toBe('undefined');
  });

  it('await Promise.resolve(node) resolves to the node itself', async () => {
    const creators = effigy(demohandlers).getCreators();
    const node = creators.huzza;
    const awaited = await Promise.resolve(node);
    expect(awaited).toBe(node);
  });

  it('await node resolves to the node itself', async () => {
    const creators = effigy(demohandlers).getCreators();
    const node = creators.huzza;
    const awaited = await (node as any);
    expect(awaited).toBe(node);
  });
});
