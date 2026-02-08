#!/bin/bash
set -euo pipefail

# SessionStart Hook for note-article-generator
# Install dependencies and verify build on Claude Code web sessions

echo "[SessionStart] 📦 Installing dependencies..."
npm install

echo "[SessionStart] 🏗️  Building project..."
npm run build

echo "[SessionStart] ✅ Setup complete!"
