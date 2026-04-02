const express = require('express');
const app = express();
const db = require('./db');
const cors = require('cors');
const PDFDocument = require('pdfkit');

app.use(cors());
app.use(express.json());

/* ================= ADMIN AUTH ================= */

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD  = "ngo@123";

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        return res.json({ success: true, token: "admin-token" });
    }

    res.status(401).json({ success: false, message: "Invalid credentials" });
});

function checkAuth(req, res, next) {
    const token = req.headers['authorization'];
    if (token === "admin-token") {
        next();
    } else {
        res.status(403).json({ success: false, message: "Unauthorized" });
    }
}

/* ================= DONOR AUTH ================= */

const donorSessions = {};

function generateToken() {
    return 'donor-' + Math.random().toString(36).substr(2, 16) + Date.now();
}

app.post('/donor/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password)
        return res.status(400).json({ success: false, message: "Email and password required" });

    const result = await db.query(
        'SELECT * FROM donor WHERE email = $1 AND password = $2',
        [email, password]
    );

    if (result.rows.length === 0)
        return res.status(401).json({ success: false, message: "Invalid email or password" });

    const donor = result.rows[0];
    const token = generateToken();
    donorSessions[token] = donor.donor_id;

    res.json({ success: true, token, name: donor.name });
});

function checkDonorAuth(req, res, next) {
    const token = req.headers['authorization'];
    if (token && donorSessions[token]) {
        req.donor_id = donorSessions[token];
        next();
    } else {
        res.status(403).json({ success: false, message: "Unauthorized" });
    }
}



async function logAudit(action, tableName, recordId) {
    await db.query(
        'INSERT INTO audit_log(action, table_name, record_id) VALUES($1, $2, $3)',
        [action, tableName, recordId]
    );
}

/* ================= PUBLIC APIs ================= */

app.get('/', (req, res) => {
    res.send("Server Running");
});

app.get('/donor', async (req, res) => {
    const result = await db.query(`
        SELECT d.donor_id, d.name, d.email,
               COALESCE(SUM(don.amount), 0) AS total_donated
        FROM donor d
        LEFT JOIN donation don ON d.donor_id = don.donor_id
        GROUP BY d.donor_id, d.name, d.email
        ORDER BY d.donor_id ASC
    `);

    res.json(result.rows);
});

app.get('/project', async (req, res) => {
    const result = await db.query('SELECT * FROM ngo_project ORDER BY project_id ASC');
    res.json(result.rows);
});

/* ================= PROJECT DETAIL ================= */

app.get('/project/:id', async (req, res) => {
    const { id } = req.params;

    const project = await db.query(
        'SELECT * FROM ngo_project WHERE project_id = $1',
        [id]
    );

    if (project.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Project not found" });
    }

    const expenses = await db.query(
        'SELECT COALESCE(SUM(amount), 0) AS total_expense FROM expense WHERE project_id = $1',
        [id]
    );

    const projectData = project.rows[0];
    projectData.total_expense = expenses.rows[0].total_expense;
    projectData.remaining = projectData.budget - projectData.total_expense;

    res.json(projectData);
});

app.get('/allocation', async (req, res) => {
    const result = await db.query(`
        SELECT d.name AS donor_name, p.project_name, a.allocated_amount
        FROM allocation a
        JOIN donation don ON a.donation_id = don.donation_id
        JOIN donor d ON don.donor_id = d.donor_id
        JOIN ngo_project p ON a.project_id = p.project_id
        ORDER BY a.allocation_id ASC
    `);

    res.json(result.rows);
});

/* ================= ADMIN APIs ================= */

app.post('/donor', checkAuth, async (req, res) => {
    const { name, email, password } = req.body;

    const result = await db.query(
        'INSERT INTO donor(name, email, password) VALUES($1, $2, $3) RETURNING donor_id',
        [name, email, password || 'donor123']
    );

    await logAudit('INSERT', 'donor', result.rows[0].donor_id);

    res.json({ success: true, message: "Donor Added" });
});

