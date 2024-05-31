const conexion = require("./conexion");
require("dotenv").config();
const moment = require("moment");
var express = require("express");
const path = require("path");
const fs = require("fs");
const { exec } = require("node:child_process");
const { Binary } = require("mssql");
const debug = true;
const mqtt = require("mqtt");
const momentTimeZone = require("moment-timezone");
const { rsvgVersion } = require("canvas");
const { runSql } = require('./conexion');
const mqttOptions = {
  host: process.env.MQTT_HOST,
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASSWORD,
};

// Crear un cliente MQTT
const client = mqtt.connect(mqttOptions);

var app = express();
var procesedMacs = [];
app.set("port", process.env.PORT || 4040);
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
app.use(express.static(path.join(__dirname, "public")));

//MQTT

const Impresiones = {};
const Boton = {};

app.get("/test", async function (req, res) {
  console.log("patata");
});

//Función que lee los enigmas del archivo de entrada y los escribe en el archivo de salida
function escribirEnigmas(nombreArchivoEntrada, nombreArchivoSalida) {
  try {
    const contenido = fs.readFileSync(nombreArchivoEntrada, 'utf-8');
    const lineas = contenido.split('\n');
    let enigmaActual = '';
    let respuestaActual = '';
    let enigmasTexto = '';
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i].trim();
      //Verificar si es una línea de enigma
      if (linea.startsWith('"') && linea.endsWith('"')) {
        const enigma = linea.substring(1, linea.length - 1).trim(); //Extraer el enigma y verificar si contiene paréntesis
        if (enigma.includes('(')) {
          i += 2 //Si contiene paréntesis, saltar a la siguiente iteración
        } else {
          enigmaActual = enigma;
        }
      }
      //Verificar si es una línea de respuesta
      else if (linea.startsWith('Resposta:')) {
        respuestaActual = linea.substring(10).trim();
        enigmasTexto += `${enigmaActual}\nResposta: ${respuestaActual}\n`; //Escribir el enigma y la respuesta en el archivo de salida
      }
    }
    fs.writeFileSync(nombreArchivoSalida, enigmasTexto); //Escribir enigmas y respuestas en el archivo de salida

    console.log(`Enigmas y respuestas guardados en ${nombreArchivoSalida}`);
  } catch (error) {
    console.error('Error al leer/escribir el archivo:', error);
  }
}

//Función para leer el archivo CSV y extraer los enigmas con sus respuestas
function leerEnigmas(nombreArchivo) {
  try {
    const contenido = fs.readFileSync(nombreArchivo, 'utf-8');
    const lineas = contenido.split('\n');
    const enigmas = [];

    // Recorrer cada línea del archivo CSV
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i].trim();
      // Separar la línea en enigma y respuesta utilizando "Resposta:" como separador
      const indiceSeparador = linea.indexOf("Resposta:");
      if (indiceSeparador !== -1) {
        const enigma = lineas[i - 1].trim();
        const respuesta = linea.substring(indiceSeparador + 9).trim();
        enigmas.push({ enigma, respuesta });
      }
    }

    //fs.unlinkSync(nombreArchivo); //Borrar el archivo después de leerlo
    return enigmas;
  } catch (error) {
    console.error('Error al leer el archivo:', error);
    return [];
  }
}

// Función para seleccionar aleatoriamente un enigma y su respuesta
function seleccionarEnigmaAleatorio(enigmas) {
  const indiceAleatorio = Math.floor(Math.random() * enigmas.length);
  return enigmas[indiceAleatorio];
}

client.on("connect", function () {
  console.log("Conectado al broker MQTT");
  let tema = "/Hit/Serveis/Contable/Impresora";
  //Suscribirse a un tema
  client.subscribe(tema, function (err) {
    if (err) {
      console.error("Error al suscribirse al tema", err);
    } else {
      console.log("Suscripción exitosa al tema", tema);
    }
  });
});

