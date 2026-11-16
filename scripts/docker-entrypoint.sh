#!/bin/sh
set -eu
node scripts/migrate-portal.mjs
node node_modules/prisma/build/index.js migrate deploy
exec node server.js