app.post('/donation', checkAuth, async (req, res) => {
    const { amount, donor_id } = req.body;

    const result = await db.query(
        'INSERT INTO donation(amount, donor_id) VALUES($1, $2) RETURNING donation_id',
        [amount, donor_id]
    );

    await logAudit('INSERT', 'donation', result.rows[0].donation_id);

    res.json({ success: true, message: "Donation Added" });
});

app.post('/project', checkAuth, async (req, res) => {
    const { project_name, budget, description, start_date, end_date, project_head, status } = req.body;

    const result = await db.query(
        `INSERT INTO ngo_project(project_name, budget, description, start_date, end_date, project_head, status)
         VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING project_id`,
        [project_name, budget, description || null, start_date || null, end_date || null, project_head || null, status || 'Ongoing']
    );

    await logAudit('INSERT', 'ngo_project', result.rows[0].project_id);

    res.json({ success: true, message: "Project Added" });
});

app.post('/expense', checkAuth, async (req, res) => {
    const { project_id, amount } = req.body;

    const result = await db.query(
        'INSERT INTO expense(project_id, amount) VALUES($1, $2) RETURNING expense_id',
        [project_id, amount]
    );

    await logAudit('INSERT', 'expense', result.rows[0].expense_id);

    res.json({ success: true, message: "Expense Added" });
});

app.post('/allocation', checkAuth, async (req, res) => {
    const { donation_id, project_id, allocated_amount } = req.body;

    const result = await db.query(
        'INSERT INTO allocation(donation_id, project_id, allocated_amount) VALUES($1, $2, $3) RETURNING allocation_id',
        [donation_id, project_id, allocated_amount]
    );

    await logAudit('INSERT', 'allocation', result.rows[0].allocation_id);

    res.json({ success: true, message: "Allocation Added" });
});

app.get('/stats', async (req, res) => {
    const totalDonations = await db.query(
        'SELECT COALESCE(SUM(amount),0) FROM donation'
    );

    const totalProjects = await db.query(
        'SELECT COUNT(*) FROM ngo_project'
    );

    const totalExpenses = await db.query(
        'SELECT COALESCE(SUM(amount),0) FROM expense'
    );

    res.json({
        total_donations: totalDonations.rows[0].coalesce,
        total_projects: totalProjects.rows[0].count,
        total_expenses: totalExpenses.rows[0].coalesce
    });
});

app.get('/project-stats', async (req, res) => {
    const result = await db.query(`
        SELECT p.project_id, p.project_name, p.budget,
               COALESCE(SUM(e.amount), 0) AS total_expense,
               (p.budget - COALESCE(SUM(e.amount), 0)) AS remaining
        FROM ngo_project p
        LEFT JOIN expense e ON p.project_id = e.project_id
        GROUP BY p.project_id, p.project_name, p.budget
    `);

    res.json(result.rows);
});

/* ================= DONOR PORTAL APIs ================= */

app.get('/donor/me', checkDonorAuth, async (req, res) => {
    const result = await db.query(
        `SELECT d.donor_id, d.name, d.email,
                COALESCE(SUM(don.amount), 0) AS total_donated,
                COUNT(don.donation_id) AS total_donations
         FROM donor d
         LEFT JOIN donation don ON d.donor_id = don.donor_id
         WHERE d.donor_id = $1
         GROUP BY d.donor_id, d.name, d.email`,
        [req.donor_id]
    );
    res.json(result.rows[0]);
});

app.get('/donor/my-donations', checkDonorAuth, async (req, res) => {
    const result = await db.query(
        `SELECT donation_id, amount
         FROM donation
         WHERE donor_id = $1
         ORDER BY donation_id ASC`,
        [req.donor_id]
    );
    res.json(result.rows);
});

app.get('/donor/my-allocations', checkDonorAuth, async (req, res) => {
    const result = await db.query(
        `SELECT p.project_name, p.status, a.allocated_amount,
                p.description, p.project_head
         FROM allocation a
         JOIN donation don ON a.donation_id = don.donation_id
         JOIN ngo_project p ON a.project_id = p.project_id
         WHERE don.donor_id = $1
         ORDER BY a.allocation_id ASC`,
        [req.donor_id]
    );
    res.json(result.rows);
});