client.on("connect", function () {
  let tema = "/Hit/Serveis/Impresora";
  //Suscribirse a un tema
  client.subscribe(tema, function (err) {
    if (err) {
      console.error("Error al suscribirse al tema", err);
    } else {
      console.log("Suscripción exitosa al tema", tema);
    }
  });
});

//Manejar mensajes recibidos
client.on("message", async function (topic, message) {
  if (debug) {
    console.log(
      "Mensaje recibido en el tema:",
      topic,
      "- Contenido:",
      message.toString()
    );
  }
  try {
    const msgJson = JSON.parse(message);
    console.log('Mensaje en modo JSON:', msgJson);
    if (topic == '/Hit/Serveis/Impresora') {
      if (msgJson.msg && msgJson.macAddress) {
        console.log('Guardamos: ', msgJson.macAddress);
        if (!Impresiones[msgJson.macAddress]) {
          Impresiones[msgJson.macAddress] = []; //Si la clave no existe, crea un nuevo Vector
        }
        Impresiones[msgJson.macAddress].push(msgJson.msg);
        console.log('Texto:', Impresiones[msgJson.macAddress]);
      }
      else {
        console.log("Falta algun parametro");
      }

    }
  } catch (error) {
    //console.log(topic)
    let BTNrojo = 'Patata roja'
    let BTNazul = 'patata azul'
    let msg = '';
    let topicSplit = topic.split('/');
    let tema = "/" + topicSplit[1] + "/" + topicSplit[2] + "/" + topicSplit[3] + "/";
    //console.log(topicSplit);
    if (tema == "/Hit/Serveis/Impresora/") {
      const impresora = topicSplit[4]
      tema += impresora;
      suscribirseAlTema(tema)
      if (message.toString() == BTNrojo && mondongo) {
        startTimer();
        msg = 'Botiga';
        ticketNumberImprimir(topicSplit[4], msg, ticketNumberRojo)
      }
      else if (message.toString() == BTNazul && mondongo) {
        startTimer();
        msg = 'Taules';
        ticketNumberImprimir(topicSplit[4], msg, ticketNumberAzul)
      }
    }
  }
});

const startTimer = () => {
  console.log("Temporizador iniciado. Esperando 40 segundos...");
  mondongo = false;
  setTimeout(() => {
    mondongo = true
  }, 40000); // 40,000 milisegundos equivalen a 40 segundos
};

let mondongo = true;
const temasSuscritos = {};
const ticketNumberRojo = {};
const ticketNumberAzul = {};

function suscribirseAlTema(tema) {
  if (!temasSuscritos[tema]) {
    client.subscribe(tema, function (err) {
      if (err) {
        console.error("Error al suscribirse al tema", err);
      } else {
        console.log("Suscripción exitosa al tema", tema);
        // Marcar el tema como suscrito
        temasSuscritos[tema] = true;
      }
    });
  }
}

const crypto = require('crypto');

function encryptWhatsapp(text) {
  let encoding = 'base64';

  let key = 'buscoUnTrosDAhirPerEncriptarHITs';

  // Ensure the key length is 32 bytes for aes-256-cbc
  key = crypto.createHash('sha256').update(key).digest();

  function encrypt(plaintext) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf-8'),
        cipher.final(),
      ]);

      return iv.toString(encoding) + encrypted.toString(encoding);
    } catch (e) {
      console.error(e);
    }
  }

  return encrypt(text);
}

function replaceSpacesWithHyphens(text) {
  return text.replace(/ /g, '-');
}

//Nombre del archivo de entrada y de salida
const nombreArchivoEntrada = 'enigmas.csv';
const nombreArchivoSalida = 'enigmas_respuestas.csv';

