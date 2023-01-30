
var express = require('express');
var http = require('http')
const SQL = require('mssql');
const escpos = require('escpos');
escpos.Network = require('escpos-network');
var app = express();
let authKey = "1234";
app.set("port", process.env.PORT || 4040);
app.use(function (req, res, next) {
   res.header("Access-Control-Allow-Origin", "*");
   res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
   next();
});


async function GetSQlRequest(request){
	await SQL.connect('Server=i.web.nubehit.com,1433;Database=Hit;User Id=sa;Password=LOperas93786;Encrypt=false') //`select * from [Fac_CasaEmpanadas].[dbo].AppUsuaris`
	return SQL.query(request)
}



app.get('/:printer', async function (req, res) {
	try{
		let macAdress = (req.rawHeaders[21])
		var response = "ERROR CON EL SERVIDOR, PORFAVOR CONTACTE CON HIT";
		response = await GetTextToPrint(macAdress)
		res.end(response);;
		
	}catch(err){
		res.end("Error >> "+err);
	} 
})

app.post('/:printer', async function (req, res) {
	try{
		res.writeHead(200, {'Content-Type': 'application/json'});
		let macAdress = (req.rawHeaders[11])
		var response = { "jobReady": await GetWaitingPrints(macAdress),"mediaTypes": ["text/plain"]};
		console.log(response);
		res.end(JSON.stringify(response));
	}catch{
		res.end("Error");
	}
})


async function GetTextToPrint(macAdress){
	let data = await GetSQlRequest(`select Empresa,Nom from [Hit].[dbo].ImpresorasIp where Mac = '${macAdress}'`)
	let empresa = data.recordset[0]['Empresa']
	let nom = data.recordset[0]['Nom']
	let result = await GetSQlRequest(`SELECT top 1 texte,id FROM [${empresa}].[dbo].ImpresoraCola Where Impresora = '${nom}'`);
	await GetSQlRequest(`delete FROM [${empresa}].[dbo].ImpresoraCola Where id = '${result.recordset[0]['id']}'`); // elimina
	if (result.rowsAffected
	<= 0){
		return "ERROR CON EL SERVIDOR, PORFAVOR CONTACTE CON HIT";
	}else{
		console.log("Impresi� realitzada a: "+empresa)
		return result.recordset[0]['texte']
	}
}

async function GetWaitingPrints(macAdress){
	let data = await GetSQlRequest(`select Empresa,Nom from [Hit].[dbo].ImpresorasIp where Mac = '${macAdress}'`)
	let empresa = data.recordset[0]['Empresa']
	let nom = data.recordset[0]['Nom']
	let result = await GetSQlRequest(`SELECT top 1 texte,id FROM [${empresa}].[dbo].ImpresoraCola Where Impresora = '${nom}'`);
	if (result.rowsAffected
	<= 0){
		return false
	}else{
		return true
	}
}
var server = app.listen(app.get("port"), function () {

  var host = "54.228.161.159"
  var port = server.address().port

  console.log("Node.js API app listening at http://%s:%s", host, port)

})
