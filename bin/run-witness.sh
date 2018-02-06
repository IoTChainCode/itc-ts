#!/usr/bin/env bash

pm2 flush # empty logs

LISTEN_PORT=3001 POOL_SEEDS="ws://localhost:3001" pm2 start ./dist/witness/witness.js -f
LISTEN_PORT=3002 POOL_SEEDS="ws://localhost:3001" pm2 start ./dist/witness/witness.js -f
LISTEN_PORT=3003 POOL_SEEDS="ws://localhost:3001" pm2 start ./dist/witness/witness.js -f
LISTEN_PORT=3004 POOL_SEEDS="ws://localhost:3001" pm2 start ./dist/witness/witness.js -f
LISTEN_PORT=3005 POOL_SEEDS="ws://localhost:3001" pm2 start ./dist/witness/witness.js -f
LISTEN_PORT=3006 POOL_SEEDS="ws://localhost:3001" pm2 start ./dist/witness/witness.js -f
LISTEN_PORT=3007 POOL_SEEDS="ws://localhost:3001" pm2 start ./dist/witness/witness.js -f
LISTEN_PORT=3008 POOL_SEEDS="ws://localhost:3001" pm2 start ./dist/witness/witness.js -f
LISTEN_PORT=3009 POOL_SEEDS="ws://localhost:3001" pm2 start ./dist/witness/witness.js -f
LISTEN_PORT=3010 POOL_SEEDS="ws://localhost:3001" pm2 start ./dist/witness/witness.js -f
LISTEN_PORT=3011 POOL_SEEDS="ws://localhost:3001" pm2 start ./dist/witness/witness.js -f
LISTEN_PORT=3012 POOL_SEEDS="ws://localhost:3001" pm2 start ./dist/witness/witness.js -f
