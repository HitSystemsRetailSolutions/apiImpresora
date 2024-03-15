const conexion = require("./conexion");
require('dotenv').config();
const moment = require("moment");
var express = require("express");
const fs = require("fs");
const { exec } = require("node:child_process");
const { Binary } = require("mssql");
const debug = true;
const mqtt = require('mqtt');
const momentTimeZone = require('moment-timezone');
const { rsvgVersion } = require("canvas");
const mqttOptions = {
  host: process.env.MQTT_HOST,
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASSWORD,
};

// Crear un cliente MQTT
const client = mqtt.connect(mqttOptions);

var app = express();
var procesedMacs = [];
app.set("port", process.env.PORT || 443);
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});
function binaryAgent(str) {
  return str
    .split(" ")
    .map(function (elem) {
      return String.fromCharCode(parseInt(elem, 2));
    })
    .join("");
}

function processOldCodes(msg) {
  //console log del codigo ascii de la posicion 27 105 1 1
  let firtsPos = 0;
  let positions = [];
  let lines = msg.toString().split("\r");
  for (let x = 0; x < lines.length; x++) {
    for (let i = 0; i < lines[x].length; i++) {
      let k = lines[x].charCodeAt(i);
      if ([27, 105, 1, 1].includes(k)) {
        if (k == 27) {
          firtsPos = i;
          positions.push(i);
        }
        if (k == 105 && i - 1 == firtsPos) {
          positions.push(i);
        }
        if (k == 1 && i - 2 == firtsPos) {
          positions.push(i);
        }
        if (k == 1 && i - 3 == firtsPos) {
          positions.push(i);
          // get position of \n
          // replace the characters in positions with bold tags on and off with the string jumped the \n
          lines[x] = [
            lines[x].slice(0, positions[0]),
            "[bold:on]",
            lines[x].slice(positions[positions.length - 1]),
          ].join("");
          lines[x] += "[bold:off]";
          firtsPos = 0;
          positions = [];
        }
      }
    }
  }
  msg = lines.join("\r");
  msg = msg.split("{BR}").join("\n");
  msg = msg.split("{FONT:B01}").join("[bold:on]");
  msg = msg.split("{FONT:B00}").join("[bold:off]");

  return msg;
}
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//MQTT

const Impresiones = {};
const Boton = {};

app.get("/test", async function (req, res) {
  console.log('patata',)
});

client.on('connect', function () {
  console.log('Conectado al broker MQTT');

  // Suscribirse a un tema
  const tema = '/Hit/Serveis/Contable/Impresora';
  client.subscribe(tema, function (err) {
    if (err) {
      console.error('Error al suscribirse al tema', err);
    } else {
      console.log('Suscripción exitosa al tema', tema);
    }
  });
});

client.on('connect', function () {
  console.log('Conectado al broker MQTT');

  // Suscribirse a un tema
  const tema = '/Hit/Serveis/Impresora';
  client.subscribe(tema, function (err) {
    if (err) {
      console.error('Error al suscribirse al tema', err);
    } else {
      console.log('Suscripción exitosa al tema', tema);
    }
  });
});


// Manejar mensajes recibidos
client.on('message', async function (topic, message) {
  if (debug) {
    console.log('Mensaje recibido en el tema:', topic, '- Contenido:', message.toString())
  }
  try {
    const msgJson = JSON.parse(message);
    console.log('Mensaje en modo JSON:', msgJson);
    if (topic == '/Hit/Serveis/Impresora') {
      if (msgJson.msg) {
        console.log('Guardamos: ', msgJson.macAddress);
        if (!Impresiones[msgJson.macAddress]) {
          Impresiones[msgJson.macAddress] = []; // Si la clave no existe, crea un nuevo vector
        }
        Impresiones[msgJson.macAddress].push(msgJson.msg);
        console.log('Texto:', Impresiones[msgJson.macAddress]);
      }
    }
  } catch (error) {
    console.log('Mensaje recibido como una cadena: ', message.toString());
  }
});

