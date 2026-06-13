# TMCI Operations Hub — Backend Architecture

## 1. Database ER Design

```
User ──────< RefreshToken
  │
  ├──< Project (manager)
  ├──< ProjectMember
  ├──< Expense (employee / approver)
  ├──< AuditLog
  └──< FileAsset

Customer ──< Opportunity ──< Quotation
    │              │
    │              └──< PreProject ──< Expense
    │                      │
    │                      └── converts to ──> Project
    │
    ├──< Project ──< Expense
    │           ├──< Invoice ──< Payment
    │           └──< StockTransaction
    │
    └──< Invoice

Product ──< InventoryItem ──< StockTransaction

Permission ──< RolePermission (by RoleName enum)
```

### Workflow chain
`Opportunity → Quotation → PreProject (+ expenses) → Project (+ migrated expenses) → Invoice → Payment`

## 2. Module Architecture (Modular Monolith)

| Module | Responsibility |
|--------|----------------|
| auth | JWT login, refresh, logout |
| users | User CRUD, role assignment |
| customers | CRM customer management |
| opportunities | Sales pipeline + stage transitions |
| quotations | Quote builder, approval workflow |
| pre-projects | Pre-sale costs + **convert to project** |
| projects | Delivery, team, budget tracking |
| expenses | Multi-reference expenses + approval |
| inventory | Products, items, stock transactions |
| invoices | Billing + payment tracking |
| reports | Dashboard analytics |
| files | S3-compatible document storage |

## 3. API List (prefix: `/api/v1`)

### Auth
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`

### Users (ADMIN)
- `POST /users`, `GET /users`, `GET /users/:id`, `PATCH /users/:id`
- `PATCH /users/:id/activate`, `PATCH /users/:id/deactivate`

### Customers
- `POST /customers`, `GET /customers`, `GET /customers/:id`, `PATCH /customers/:id`, `DELETE /customers/:id`

### Opportunities
- `POST /opportunities`, `GET /opportunities`, `GET /opportunities/:id`, `PATCH /opportunities/:id`
- `PATCH /opportunities/:id/stage`
- `POST /opportunities/:id/convert-to-pre-project`

### Quotations
- `POST /quotations`, `GET /quotations`, `GET /quotations/:id`
- `POST /quotations/:id/items`, `PATCH /quotations/:id/send`, `PATCH /quotations/:id/approve`

### Pre Projects
- `POST /pre-projects`, `GET /pre-projects`, `GET /pre-projects/:id`
- `POST /pre-projects/:id/expenses`
- `POST /pre-projects/:id/convert` ← migrates expenses to project

### Projects
- `POST /projects`, `GET /projects`, `GET /projects/:id`, `PATCH /projects/:id`
- `POST /projects/:id/members`

### Expenses
- `POST /expenses`, `GET /expenses`, `GET /expenses/:id`
- `PATCH /expenses/:id/approval`

### Inventory
- `POST /inventory/products`, `GET /inventory/products`
- `POST /inventory/items`, `GET /inventory/items`, `GET /inventory/dashboard`
- `POST /inventory/transactions`

### Invoices
- `POST /invoices`, `GET /invoices`, `GET /invoices/:id`
- `PATCH /invoices/:id/send`, `POST /invoices/:id/payments`

### Reports
- `GET /reports/dashboard`, `GET /reports/revenue`, `GET /reports/profitability`

### Files
- `POST /files/upload`

## 4. Getting Started

```bash
cd be
cp .env.example .env
# Edit DATABASE_URL for your local PostgreSQL
npm install
npx prisma migrate deploy
npm run prisma:seed
npm run start:dev
```

Swagger: http://localhost:3000/docs

Seed login: `admin@tmci.com` / `Admin@123`
