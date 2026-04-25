# NGO Donation Utilization and Transparency Website

A full-stack donation management and transparency system for NGOs. The application helps an NGO record donors, donations, projects, expenses, and fund allocations, while giving donors and the public a clear view of how contributions are being used.

The project is built as a static frontend dashboard backed by an Express.js API and PostgreSQL database.

## Overview

This system is designed to improve transparency in NGO donation handling. It allows administrators to add donors, register donations, create NGO projects, record project expenses, allocate donation amounts to projects, and view an audit trail of administrative actions.

Donors can log in to view their total donations, donation history, where their money was allocated, and download PDF receipts. Public users can view high-level donation, project, and allocation information without logging in.

## Key Features

- Public dashboard with donation, project, and expense summaries
- Donor list with total contribution per donor
- Project listing with project details, budget, usage, and remaining balance
- Transparency view showing donation allocations to NGO projects
- Admin login and protected admin panel
- Add donors, donations, projects, expenses, and allocations
- Audit log for admin-created records
- Donor login portal
- Donor-specific donation history and allocation tracking
- PDF receipt generation for donor donations
- Chart-based analytics using Chart.js
- PostgreSQL-backed persistent data storage

## Tech Stack

### Frontend

- HTML5
- CSS3
- Vanilla JavaScript
- Chart.js via CDN

### Backend

- Node.js
- Express.js
- PostgreSQL
- `pg` for database access
- `cors` for cross-origin API access
- `pdfkit` for PDF receipt generation

## Project Structure

```text
NGO PROJECT/
+-- backend/
|   +-- db.js
|   +-- package.json
|   +-- package-lock.json
|   +-- README.md
|   +-- server.js
+-- frontend/
|   +-- index.html
+-- README.md
```

## Getting Started

### Prerequisites

Install the following before running the project:

- Node.js 18 or newer
- npm
- PostgreSQL database

### Backend Installation

```bash
cd backend
npm install
```

Create a `.env` file or set the `DATABASE_URL` environment variable before starting the server.

Example:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/ngo_donation_db
```

The backend reads the database connection from `process.env.DATABASE_URL`.

## Database Setup

The backend expects the following PostgreSQL tables:

```sql
CREATE TABLE donor (
    donor_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL
);

CREATE TABLE donation (
    donation_id SERIAL PRIMARY KEY,
    amount NUMERIC(12, 2) NOT NULL,
    donor_id INTEGER NOT NULL REFERENCES donor(donor_id)
);

CREATE TABLE ngo_project (
    project_id SERIAL PRIMARY KEY,
    project_name VARCHAR(150) NOT NULL,
    budget NUMERIC(12, 2) NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    project_head VARCHAR(100),
    status VARCHAR(50) DEFAULT 'Ongoing'
);

CREATE TABLE expense (
    expense_id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES ngo_project(project_id),
    amount NUMERIC(12, 2) NOT NULL
);

CREATE TABLE allocation (
    allocation_id SERIAL PRIMARY KEY,
    donation_id INTEGER NOT NULL REFERENCES donation(donation_id),
    project_id INTEGER NOT NULL REFERENCES ngo_project(project_id),
    allocated_amount NUMERIC(12, 2) NOT NULL
);

CREATE TABLE audit_log (
    log_id SERIAL PRIMARY KEY,
    action VARCHAR(50) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id INTEGER NOT NULL,
    performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Optional seed data:

```sql
INSERT INTO donor (name, email, password)
VALUES
    ('Sample Donor', 'donor@example.com', 'donor123');

INSERT INTO ngo_project (project_name, budget, description, project_head, status)
VALUES
    ('Education Support Program', 50000, 'Supports school supplies and learning resources.', 'Program Manager', 'Ongoing');

INSERT INTO donation (amount, donor_id)
VALUES
    (10000, 1);

INSERT INTO allocation (donation_id, project_id, allocated_amount)
VALUES
    (1, 1, 10000);

INSERT INTO expense (project_id, amount)
VALUES
    (1, 2500);
```

## Running Locally

### Start the Backend

```bash
cd backend
npm start
```

The API server runs on:

```text
http://localhost:3000
```

### Open the Frontend

Open `frontend/index.html` in a browser.

By default, the frontend currently points to the deployed Railway backend:

```js
const BASE = "https://ngo-donation-utilization-and-transparency-system-production.up.railway.app";
```

For local development, update this value in `frontend/index.html`:

```js
const BASE = "http://localhost:3000";
```

## Default Access

### Admin Login

```text
Username: admin
Password: ngo@123
```

### Donor Login

Donor login uses the `email` and `password` stored in the `donor` table.

When a donor is created from the admin panel without a password, the backend assigns:

```text
donor123
```

## API Reference

### Public Routes

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/` | Health check response |
| GET | `/donor` | List donors with total donated amount |
| GET | `/project` | List all NGO projects |
| GET | `/project/:id` | Get project details, expenses, and remaining budget |
| GET | `/allocation` | List donation allocations by donor and project |
| GET | `/stats` | Get total donations, projects, and expenses |
| GET | `/project-stats` | Get budget usage by project |

### Admin Routes

Admin routes require the `Authorization` header value returned from `/login`.

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/login` | Admin login |
| POST | `/donor` | Add a donor |
| POST | `/donation` | Add a donation |
| POST | `/project` | Add a project |
| POST | `/expense` | Add a project expense |
| POST | `/allocation` | Allocate a donation to a project |
| GET | `/audit-log` | View admin action audit log |

Example admin request:

```bash
curl -X POST http://localhost:3000/donor \
  -H "Content-Type: application/json" \
  -H "Authorization: admin-token" \
  -d "{\"name\":\"Asha Sharma\",\"email\":\"asha@example.com\",\"password\":\"donor123\"}"
```

### Donor Portal Routes

Donor portal routes require the donor token returned from `/donor/login`.

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/donor/login` | Donor login |
| GET | `/donor/me` | Get logged-in donor profile summary |
| GET | `/donor/my-donations` | Get logged-in donor donation history |
| GET | `/donor/my-allocations` | Get logged-in donor fund allocations |
| GET | `/donor/receipt/:donation_id` | Download donation receipt as PDF |

## Deployment Notes

The backend is suitable for deployment on platforms such as Railway, Render, or similar Node.js hosting providers.

Recommended deployment settings:

- Set `DATABASE_URL` in the hosting provider environment variables
- Use a managed PostgreSQL database
- Ensure CORS settings match the frontend deployment domain
- Keep `node_modules` out of version control
- Use `npm start` as the backend start command

The frontend can be hosted as a static site on platforms such as Netlify, Vercel, GitHub Pages, or any static file host.

## Security Notes

This project is suitable for academic/demo use, but several changes are recommended before production use:

- Move admin credentials into environment variables
- Hash donor passwords instead of storing plain text passwords
- Replace static admin token with JWT-based authentication
- Store donor sessions in a persistent session store or JWT
- Add request validation for all write endpoints
- Add authorization checks for admin-only data
- Add rate limiting for login endpoints
- Restrict CORS to trusted frontend domains
- Add server-side checks to prevent over-allocation beyond donation amount or project budget

## Future Improvements

- Add a dedicated database migration file
- Add automated tests for API routes
- Add update and delete operations for admin records
- Add advanced reporting by date range, project status, and donor
- Add downloadable annual donor statements
- Add role-based access control for multiple admin users
- Add frontend build tooling for easier environment configuration

## License

This project currently uses the `ISC` license declared in `backend/package.json`.
