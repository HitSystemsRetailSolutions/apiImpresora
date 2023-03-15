var sql = require("mssql");
async function recHitOld(database, consultaSQL) {
    var config =
    {
        user: 'sa',
        password: 'LOperas93786',
        server: 'silema.hiterp.com',
        database: database,
		options: {
                "enableArithAbort": true
            }
    };
	let pool = await new sql.connect(config);
	let devolver = await pool.request().query(consultaSQL);
	sql.close();
    return devolver;
}

async function recHit(database, consultaSQL) {
    var config =
    {
        user: 'sa',
        password: 'LOperas93786',
        server: 'silema.hiterp.com',
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
        user: 'sa',
        password: 'LOperas93786',
        server: 'silema.hiterp.com',
        database: database
    };
	
    var pool = new sql.ConnectionPool(config).connect();
    var result = pool.query(consultaSQL);

    return pool.request().query(consultaSQL);
}
module.exports.Rs = Rs;