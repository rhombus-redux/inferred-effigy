import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  // The public type surface imports only from src/toolkit-types.ts (vendored
  // aliases) — no bare @rhombus-toolkit/* imports — so the emitted d.ts is
  // self-contained without dts.resolve. Keep an eye on dist/index.d.ts: it must
  // never contain `from '@rhombus-toolkit'`. The check:consumer smoke test
  // (scripts/check-consumer.sh) gates this.
  dts: true,
  sourcemap: true,
  clean: true,
});
