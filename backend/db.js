const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'ngo_db',
    password: 'abhi',   // use your password
    port: 5432,
});

module.exports = pool;