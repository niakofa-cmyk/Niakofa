#!/usr/bin/env bash
# Run every Diaspora source contract from the repository root.
set -euo pipefail

node --import tsx --test scripts/diaspora-data-loop-contract.test.mjs
node --import tsx --test scripts/diaspora-experience-contract.test.mjs
node --import tsx --test scripts/diaspora-finalization-contract.test.mjs
node --import tsx --test scripts/diaspora-final-polish-contract.test.mjs
node --import tsx --test scripts/diaspora-preserve-idempotency-contract.test.mjs
node --import tsx --test scripts/diaspora-triple-enhancement-contract.test.mjs
node --import tsx --test scripts/dna-matching-contract.test.mjs
echo "All Diaspora source contracts passed."