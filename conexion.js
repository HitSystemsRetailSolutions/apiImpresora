const sql = require("mssql");

/**
 * Executes a SQL query on the specified database.
 * @param {string} database - The database name.
 * @param {string} consultaSQL - The SQL query to execute.
 * @returns {Promise<sql.IResult<any>>} The query result.
 */
async function runSql(database, consultaSQL) {
    const config = {
        user: process.env.user,
        password: process.env.password,
        server: process.env.server,
        database: database,
        requestTimeout: 200000,
        options: {
            encrypt: false,
            trustServerCertificate: true,
            enableArithAbort: true
        }
    };

    try {
        // sql.connect(config) creates a pool if it doesn't exist for this config
        let pool = await sql.connect(config);
        let result = await pool.request().query(consultaSQL);
        return result;
    } catch (err) {
        console.error(`[SQL Error] Database: ${database}`);
        console.error(`[SQL Error] Query: ${consultaSQL}`);
        console.error(`[SQL Error] Detail:`, err);
        throw err; // Propagate error so the caller can handle it
    }
}

module.exports = {
    runSql
};