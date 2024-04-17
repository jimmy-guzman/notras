# Next.js Starter

## Getting Started

You will need a couple environment variables, you can get started by creating an `.env` file:

```
touch .env
```

[Auth.js](https://authjs.dev/) is being used to handle authentication which requires a few environment variables:

- `AUTH_SECRET`
- `AUTH_GITHUB_ID`
- `AUTH_GITHUB_SECRET`

To generate an `AUTH_SECRET`, you can run the following:

```
openssl rand -base64 33
```

Then to get `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`, you will need to [create, authorize and configure an OAuth app](https://authjs.dev/getting-started/providers/github).

[Turso](https://docs.turso.tech/introduction) is being used as the SQLite Database, which requires the [CLI to be installed](https://docs.turso.tech/cli/introduction):

```
brew install tursodatabase/tap/turso
```

Then you can either login or signup:

```
turso auth login
```

```
turso auth signup
```

Then you can start creating databases, for example:

```
turso db create pilas
```

```
turso db create pilas-dev --from-db pilas
```

You can generate a `DATABASE_AUTH_TOKEN`, by running the following:

```
turso db tokens create pilas-dev
```

You can get the `DATABASE_URL`, by running the following:

```
turso db show pilas-dev --url
```

Then you can install dependencies, by running the following:

```
pnpm install
```

Once you're done you can push the [database schema](https://orm.drizzle.team/kit-docs/overview#prototyping-with-db-push), by running the following:

```
pnpm db:push
```

After all of this, you can finally start development server, by running the following:

```
pnpm dev
```
