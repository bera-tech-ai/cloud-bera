#!/usr/bin/env bash
# Push bera-bot changes to https://github.com/bera-tech-ai/cloud-bera
# Requires GITHUB_PERSONAL_ACCESS_TOKEN to be set in environment

set -e

if [ -z "$GITHUB_PERSONAL_ACCESS_TOKEN" ]; then
    echo "ERROR: GITHUB_PERSONAL_ACCESS_TOKEN is not set."
    exit 1
fi

REPO_DIR="/home/runner/workspace/bera-bot"
REMOTE="https://${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/bera-tech-ai/cloud-bera.git"

cd "$REPO_DIR"

# Remove any stale git state and start clean
rm -rf .git

echo "==> Initialising local git repo..."
git init -b main

echo "==> Configuring user..."
git config user.email "bera-bot@bera-tech-ai.com"
git config user.name "Bera AI"

echo "==> Setting remote..."
git remote add origin "$REMOTE"

echo "==> Staging all files..."
git add -A

echo "==> Committing..."
git commit -m "Fix: add react helper to command ctx — fixes 'react is not defined' error in all admin commands (Vercel deploy, bash, eval, getpp, etc.)"

echo "==> Pushing to GitHub (force)..."
git push --force origin main

echo ""
echo "Done! Changes pushed to https://github.com/bera-tech-ai/cloud-bera"