/* ================= PDF RECEIPT ================= */

app.get('/donor/receipt/:donation_id', checkDonorAuth, async (req, res) => {
    const { donation_id } = req.params;

    // Verify this donation belongs to the logged-in donor
    const donResult = await db.query(
        `SELECT don.donation_id, don.amount, d.name, d.email
         FROM donation don
         JOIN donor d ON don.donor_id = d.donor_id
         WHERE don.donation_id = $1 AND don.donor_id = $2`,
        [donation_id, req.donor_id]
    );

    if (donResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Donation not found" });
    }

    const donation = donResult.rows[0];

    // Get allocations for this donation
    const allocResult = await db.query(
        `SELECT p.project_name, a.allocated_amount
         FROM allocation a
         JOIN ngo_project p ON a.project_id = p.project_id
         WHERE a.donation_id = $1`,
        [donation_id]
    );

    // Build PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=receipt_donation_${donation_id}.pdf`);
    doc.pipe(res);

    // Header
    doc.fontSize(22).font('Helvetica-Bold').text('HopeNGO', 50, 50);
    doc.fontSize(10).font('Helvetica').fillColor('#7a7a7a').text('Donation Receipt', 50, 78);

    // Divider
    doc.moveTo(50, 100).lineTo(545, 100).strokeColor('#e0dbd4').lineWidth(1).stroke();

    // Receipt details
    doc.fillColor('#1c1c1c').fontSize(13).font('Helvetica-Bold').text('Receipt Details', 50, 120);

    doc.fontSize(11).font('Helvetica');
    const details = [
        ['Donation ID',  `#${donation.donation_id}`],
        ['Donor Name',   donation.name],
        ['Email',        donation.email],
        ['Amount',       `Rs. ${Number(donation.amount).toLocaleString('en-IN')}`],
        ['Date',         new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })]
    ];

    let y = 145;
    details.forEach(([label, value]) => {
        doc.fillColor('#7a7a7a').text(label, 50, y);
        doc.fillColor('#1c1c1c').text(value, 200, y);
        y += 24;
    });

    // Divider
    doc.moveTo(50, y + 10).lineTo(545, y + 10).strokeColor('#e0dbd4').lineWidth(1).stroke();
    y += 30;

    // Allocations
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#1c1c1c').text('Fund Allocation', 50, y);
    y += 24;

    if (allocResult.rows.length > 0) {
        // Table header
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#7a7a7a');
        doc.text('Project', 50, y);
        doc.text('Amount Allocated', 380, y);
        y += 18;

        doc.moveTo(50, y).lineTo(545, y).strokeColor('#e0dbd4').lineWidth(0.5).stroke();
        y += 10;

        allocResult.rows.forEach(a => {
            doc.fontSize(11).font('Helvetica').fillColor('#1c1c1c');
            doc.text(a.project_name, 50, y, { width: 300 });
            doc.text(`Rs. ${Number(a.allocated_amount).toLocaleString('en-IN')}`, 380, y);
            y += 24;
        });
    } else {
        doc.fontSize(11).font('Helvetica').fillColor('#7a7a7a').text('No allocations recorded yet for this donation.', 50, y);
        y += 24;
    }

    // Footer
    doc.moveTo(50, y + 20).lineTo(545, y + 20).strokeColor('#e0dbd4').lineWidth(1).stroke();
    doc.fontSize(9).fillColor('#7a7a7a').text(
        'Thank you for your generous contribution. This is an official receipt from HopeNGO.',
        50, y + 32, { align: 'center', width: 495 }
    );

    doc.end();
});



app.get('/audit-log', checkAuth, async (req, res) => {
    const result = await db.query(
        'SELECT * FROM audit_log ORDER BY performed_at DESC'
    );

    res.json(result.rows);
});

/* ================= SERVER ================= */

app.listen(3000, () => {
    console.log("Server running on port 3000");
});