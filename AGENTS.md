# Repository Guidelines

## Project Structure

- `src/app/`: Next.js App Router pages, layouts, and styles (`src/app/globals.css`).
- `src/app/api/`: Server routes for loading configs and proxying chat (`src/app/api/*/route.ts`).
- `src/chat/`: Core arena logic (speaker selection, streaming parsing).
- `src/config/`: YAML loaders for providers/rosters (`model-providers.yaml`, `arena-roster.yaml`).
- `public/`: Static assets served at `/`.

## Build, Test, and Development Commands

This repo is a Next.js + TypeScript app. `bun` is supported and a `bun.lock` is checked in.

- `bun install`: Install dependencies.
- `bun dev`: Run the web app at `http://localhost:3000`.
- `bun run build`: Create a production build.
- `bun start`: Serve the production build.
- `bun run lint`: Run ESLint (Next.js core-web-vitals + TypeScript rules).
- `bun run arena:cli --provider openai --roster default --proposition "..." --rounds 1`: Run the arena from the CLI.

## Configuration & Secrets

- Create local configs (ignored by git):
  - `cp model-providers.example.yaml model-providers.yaml`
  - `cp arena-roster.example.yaml arena-roster.yaml`
- Do not commit real API keys. Update `*.example.yaml` when adding new fields.
- Optional overrides: `MODEL_PROVIDERS_CONFIG` and `ARENA_ROSTER_CONFIG` can point to alternate YAML paths.

## Coding Style & Naming Conventions

- TypeScript (`strict: true`), React, and Next.js conventions.
- Match existing formatting: 2-space indentation, double quotes, semicolons, trailing commas.
- Prefer `@/` imports for `src/*` (configured in `tsconfig.json`).
- File naming: route handlers at `src/app/api/<name>/route.ts`; modules grouped under `src/chat/` and `src/config/`.

## Testing Guidelines

No test runner is currently configured. If you add tests, include a `test` script in `package.json` and document how to run it here.

## Commit & Pull Request Guidelines

- Commits in this repo use short, imperative subjects (e.g., “Add …”, “Load …”); keep them focused.
- PRs should describe behavior changes, include repro steps, and attach screenshots/GIFs for UI changes.
- For config-related changes, prefer adjusting `*.example.yaml` and keeping local `*.yaml` files untracked.
