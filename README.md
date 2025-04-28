# notras

> A simple space to capture your thoughts as they come.

## 🐣 Technologies

### Tooling

- [pnpm](https://pnpm.io)
- [ESLint](https://eslint.org)
- [Prettier](https://prettier.io)
- [Vitest](https://vitest.dev)
- [Lefthook](https://github.com/evilmartians/lefthook)
- [Knip](https://knip.dev)
- [GitHub Actions](https://github.com/features/actions)

### Frontend

- [Next.js](https://nextjs.org)
- [React](https://react.dev)
- [Shadcn UI](https://ui.shadcn.dev)
- [TailwindCSS](https://tailwindcss.com)
- [Sonner](https://sonner.emilkowal.ski)
- [Lucide](https://lucide.dev)

### Backend

- [Turso](https://docs.turso.tech)
- [Drizzle ORM](https://orm.drizzle.team)
- [Better Auth](https://better-auth.com)
- [Resend](https://resend.com)
- [@t3-oss/env-nextjs](https://env.t3.gg)

---

## 🏁 Getting Started

This project uses [pnpm](https://pnpm.io), so please [install](https://pnpm.io/installation) it first by running:

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

Or if you already have it installed, you can upgrade it by running:

```bash
pnpm add -g pnpm
```

Then you can finally install dependencies by running:

```bash
pnpm install
```

---

[Turso](https://docs.turso.tech/introduction) is being used as the SQLite database, which requires the [CLI to be installed](https://docs.turso.tech/cli/introduction):

```bash
brew install tursodatabase/tap/turso
```

Then you can either login or signup:

```bash
turso auth login
```

```bash
turso auth signup
```

Then you can start creating databases, for example:

```bash
turso db create notras
```

```bash
turso db create notras-dev --from-db notras
```

You can generate a `DATABASE_AUTH_TOKEN` by running:

```bash
turso db tokens create notras-dev
```

You can get the `DATABASE_URL` by running:

```bash
turso db show notras-dev --url
```

---

Then you can set up environment variables by running:

```bash
cp .env.example .env
```

The `.env.example` file looks like:

```dotenv
# Database
DATABASE_URL=
DATABASE_AUTH_TOKEN=

# Auth
BETTER_AUTH_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Email
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# Node
NODE_ENV=development
```

You can generate a `BETTER_AUTH_SECRET` by running:

```bash
openssl rand -base64 33
```

---

Then you can push your schema changes directly to the database by running:

```bash
pnpm db:push
```

---

And finally, you can start the development server by running:

```bash
pnpm dev
```
