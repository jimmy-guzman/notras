# notras

> A simple space to capture your thoughts as they come.

## Technologies

### Tooling

- [pnpm](https://pnpm.io)
- [ESLint](https://eslint.org)
- [Oxfmt](https://oxc.dev)
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

- [Neon](https://neon.tech) (PostgreSQL)
- [Drizzle ORM](https://orm.drizzle.team)
- [Better Auth](https://better-auth.com)
- [Resend](https://resend.com)
- [@t3-oss/env-nextjs](https://env.t3.gg)

---

## Getting Started

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

### Database

[Neon](https://neon.tech) is being used as the PostgreSQL database.

Create a project on the [Neon console](https://console.neon.tech) and grab the `DATABASE_URL` connection string.

---

### Environment Variables

Set up environment variables by running:

```bash
cp .env.example .env
```

The `.env.example` file looks like:

```dotenv
# Database
DATABASE_URL=

# Auth
BETTER_AUTH_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Email
RESEND_API_KEY=
RESEND_FROM_EMAIL=
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
