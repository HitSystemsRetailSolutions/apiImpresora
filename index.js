
var express = require('express');
const fs = require('fs');
const SQL = require('mssql');
const { exec } = require('node:child_process');
var app = express();
let authKey = "1234";
app.set("port", process.env.PORT || 4000);
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
		res.writeHead(200, {'Content-Type': 'text/plain'});
		let macAdress = (req.rawHeaders[21])
		var response = "ERROR CON EL SERVIDOR, PORFAVOR CONTACTE CON HIT";
		//response = await GetTextToPrint(macAdress)
		let rest = `[bold: on]\
[magnify: width 3; height 3]\
Casa De Las Empanadas
[negative: on]\
8A720\
[space: count 1]\
Micronics
[plain]\
[align: center]
[magnify: width 1; height 1]
Etiquedado el Marzo 24 2021 1:30PM
[upperline: on]
[space: count 48]
[plain]\
[bold: on]
[magnify: width 2; height 2]\
ETIQUETADO
[plain]\
[underline: on]
[space: count 48]
[plain]
[column: left 1XStar's lunch box A ÑÑÑÑÑ *; right $10.95; short lunch box A *]
------------------------------------------------
[column: left Subtotalalalal; right $0.97]
[column: left Ammount paid; right $11.92]
[column: left item 1; right 10.00€]
------------------------------------------------
[align: left]\
*Use special source as you like!
[cut: feed; partial]
[barcode: type qr; data 123456789012; error-correction Q; cell 1mm; model 2]
`;

		let filenameGet = './files/tempFileGet'+Math.floor(Math.random() * 9999)+'.stm';
		let filenameOut = './files/tempFileOut'+Math.floor(Math.random() * 9999)+'.bin';
		await fs.writeFile(filenameGet, rest, function (err) {});
		await exec( `"./cputil/cputil" utf8 thermal3 decode application/vnd.star.line ./${filenameGet} ./${filenameOut}`);
		while (fs.existsSync(filenameOut) == false){
			await new Promise(resolve => setTimeout(resolve, 500));
		}
		console.log(fs.existsSync(filenameOut))
		fs.readFile(filenameOut, 'utf8', (err, data) => {
		  if (err) {
			res.end(err);
		  }
		  console.log(data)
		  res.end(data);
		});
		fs.unlink(filenameGet,function(err){});  
		fs.unlink(filenameOut,function(err){});  
			}catch(err){
				res.end("Error >> "+err);
			} 
		})


app.post('/:printer', async function (req, res) {
	try{
		res.writeHead(200, {'Content-Type': 'application/vnd.star.line'});
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
	//await GetSQlRequest(`delete FROM [${empresa}].[dbo].ImpresoraCola Where id = '${result.recordset[0]['id']}'`); // elimina
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

  console.log("API app listening at http://%s:%s", host, port)

})
