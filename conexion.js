const sql = require("mssql");

// Cache to store connection pools for different databases
const pools = new Map();

/**
 * Executes a SQL query on the specified database.
 * @param {string} database - The database name.
 * @param {string} consultaSQL - The SQL query to execute.
 * @param {Object} [params] - Key-value pairs for SQL input parameters.
 * @returns {Promise<sql.IResult<any>>} The query result.
 */
async function runSql(database, consultaSQL, params = {}) {
    // If the database is missing, it will use the default from process.env if available, 
    // but here we expect it to be explicit.
    const dbKey = database || "default";

    if (!pools.has(dbKey)) {
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
            },
            pool: {
                max: 10,
                min: 0,
                idleTimeoutMillis: 30000
            }
        };
        const pool = new sql.ConnectionPool(config);
        pools.set(dbKey, pool.connect());
    }

    try {
        // Wait for the pool to be connected
        const pool = await pools.get(dbKey);
        const request = pool.request();

        // Add parameters to the request
        for (const [key, value] of Object.entries(params)) {
            request.input(key, value);
        }
        return await request.query(consultaSQL);
    } catch (err) {
        // If connection fails, remove from cache so it can retry
        pools.delete(dbKey);

        console.error(`[SQL Error] Database: ${database}`);
        console.error(`[SQL Error] Query: ${consultaSQL}`);
        if (Object.keys(params).length > 0) {
            console.error(`[SQL Error] Params:`, params);
        }
        console.error(`[SQL Error] Detail:`, err);
        throw err;
    }
}

module.exports = {
    runSql
};