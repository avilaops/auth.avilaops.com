#!/bin/sh
set -eu
node scripts/migrate-portal.mjs
exec node server.js
