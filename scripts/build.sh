#!/bin/bash
set -e

echo "==> Installing root dependencies"
npm install

echo "==> Building packages/types"
npm run build --workspace=packages/types

echo "==> Building packages/core"
npm run build --workspace=packages/core

echo "==> Building packages/supabase"
npm run build --workspace=packages/supabase

echo "==> Building packages/ai"
npm run build --workspace=packages/ai

echo "==> Building server"
npm run build --workspace=server

echo "==> Building apps/web"
npm run build --workspace=apps/web

echo "==> Build complete"
