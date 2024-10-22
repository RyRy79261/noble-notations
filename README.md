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
$ yarn
```

### Local Development

```
$ yarn start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

### Build

```
$ yarn build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

### Deployment

Using SSH:

```
$ USE_SSH=true yarn deploy
```

Not using SSH:

```
$ GIT_USER=<Your GitHub username> yarn deploy
```

If you are using GitHub pages for hosting, this command is a convenient way to build the website and push to the `gh-pages` branch.
