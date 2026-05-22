# Noble Notations

This repository is my digital playground for:

- Taking notes on food and culinary experiments
- Tinkering with AI and exploring its applications
- Logging recipes and cooking techniques
- Any other note-taking that, for some reason, requires a code editor

## About

Noble Notations is built using [Docusaurus](https://docusaurus.io/), a modern static website generator. This setup allows me to easily organize and present my notes, recipes, and experiments in a structured and accessible manner.

### Key Features

- **Food Notes**: Detailed observations and learnings from culinary adventures
- **AI Experiments**: Documentation of AI-related projects and insights
- **Recipe Logs**: A collection of recipes, both traditional and experimental
- **Miscellaneous Notes**: Various topics that benefit from a code-editor environment

## Getting Started

To explore or contribute to this project, follow these steps:

### Installation

```
$ pnpm install
```

### Local Development

```
$ pnpm start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

### Build

```
$ pnpm build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

### Quality checks

```
$ pnpm format        # apply Prettier formatting
$ pnpm lint          # ESLint
$ pnpm typecheck     # TypeScript, no emit
```

GitHub Actions (`.github/workflows/ci.yml`) runs format check, lint,
typecheck, and a production build on every push and pull request.

### Deployment

Deployment is handled automatically by [Vercel](https://vercel.com/) —
pushes to `main` are built and published using the settings in
`vercel.json`. No manual deploy step is required.

## Contributing

See [`AGENTS.md`](./AGENTS.md) for conventions, repository layout, and the
quality gates contributors (human or AI) are expected to follow.
