#!/usr/bin/env bash
#
# Consumer-typecheck smoke test (guards F1).
#
# Packs the library, installs the tarball into a throwaway project, and runs
# `tsc --noEmit` on a small consumer program under the module-resolution +
# skipLibCheck combinations a real downstream user might pick:
#
#   - nodenext, skipLibCheck false
#   - nodenext, skipLibCheck true
#   - bundler,  skipLibCheck false
#   - bundler,  skipLibCheck true
#
# All four must pass. A bare `import { … } from '@rhombus-toolkit/…'` left in
# the published d.ts pulls a raw .ts source into the consumer's program and
# fails at least the nodenext combos (TS1479) and the strict bundler combo
# (TS1036) — exactly the breakage this script exists to catch.
#
# Run locally with `npm run check:consumer`; the CI `verify` job runs the same
# script so auto-merge is gated on it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> Packing $ROOT"
TARBALL="$(cd "$ROOT" && npm pack --silent --pack-destination "$WORK")"
TARBALL_PATH="$WORK/$TARBALL"
echo "    tarball: $TARBALL_PATH"

PKG_NAME="$(node -p "require('$ROOT/package.json').name")"

echo "==> Setting up consumer project in $WORK"
cd "$WORK"
cat > package.json <<JSON
{
  "name": "consumer-smoke",
  "private": true,
  "version": "0.0.0",
  "type": "module"
}
JSON

# Install the packed tarball and a local typescript so tsc is reachable in CI
# without relying on the library's own node_modules being on PATH.
npm install --silent --no-audit --no-fund "$TARBALL_PATH" "typescript@$(node -p "require('$ROOT/node_modules/typescript/package.json').version")" >/dev/null

# A consumer program that imports the public surface, calls a creator, and uses
# the Messages union as an action type — i.e. exercises the published d.ts.
mkdir -p src
cat > src/consumer.ts <<TS
import { effigy } from '$PKG_NAME';
import type { Messages, Creators } from '$PKG_NAME';

const handlers = {
  increment(state: number, by: number) { return state + by; },
  user: {
    rename(state: number, name: string) { return state; },
  },
};

const creators = effigy(handlers).withTransform('reducer').getCreators();
const a = creators.increment(5);
const b = creators.user.rename('ada');

// Use the message type so the d.ts types are actually instantiated.
type Action = Messages<typeof handlers, 'reducer'>;
const action: Action = a;
void action;
void b;

// Reference Creators so it can't be tree-shaken from the typecheck.
type C = Creators<typeof handlers, 'reducer'>;
const _c: C = creators;
void _c;
TS

run_case() {
  local resolution="$1" skiplib="$2"
  echo "==> tsc --noEmit  (moduleResolution=$resolution, skipLibCheck=$skiplib)"
  cat > tsconfig.json <<JSON
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "skipLibCheck": $skiplib,
    "module": "$( [ "$resolution" = "nodenext" ] && echo nodenext || echo esnext )",
    "moduleResolution": "$resolution",
    "target": "ES2022",
    "lib": ["ES2022"],
    "esModuleInterop": true
  },
  "include": ["src"]
}
JSON
  if ! npx --no-install tsc --noEmit -p tsconfig.json; then
    echo "    FAILED: moduleResolution=$resolution skipLibCheck=$skiplib"
    return 1
  fi
  echo "    ok"
}

FAIL=0
run_case nodenext false || FAIL=1
run_case nodenext true  || FAIL=1
run_case bundler  false || FAIL=1
run_case bundler  true  || FAIL=1

if [ "$FAIL" -ne 0 ]; then
  echo "==> consumer smoke test FAILED — the published d.ts is not self-contained."
  exit 1
fi
echo "==> consumer smoke test passed under all four configs."