async function ticketNumberImprimir(macAddress, msg, ticketNumber) {
  //escribirEnigmas(nombreArchivoEntrada, nombreArchivoSalida); //Llamada a la función para leer los enigmas del archivo de entrada y escribirlos en el archivo de salida
  //const listaEnigmas = leerEnigmas(nombreArchivoSalida); //Llamada a la función para leer los enigmas del archivo CSV
  //const enigmaAleatorio = seleccionarEnigmaAleatorio(listaEnigmas); //Seleccionar un enigma aleatorio
  /*
  //Mostrar el enigma y su respuesta aleatoria
  console.log('[Enigma aleatorio]');
  console.log('Enigma:', enigmaAleatorio.enigma);
  console.log('Respuesta:', enigmaAleatorio.respuesta);
  */
  if (!Impresiones[macAddress]) {
    Impresiones[macAddress] = [];
  }

  const empresa = 'Cal Forner';
  const hora = momentTimeZone().tz("Europe/Madrid").format('HH:mm:ss');
  const dependenta = 'Sonia';
  ticketNumberInicializar(macAddress, ticketNumber);
  const lic = "0";
  let enigmaId = 1, enigma = "", enigmaRespuesta = "";
  const sqlSelect = `SELECT TOP 1 * FROM enigmarius where not enigma='' ORDER BY NEWID();`
  try {
    const result = await runSql('Hit', sqlSelect);
    if (result && result.recordset && result.recordset.length > 0) {
      //console.log('Enigma aleatorio:', result.recordset[0].enigma);
      enigmaId = result.recordset[0].ID;
      enigma = result.recordset[0].enigma;
      enigmaRespuesta = result.recordset[0].respuesta;
    } else {
      console.log('No se encontraron enigmas.');
    }
  } catch (err) {
    console.error('Error al obtener el enigma aleatorio:', err);
  }
  const msgEncrypt = `Lic:${lic} Torn:${ticketNumber[macAddress]} EnigmaId:${enigmaId}`;
  const encryptedText = encryptWhatsapp(msgEncrypt);

  let messageTicket = "[bold: on]\[align: center]" + String.fromCharCode(13) + String.fromCharCode(10) +
    '================================================' + String.fromCharCode(13) + String.fromCharCode(10) +
    '[magnify: width 3; height 3]' +
    empresa + String.fromCharCode(13) + String.fromCharCode(10) +
    '[magnify: width 1; height 1]' +
    '================================================' + String.fromCharCode(13) + String.fromCharCode(10) +
    '********************************************' + String.fromCharCode(13) + String.fromCharCode(10) +
    '[magnify: width 2; height 2]' +
    'Numero: ' + ticketNumber[macAddress] + " - " + msg + String.fromCharCode(13) + String.fromCharCode(10) +
    '[magnify: width 1; height 1]' +
    '********************************************' + String.fromCharCode(13) + String.fromCharCode(10) +
    'Enigmàrius: ' + String.fromCharCode(13) + String.fromCharCode(10) + enigma + String.fromCharCode(13) + String.fromCharCode(10) + String.fromCharCode(13) + String.fromCharCode(10) +
    'Hora impressió:' + hora + String.fromCharCode(13) + String.fromCharCode(10) +
    'Espera un moment que la ' + dependenta + ' us atengui' + String.fromCharCode(13) + String.fromCharCode(10) +
    'Escaneja el QR per pistes i resposta !!' + String.fromCharCode(13) + String.fromCharCode(10) +
    `[barcode: type qr; data https://api.whatsapp.com/send?phone=34671286345&text=${Buffer.from(msgEncrypt).toString('base64')}; error-correction L; cell 6; model 2]`;

  //https://www.youtube.com/watch?v=dQw4w9WgXcQ //Rickroll
  //https://api.whatsapp.com/send?phone=34671286345&text=${encryptedText} //Cal Forner whatsapp BOT
  //console.log(macAddress);
  //console.log(encryptedText.length);
  //console.log(messageTicket);
  sendMQTTEnigma(macAddress, enigmaRespuesta); //Enviar respuesta de enigma por MQTT
  Impresiones[macAddress].push(messageTicket); //Meter a la cola el mensaje !!!
  ticketNumberIncrementar(macAddress, ticketNumber)
}

