# TMCI Operations Hub — Backend

NestJS + Prisma REST API for TMCI Technology business operations.

## Prerequisites

- Node.js 20+
- PostgreSQL (local installation — create your own database)

## Setup

### 1. Create PostgreSQL database

```sql
CREATE DATABASE tmci_ops;
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set `DATABASE_URL` to your local PostgreSQL connection:

```
DATABASE_URL="postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/tmci_ops?schema=public"
```

### 3. Install and initialize

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
```

### 4. Run

```bash
npm run start:dev
```

- API: http://localhost:3000/api/v1
- Swagger: http://localhost:3000/docs

## Default login (after seed)

| Email | Password |
|-------|----------|
| admin@tmci.com | Admin@123 |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Development server with hot reload |
| `npm run build` | Production build |
| `npm run prisma:migrate` | Create new migration (dev) |
| `npm run prisma:deploy` | Apply migrations |
| `npm run prisma:seed` | Seed demo data |
| `npm run db:setup` | Migrate + seed |

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for ER diagram, modules, and API reference.
