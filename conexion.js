var sql = require("mssql");

async function recHit(database, consultaSQL) {
    var config =
    {
        user: process.env.user,
        password: process.env.password,
        server: process.env.server,
        database: database,
        requestTimeout: 200000, // for timeout setting
        options: {
            encrypt: false,
            trustServerCertificate: true,
            enableArithAbort: true
        }
    };
    var devolver = new Promise((dev, rej) => {
        new sql.ConnectionPool(config).connect().then(pool => {
            return pool.request().query(consultaSQL);
        }).then(result => {
            dev(result);
            sql.close();
        }).catch(err => {
            console.log(err);
            console.log("SQL: ", consultaSQL)
            sql.close();
        });
    });
    return devolver;
}

module.exports.recHit = recHit;


function Rs(database, consultaSQL) {
    var config =
    {
        user: process.env.user,
        password: process.env.password,
        server: process.env.server,
        database: database
    };

    var pool = new sql.ConnectionPool(config).connect();
    var result = pool.query(consultaSQL);

    return pool.request().query(consultaSQL);
}
module.exports.Rs = Rs;


async function runSql(database, consultaSQL) {
    try {
        var config = {
            user: process.env.user,
            password: process.env.password,
            server: process.env.server,
            database: database,
            requestTimeout: 200000, // for timeout setting
            options: {
                encrypt: false,
                trustServerCertificate: true,
                enableArithAbort: true
            }
        };
        //console.log('Connecting to database with config:', config);

        // Conectar a la base de datos
        let pool = await sql.connect(config);
        //console.log('Connection successful.');

        // Ejecutar la consulta
        let result = await pool.request().query(consultaSQL);
        //console.log('Query executed successfully:', consultaSQL);

        return result;
    } catch (err) {
        console.error('Error al conectar a la base de datos:', err);
    } finally {
        // Cerrar la conexión
        sql.close().catch(err => console.error('Error al cerrar la conexión:', err));
    }
}

module.exports.runSql = runSql;