//Función que envia un mensaje MQTT al tema `/Hit/Serveis/Impresora/${licencia}/${macAddress}`
function sendMQTTEnigma(macAddress, msg) {
  client.publish(`/Hit/Serveis/Impresora/${macAddress}`, msg);
}

//Función que inicialicia un Vector
function ticketNumberInicializar(macAddress, ticketNumber) {
  if (!ticketNumber[macAddress]) {
    ticketNumber[macAddress] = 1;
  }
}

//Función que incremente el numero de un Vector
function ticketNumberIncrementar(macAddress, ticketNumber) {
  ticketNumberInicializar(macAddress, ticketNumber);
  ticketNumber[macAddress]++;
}

//Función para reinicializar los numeros de los Vectores
function reinicializarNumeros() {
  reinicializarVector(ticketNumberRojo);
  reinicializarVector(ticketNumberAzul);
}

//Función que reinicializar un Vector y lo pone a 1
function reinicializarVector(lista) {
  for (let macAddress in lista) {
    lista[macAddress] = 1;
  }
}

//Función para verificar si hay que reinicializar los Vectores
function verificarHoraReinicializacion() {
  const horaReinicializacion = '00:00'; // Hora de reinicialización (en formato de 24 horas)
  const ahora = new Date();
  const horaActual = ahora.getHours() + ':' + (ahora.getMinutes() < 10 ? '0' : '') + ahora.getMinutes();

  //Verificar si la hora actual es igual a la hora de reinicialización
  if (horaActual === horaReinicializacion) {
    //Llamar a la función de reinicialización
    reinicializarNumeros();
  }
}

app.post("/mqtt", async function (req, res) {
  //console.log("----------------------post message MQTT----------------------");
  let macAddress = req.body.printerMAC;
  //console.log("post message Post ", macAddress);
  const tema = `/Hit/Serveis/Impresora/${macAddress}`;
  //const tema = `/Hit/Serveis/Impresora/#`;
  suscribirseAlTema(tema);
  verificarHoraReinicializacion()
  let status = req.body["status"];
  sendMQTT(macAddress, status);
  res.writeHead(200, { "Content-Type": "text/plain" });
  if (Impresiones[macAddress] && Impresiones[macAddress].length > 0) {
    console.log("Impresiones: ", Impresiones[macAddress]);
    res.end(JSON.stringify({ jobReady: true, mediaTypes: ["text/plain"] }));
  } else {
    //    console.log("Nada a imprimir");
    res.end(JSON.stringify({ jobReady: false, mediaTypes: ["text/plain"] }));
  }
});

app.get("/mqtt", async function (req, res) {
  console.log("----------------------get message MQTT----------------------");
  let macAddress = req.query.mac;
  console.log("get message Get: ", macAddress);
  res.writeHead(200, { "Content-Type": "text/plain" });
  console.log("Impresiones: ", Impresiones[macAddress]);
  let filenameGet = "./files/tempFileGet" + Math.floor(Math.random() * 9999) + ".stm";
  let filenameOut = "./files/tempFileOut" + Math.floor(Math.random() * 9999) + ".bin";
  //console.log(data.recordset);
  fs.writeFile(filenameGet, Impresiones[macAddress][0], function (err) {
    if (err) {
      console.log("Error al escribir en el archivo", err);
      return;
    }
    exec(
      `"./cputil/cputil" utf8 thermal3 scale-to-fit decode application/vnd.star.line ./${filenameGet} ./${filenameOut}`,
      { env: { COREHOST_TRACE: '1' } }, // Establecer la variable de entorno COREHOST_TRACE
      (error, stdout, stderr) => {
        if (error) {
          console.warn("Error al ejecutar el comando", error);
          return;
        }

        fs.readFile(filenameOut, "utf8", (err, data) => {
          if (err) {
            console.error("Error al leer el archivo", err);
            return;
          }

          fs.writeFile("./files/Codis.bin", JSON.stringify(data), function (err) {
            if (err) {
              console.error("Error al escribir en el archivo Codis.bin", err);
              return;
            }

            fs.unlink(filenameGet, function (err) {
              if (err) {
                console.error("Error al eliminar el archivo", filenameGet, err);
                return;
              }
            });

            fs.unlink(filenameOut, function (err) {
              if (err) {
                console.error("Error al eliminar el archivo", filenameOut, err);
                return;
              }
            });

            res.end(data);
          });
        });
      }
    );
  });
  //res.end(Impresiones[macAddress][0]);
});

