# Publishing (Visual Studio Marketplace)

This document explains how to publish Dontforgetest to the **Visual Studio Marketplace** (Microsoft Marketplace).

## Prerequisites

- You have a **Publisher** created on Visual Studio Marketplace
- `package.json` has the correct `publisher` (Publisher ID)
- You have a **PAT (Personal Access Token)** with Marketplace publish permissions
- Node.js is available

## 1) Create / confirm your Publisher

1. Sign in to Visual Studio Marketplace
2. Create a Publisher (Publisher ID)
3. Confirm `package.json` contains the same value:
   - `publisher`: `<your-publisher-id>`

## 2) Create a PAT (Personal Access Token)

Create a PAT on Azure DevOps with:

- Scope: **Marketplace** → **Manage**

Keep the token secret.

## 3) Package a VSIX (local check)

```bash
npm run marketplace:package
```

This generates `dontforgetest-<version>.vsix` in the repo root.

## 4) Publish to Visual Studio Marketplace

Set the token in an environment variable and publish:

```bash
VSCE_PAT="<YOUR_PAT>" npm run marketplace:publish
```

Notes:

- `marketplace:publish` runs `lint`, `typecheck`, and `compile` before publishing.
- `vsce publish` creates and uploads the package.

## Troubleshooting

### `Publisher not found`

- Ensure Marketplace Publisher ID matches `package.json` → `publisher`.

### `Invalid token` / `Unauthorized`

- Ensure the PAT has **Marketplace: Manage** scope.
- Ensure the token is passed via `VSCE_PAT`.

