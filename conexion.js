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