app.delete("/mqtt", async function (req, res) {
  console.log(
    "----------------------delete message MQTT----------------------"
  );
  let macAddress = req.query.mac;
  console.log("delete message Delete: ", macAddress);
  Impresiones[macAddress].shift();
  if (Impresiones[macAddress].length === 0) {
    delete Impresiones[macAddress];
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(JSON.stringify({ jobReady: false, mediaTypes: ["text/plain"] }));
});

//Imprimir pulsado boton {1,2,3}, si llega mensaje volver a 1.
function sendMQTT(macAddress, status) {
  const nowSpain = momentTimeZone().tz("Europe/Madrid").format();
  if (statusSpliter(status)) {
    if (!Impresiones[macAddress]) {
      Impresiones[macAddress] = [];
    }
    botonInicializar(macAddress);
    console.log("Boton: " + Boton[macAddress]);
    Impresiones[macAddress].push(
      "Se ha pulsado el boton " + Boton[macAddress] + " vez"
    );
    let msg = "";
    if (Boton[macAddress] == 1) msg = "ImpresoraIpReposicion";
    else if (Boton[macAddress] == 2) msg = "ImpresoraPremutBoto2";
    else if (Boton[macAddress] == 3) msg = "ImpresoraPremutBoto3";
    else msg = "Error";

    const message = JSON.stringify({
      mac: macAddress,
      msg: msg,
      time: nowSpain, // Convertir la fecha a un formato ISO string
    });
    client.publish("/Hit/Serveis/Contable/Impresora", message);
    botonIncrementar(macAddress);
  } else {
    const message = JSON.stringify({
      mac: macAddress,
      msg: "BotonNoPremut",
      time: nowSpain, // Convertir la fecha a un formato ISO string
    });
    //client.publish('/Hit/Serveis/Contable/Impresora', message);
    //    console.log("La tercera posición de status no es un 4"); //No se ha pulsado el boton
  }
}

function statusSpliter(status) {
  const partes = status.split(" "); // Dividir la cadena en partes separadas por espacios
  return partes.length >= 3 && partes[2] === "4"; // Verificar si hay al menos 3 partes y la tercera es '4'
}

function botonInicializar(macAddress) {
  if (!Boton[macAddress]) {
    Boton[macAddress] = 1;
  }
}

function botonIncrementar(macAddress) {
  botonInicializar(macAddress);
  if (Boton[macAddress] < 3) {
    Boton[macAddress]++;
  } else {
    Boton[macAddress] = 1;
  }
}

//MQTT

app.post("/printer", async function (req, res) {
  process.stdout.write(".");
  //console.log('get message 2')
  try {
    let macAddress = req.body.printerMAC;
    //console.log('macAddress', macAddress);
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
    Sql += `DECLARE @ImpresoraNom nvarchar(30); `;
    Sql += `DECLARE @Empresa nvarchar(20); `;
    Sql += `declare @ImpresoraCodi nvarchar(20); `;
    Sql += `DECLARE @Sql nvarchar(3000); `;
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
    Sql += `		insert into [Hit].[dbo].[ImpresoraCola] (id,impresora,Texte,TmStPeticio) values (newid(),@ImpresoraNom, 'Impressora NO Configurada. Truqueu al [bold:on]937161010 [bold:off] \n Codi impressora: \n [magnify: width 2; height 2] \n ' +@ImpresoraNom+ ' \n [magnify: width 1; height 1] \n Gràcies :) ',getdate()) `;
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
    Sql += `		set @Sql = @Sql + '		insert into [' +@Empresa + '].[dbo].[ImpresoraCola] (id,impresora,Texte,TmStPeticio) values (newid(),' +CHAR(39)+ @ImpresoraNom + CHAR(39)+ ', ' +CHAR(39)+ '[magnify: width 2; height 2]Impressió CANCEL·LADA!!! [magnify: width 1; height 1]' +CHAR(39)+ ',getdate()) ' `;
    Sql += `		set @Sql = @Sql + '	end ' `;
    Sql += `		set @Sql = @Sql + 'else '	 `;
    Sql += `		set @Sql = @Sql + 'if (@click > 0)'  `;
    Sql += `		set @Sql = @Sql + '	begin ' `;
    Sql += `		set @Sql = @Sql + '		Delete [' +@Empresa + '].[dbo].FeinesAFer where Tipus = ' +CHAR(39)+ 'ImpresoraIpReposicion' +CHAR(39)+ ' and Param1 = ' +CHAR(39)+ @ImpresoraNom + CHAR(39)+' ' `;
    Sql += `		set @Sql = @Sql + '		Insert Into [' +@Empresa + '].[dbo].FeinesAFer (id, Tipus,Ciclica,Param1) Values (newid(), ' +CHAR(39)+ 'ImpresoraPremutBoto2' +CHAR(39)+ ',0,' +CHAR(39)+ @ImpresoraNom + CHAR(39)+')' `;
    Sql += `		set @Sql = @Sql + '		insert into [' +@Empresa + '].[dbo].[ImpresoraCola] (id,impresora,Texte,TmStPeticio) values (newid(),' +CHAR(39)+ @ImpresoraNom + CHAR(39)+ ', ' +CHAR(39)+ '[magnify: width 2; height 2]Segon llistat demanat. Si tornes a prémer el botó es cancel·larà la impressió. [magnify: width 1; height 1]' +CHAR(39)+ ',getdate())' `;
    Sql += `		set @Sql = @Sql + '	end ' `;
    Sql += `		set @Sql = @Sql + 'else '		 `;
    Sql += `		set @Sql = @Sql + '	begin ' `;
    Sql += `		set @Sql = @Sql + '		Insert Into [' +@Empresa + '].[dbo].FeinesAFer (id, Tipus,Ciclica,Param1) Values (newid(), ' +CHAR(39)+ 'ImpresoraIpReposicion' +CHAR(39)+ ',0,' +CHAR(39)+ @ImpresoraNom + CHAR(39)+')' `;
    Sql += `		set @Sql = @Sql + '		insert into [' +@Empresa + '].[dbo].[ImpresoraCola] (id,impresora,Texte,TmStPeticio) values (newid(),' +CHAR(39)+ @ImpresoraNom + CHAR(39)+ ', ' +CHAR(39)+ '[magnify: width 2; height 2]Petició de reposició feta... [magnify: width 1; height 1]' +CHAR(39)+ ',getdate())' `;
    Sql += `		set @Sql = @Sql + '	end ' `;
    Sql += ` `;
    Sql += `		EXEC  sp_executesql  @Sql `;
    Sql += `	end `;
    Sql += `end `;
    Sql += `set @Sql='select count(*) Q from ' + @Empresa + '.[dbo].[ImpresoraCola] where Impresora=' +CHAR(39)+ @ImpresoraNom + CHAR(39);`;
    Sql += `EXEC  sp_executesql  @Sql`;

    //console.log(Sql);

    conexion
      .recHit("Hit", Sql)
      .then((data) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        //console.log(data.recordset[0]["Q"]);

        if (data.recordset[0]["Q"] > 0) {
          res.end(
            JSON.stringify({ jobReady: true, mediaTypes: ["text/plain"] })
          );
        }
        else {
          res.end(
            JSON.stringify({ jobReady: false, mediaTypes: ["text/plain"] })
          );
          //console.log("patata");
        }
      })
      .catch((err) => {
        res.end("Error");
      });
  } catch (error) {
    console.log("Error: ", error);
  }
});