app.post("/mqttPR", async function (req, res) {
  console.log('----------------------post message MQTT----------------------')
  let macAddress = req.body.printerMAC;
  console.log('post message Post ', macAddress)
  let status = req.body["status"];
  sendMQTT(macAddress, status);
  res.writeHead(200, { "Content-Type": "text/plain" });
  if (Impresiones[macAddress] && Impresiones[macAddress].length > 0) {
    console.log('Impresiones: ', Impresiones[macAddress])
    res.end(JSON.stringify({ jobReady: true, mediaTypes: ["text/plain"] }));
  } else {
    console.log('Nada a imprimir')
    res.end(JSON.stringify({ jobReady: false, mediaTypes: ["text/plain"] }));
  }

});

app.get("/mqttPR", async function (req, res) {
  console.log('----------------------get message MQTT----------------------')
  let macAddress = req.query.mac;
  console.log('get message Get: ', macAddress);
  res.writeHead(200, { "Content-Type": "text/plain" });
  console.log('Impresiones: ', Impresiones[macAddress])
  res.end(Impresiones[macAddress][0]);
});

app.delete("/mqttPR", async function (req, res) {
  console.log('----------------------delete message MQTT----------------------')
  let macAddress = req.query.mac;
  console.log('delete message Delete: ', macAddress);
  Impresiones[macAddress].shift();
  if (Impresiones[macAddress].length === 0) {
    delete Impresiones[macAddress];
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(JSON.stringify({ jobReady: false, mediaTypes: ["text/plain"] }));
});

//Imprimir pulsado boton {1,2,3}, si llega mensaje volver a 1. 

function sendMQTT(macAddress, status) {
  const nowSpain = momentTimeZone().tz('Europe/Madrid').format();
  if (statusSpliter(status)) {
    if (!Impresiones[macAddress]) {
      Impresiones[macAddress] = [];
    }
    botonInicializar(macAddress)
    console.log(Boton[macAddress])
    Impresiones[macAddress].push('Se ha pulsado el boton ' + Boton[macAddress] + ' vez');
    let msg = '';
    if (Boton[macAddress] == 1) msg = 'ImpresoraIpReposicion';
    else if (Boton[macAddress] == 2) msg = 'ImpresoraPremutBoto2';
    else if (Boton[macAddress] == 3) msg = 'ImpresoraPremutBoto3';
    else msg = 'Error';

    const message = JSON.stringify({
      mac: macAddress,
      msg: msg,
      time: nowSpain // Convertir la fecha a un formato ISO string
    });
    client.publish('/Hit/Serveis/Contable/Impresora', message);
    botonIncrementar(macAddress);
  } else {
    const message = JSON.stringify({
      mac: macAddress,
      msg: 'BotonNoPremut',
      time: nowSpain // Convertir la fecha a un formato ISO string
    });
    //client.publish('/Hit/Serveis/Contable/Impresora', message);
    console.log('La tercera posición de status no es un 4');
  }
}

function statusSpliter(status) {
  const partes = status.split(' '); // Dividir la cadena en partes separadas por espacios
  return partes.length >= 3 && partes[2] === '4'; // Verificar si hay al menos 3 partes y la tercera es '4'
}

function botonInicializar(macAddress) {
  if (!Boton[macAddress]) {
    Boton[macAddress] = 1;
  }
}

function botonIncrementar(macAddress) {
  botonInicializar(macAddress)
  if (Boton[macAddress] < 3) {
    Boton[macAddress]++;
  } else {
    Boton[macAddress] = 1;
  }
}

//MQTT

app.post("/printer", async function (req, res) {
  process.stdout.write(".");
  console.log('get message 2')
  try {
    let macAddress = req.rawHeaders[11];
    let status = req.body["status"];
    if (!procesedMacs.includes(macAddress))
      conexion
        .recHit(
          "Hit",
          `select  * from ImpresorasIp where Mac = '${macAddress}';`
        )
        .then((data) => {
          if (data?.rowsAffected[0] == 0) {
            let insertMac = `insert into ImpresorasIp (Id,TmSt, Mac, Empresa, Nom,estado,ping) values (NEWID(),null,'${macAddress}','Hit','${macAddress
              ?.split(":")
              .join("")}',0,null)`;
            conexion.recHit("Hit", insertMac).catch((err) => {
              res.end("Error");
            });
          }
          procesedMacs.push(macAddress);
        })
        .catch((err) => {
          res.end("Error");
        });
    //process.stdout.write(macAddress)
    let Sql = ``;
    Sql += `DECLARE @MyMac nvarchar(20); `;
    Sql += `DECLARE @ImpresoraNom nvarchar(20); `;
    Sql += `DECLARE @Empresa nvarchar(20); `;
    Sql += `declare @ImpresoraCodi nvarchar(20); `;
    Sql += `DECLARE @Sql nvarchar(2000); `;
    Sql += `Declare @BotoApretat BIT; `;
    Sql += `Set @MyMac = '${macAddress}'; `;
    if (status.substring(5, 6) == "4") {
      Sql += `Set @BotoApretat = 1; `;
    } else {
      Sql += `Set @BotoApretat = 0;`;
    }
    Sql += `select  @ImpresoraNom = nom,@Empresa = empresa  from ImpresorasIp where Mac = @MyMac `;
    Sql += `update ImpresorasIp set TmSt=getdate()  where Mac = @MyMac `;
    Sql += `if ( @BotoApretat = 1)  `;
    Sql += `begin  `;
    Sql += `	if ( @Empresa = 'Hit')  `;
    Sql += `	begin `;
    Sql += `		delete [Hit].[dbo].[ImpresoraCola] Where Impresora = @ImpresoraNom `;
    Sql += `		insert into [Hit].[dbo].[ImpresoraCola] (id,impresora,Texte,TmStPeticio) values (newid(),@ImpresoraNom, 'Impresora NO Configurada.[\]Truqueu al 937161010[\]Codi Impresora :[\][magnify: width 2; height 2][\]' +CHAR(39)+ @ImpresoraNom + CHAR(39)+ '[\][magnify: width 1; height 1][\]Gracies :)[\]',getdate()) `;
    Sql += `	end `;
    Sql += `	else `;
    Sql += `	begin `;
    Sql += `		set @Sql = 'declare @click numeric;' `;
    Sql += `		set @Sql = @Sql + 'declare @click2 numeric;' `;
    Sql += `		set @Sql = @Sql + 'declare @imp numeric;' `;
    Sql += `		set @Sql = @Sql + 'select @click=SUM(Alb) ,@click2=SUM(Prod) ,@imp=SUM(Imp)  from ( ' `;
    Sql += `		set @Sql = @Sql + 'select COUNT(*) Alb,0 Prod ,0 Imp from [' +@Empresa + '].[dbo].FeinesAFer where tipus = ' +CHAR(39)+ 'ImpresoraIpReposicion' +CHAR(39)+ ' and param1=' +CHAR(39)+ @ImpresoraNom + CHAR(39)+ ' union ' `;
    Sql += `		set @Sql = @Sql + 'select 0 Alb,COUNT(*) Prod ,0 Imp from [' +@Empresa + '].[dbo].FeinesAFer where tipus = ' +CHAR(39)+ 'ImpresoraPremutBoto2' +CHAR(39)+ ' and param1=' +CHAR(39)+ @ImpresoraNom + CHAR(39)+ '  Union ' `;
    Sql += `		set @Sql = @Sql + 'select 0 Alb,0 Prod,COUNT(*)  Imp From [' +@Empresa + '].[dbo].ImpresoraCola where Impresora = ' +CHAR(39)+ @ImpresoraNom + CHAR(39)+ ') s ;' `;
    Sql += `		set @Sql = @Sql + '	    Select @imp,@click,@click2 ' `;
    Sql += `		set @Sql = @Sql + 'if (@imp > 0 or @click2>0)'  `;
    Sql += `		set @Sql = @Sql + '	begin ' `;
    Sql += `		set @Sql = @Sql + '		Delete [' +@Empresa + '].[dbo].[ImpresoraCola] where impresora = ' +CHAR(39)+ @ImpresoraNom + CHAR(39)+ ' ' `;
    Sql += `		set @Sql = @Sql + '		Delete [' +@Empresa + '].[dbo].FeinesAFer Where (tipus = ' +CHAR(39)+ 'ImpresoraIpReposicion' +CHAR(39)+ ' or tipus = ' +CHAR(39)+ 'ImpresoraPremutBoto2' +CHAR(39)+ ') and param1=' +CHAR(39)+ @ImpresoraNom + CHAR(39)+ ' ' `;
    Sql += `		set @Sql = @Sql + '		insert into [' +@Empresa + '].[dbo].[ImpresoraCola] (id,impresora,Texte,TmStPeticio) values (newid(),' +CHAR(39)+ @ImpresoraNom + CHAR(39)+ ', ' +CHAR(39)+ '[magnify: width 2; height 2]Impresio CANCELADA !!![magnify: width 1; height 1]' +CHAR(39)+ ',getdate()) ' `;
    Sql += `		set @Sql = @Sql + '	end ' `;
    Sql += `		set @Sql = @Sql + 'else '	 `;
    Sql += `		set @Sql = @Sql + 'if (@click > 0)'  `;
    Sql += `		set @Sql = @Sql + '	begin ' `;
    Sql += `		set @Sql = @Sql + '		Delete [' +@Empresa + '].[dbo].FeinesAFer where Tipus = ' +CHAR(39)+ 'ImpresoraIpReposicion' +CHAR(39)+ ' and Param1 = ' +CHAR(39)+ @ImpresoraNom + CHAR(39)+' ' `;
    Sql += `		set @Sql = @Sql + '		Insert Into [' +@Empresa + '].[dbo].FeinesAFer (id, Tipus,Ciclica,Param1) Values (newid(), ' +CHAR(39)+ 'ImpresoraPremutBoto2' +CHAR(39)+ ',0,' +CHAR(39)+ @ImpresoraNom + CHAR(39)+')' `;
    Sql += `		set @Sql = @Sql + '		insert into [' +@Empresa + '].[dbo].[ImpresoraCola] (id,impresora,Texte,TmStPeticio) values (newid(),' +CHAR(39)+ @ImpresoraNom + CHAR(39)+ ', ' +CHAR(39)+ '[magnify: width 2; height 2]Segon Llistat Demanat. Si tornes a pulsar es cancela la impressio[magnify: width 1; height 1]' +CHAR(39)+ ',getdate())' `;
    Sql += `		set @Sql = @Sql + '	end ' `;
    Sql += `		set @Sql = @Sql + 'else '		 `;
    Sql += `		set @Sql = @Sql + '	begin ' `;
    Sql += `		set @Sql = @Sql + '		Insert Into [' +@Empresa + '].[dbo].FeinesAFer (id, Tipus,Ciclica,Param1) Values (newid(), ' +CHAR(39)+ 'ImpresoraIpReposicion' +CHAR(39)+ ',0,' +CHAR(39)+ @ImpresoraNom + CHAR(39)+')' `;
    Sql += `		set @Sql = @Sql + '		insert into [' +@Empresa + '].[dbo].[ImpresoraCola] (id,impresora,Texte,TmStPeticio) values (newid(),' +CHAR(39)+ @ImpresoraNom + CHAR(39)+ ', ' +CHAR(39)+ '[magnify: width 2; height 2]Peticio Reposicio Feta.....[magnify: width 1; height 1]' +CHAR(39)+ ',getdate())' `;
    Sql += `		set @Sql = @Sql + '	end ' `;
    Sql += ` `;
    Sql += `		EXEC  sp_executesql  @Sql `;
    Sql += `	end `;
    Sql += `end `;
    Sql += `set @Sql='select count(*) Q from ' + @Empresa + '.[dbo].[ImpresoraCola] where Impresora=' +CHAR(39)+ @ImpresoraNom + CHAR(39);`;
    Sql += `EXEC  sp_executesql  @Sql`;

    conexion
      .recHit("Hit", Sql)
      .then((data) => {
        res.writeHead(200, { "Content-Type": "text/plain" });

        if (data.recordset[0]["Q"] > 0)
          res.end(
            JSON.stringify({ jobReady: true, mediaTypes: ["text/plain"] })
          );
        else
          res.end(
            JSON.stringify({ jobReady: false, mediaTypes: ["text/plain"] })
          );
      })
      .catch((err) => {
        res.end("Error");
      });
  } catch {
    res.end("Error");
  }
});

app.get("/printer", async function (req, res) {
  process.stdout.write("*");
  console.log('get message', req)
  try {
    res.writeHead(200, { "Content-Type": "text/plain" });
    let macAddress = req.rawHeaders[21];
    var response = "ERROR CON EL SERVIDOR, PORFAVOR CONTACTE CON HIT";
    let Sql = ``;
    Sql += `DECLARE @MyMac nvarchar(20); `;
    Sql += `DECLARE @ImpresoraNom nvarchar(20); `;
    Sql += `DECLARE @Empresa nvarchar(20); `;
    Sql += `DECLARE @Sql nvarchar(2000); `;
    Sql += `Set @MyMac = '${macAddress}'; `;
    Sql += `select  @ImpresoraNom = nom,@Empresa = empresa  from ImpresorasIp where Mac = @MyMac `;
    Sql += `set @Sql=       'DECLARE @I varchar(max);' `;
    Sql += `set @Sql=@Sql + 'DECLARE @T varchar(max);' `;
    Sql += `set @Sql=@Sql + 'SELECT top 1 @T= texte, @I=id FROM ' + @Empresa + '.[dbo].[ImpresoraCola] where Impresora=' +CHAR(39)+ @ImpresoraNom + CHAR(39) + ' order by tmstpeticio '; `;
    Sql += `set @Sql=@Sql + 'delete ' + @Empresa + '.[dbo].[ImpresoraCola] Where id=@I ' ; `;
    Sql += `set @Sql=@Sql + 'Select @T ;' `;
    Sql += `EXEC  sp_executesql  @Sql`;
    conexion.recHit("Hit", Sql).then((data) => {
      let filenameGet =
        "./files/tempFileGet" + Math.floor(Math.random() * 9999) + ".stm";
      let filenameOut =
        "./files/tempFileOut" + Math.floor(Math.random() * 9999) + ".bin";
      if (data.recordset == undefined) return res.end("Error");
      let msg = processOldCodes(data.recordset[0][""]);
      fs.writeFile(filenameGet, msg, function (err) {
        if (err) console.log("1", err);
        else {
          exec(
            `"./cputil/cputil" utf8 thermal3 scale-to-fit decode application/vnd.star.line ./${filenameGet} ./${filenameOut}`,
            (error, stdout, stderr) => {
              if (error) {
                console.warn("Exec", error);
              } else {
                fs.readFile(filenameOut, "utf8", (err, data) => {
                  if (err) {
                    res.end("read", filenameOut, err);
                  }

                  fs.writeFile(
                    "./files/Codis.bin",
                    JSON.stringify(data),
                    function (err) { }
                  );

                  fs.unlink(filenameGet, function (err) { });
                  fs.unlink(filenameOut, function (err) { });
                  res.end(data);
                });
              }
            }
          );
        }
      });
    });
  } catch {
    res.end("Error");
  }
});

app.delete("/printer", async function (req, res) {
  console.log('get message 3')
  let macAddress = req.rawHeaders[11];
  let servitDate = `[Servit-${moment().format("YY-MM-DD")}]`;
  let empresaSQL = `select  nom,empresa  from ImpresorasIp where Mac = '${macAddress}' `;
  conexion
    .recHit("Hit", empresaSQL)
    .then((empresa) => {
      if (
        !empresa.recordset[0].nom.includes("Tienda") ||
        !empresa.recordset[0].nom.includes("Tot")
      ) {
        res.end("none");
        return;
      }
      conexion
        .recHit(
          empresa.recordset[0].empresa,
          `update ${servitDate} Set Hora= ${moment().hour()}, comentari='Reposicion[${"IMP " + moment().format("hh:mm:ss")
          }]' Where  client = '${empresa.recordset[0].nom.split("_")[1]
          }' and Hora = 1`
        )
        .then((x) => {
          res.end("none");
        });
    })
    .catch((err) => {
      res.end("Error");
    });
  let SQL = ``;
  // recHit("WEB", $empresa,"update [Servit-".date("y-m-d")."] Set Hora= datepart(hour,getdate()), comentari=comentari+'[IMP ' + convert(nvarchar, getdate(), 8) + ']' Where  client = '".$cmCodiBotiga."' and Hora = 1 ", 1);
  JSON.stringify({ jobReady: false, mediaTypes: ["text/plain"] });
});

var server = app.listen(app.get("port"), function () {
  var host = "https://impresoras.nubehit.com";
  //host = "54.77.231.164";
  //host = "192.168.1.148";
  var port = server.address().port;

  console.log("API app listening at http://%s:%s", host, port);
});