app.get("/printer", async function (req, res) {
  process.stdout.write("*");
  //console.log('get message', req)
  try {
    res.writeHead(200, { "Content-Type": "text/plain" });
    let macAddress = req.query.mac;
    //console.log('macAddress', macAddress);
    var response = "ERROR CON EL SERVIDOR, PORFAVOR CONTACTE CON HIT";
    let Sql = ``;
    Sql += `DECLARE @MyMac nvarchar(20); `;
    Sql += `DECLARE @ImpresoraNom nvarchar(30); `;
    Sql += `DECLARE @Empresa nvarchar(20); `;
    Sql += `DECLARE @Sql nvarchar(3000); `;
    Sql += `Set @MyMac = '${macAddress}'; `;
    Sql += `select  @ImpresoraNom = nom,@Empresa = empresa  from ImpresorasIp where Mac = @MyMac `;
    Sql += `set @Sql=       'DECLARE @I varchar(max);' `;
    Sql += `set @Sql=@Sql + 'DECLARE @T varchar(max);' `;
    Sql += `set @Sql=@Sql + 'SELECT top 1 @T= texte, @I=id FROM ' + @Empresa + '.[dbo].[ImpresoraCola] where Impresora=' +CHAR(39)+ @ImpresoraNom + CHAR(39) + ' order by tmstpeticio '; `;
    Sql += `set @Sql=@Sql + 'delete ' + @Empresa + '.[dbo].[ImpresoraCola] Where id=@I ' ; `;
    Sql += `set @Sql=@Sql + 'Select @T ;' `;
    Sql += `EXEC  sp_executesql  @Sql`;
    conexion.recHit("Hit", Sql).then((data) => {
      let filenameGet = "./files/tempFileGet" + Math.floor(Math.random() * 9999) + ".stm";
      let filenameOut = "./files/tempFileOut" + Math.floor(Math.random() * 9999) + ".bin";
      if (data.recordset == undefined)
        return res.end("Error");
      //console.log(data.recordset);
      let msg = processOldCodes(data.recordset[0][""]);
      fs.writeFile(filenameGet, msg, function (err) {
        if (err) console.log("1", err);
        else {
          if (msg.includes("BOTÓ")|| msg.includes("comandero")) {
            exec(
              `"./cputil/cputil" utf8 thermal3 buzzer-start 2 scale-to-fit decode application/vnd.star.line ./${filenameGet} ./${filenameOut}`,
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
          } else {
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
        }
      });
    });
  } catch (error) {
    console.log("Error: ", error);
  }
});

app.delete("/printer", async function (req, res) {
  //console.log('get message 3')
  let macAddress = req.query.mac;
  let servitDate = `[Servit-${moment().format("YY-MM-DD")}]`;
  let empresaSQL = `select  nom,empresa  from ImpresorasIp where Mac = '${macAddress}' `;
  conexion
    .recHit("Hit", empresaSQL)
    .then((empresa) => {
      if (
        !empresa.recordset[0].nom.includes("Tienda") &&
        (!empresa.recordset[0].nom.includes("Tot") || !empresa.recordset[0].nom.includes("Panadero"))
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
  //var host = "https://impresoras.nubehit.com";
  //host = "54.77.231.164";
  //host = "192.168.1.148";
  var host = "localhost";
  var port = server.address().port;
  console.log("API app listening at http://%s:%s", host, port);
});

app.get("/", function (req, res) {
  res.status(200).sendFile(path.join(__dirname, "public", "index.html"));
});