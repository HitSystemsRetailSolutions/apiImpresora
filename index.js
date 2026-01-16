const conexion = require("./conexion");
require("dotenv").config();
const moment = require("moment");
const path = require("path");
const fs = require("fs");
const { exec } = require("node:child_process");
const express = require("express");

const app = express();
const procesedMacs = [];

app.set("port", process.env.PORT || 4040);

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

function processOldCodes(msg) {
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

app.post("/printer", async (req, res) => {
  process.stdout.write(".");
  try {
    const macAddress = req.body.printerMAC;
    const status = req.body["status"];

    if (!procesedMacs.includes(macAddress)) {
      try {
        const data = await conexion.runSql("Hit", `SELECT * FROM ImpresorasIp WHERE Mac = '${macAddress}';`);
        if (data?.rowsAffected[0] === 0) {
          const insertMac = `INSERT INTO ImpresorasIp (Id, TmSt, Mac, Empresa, Nom, estado, ping) 
                             VALUES (NEWID(), NULL, '${macAddress}', 'Hit', '${macAddress?.split(":").join("")}', 0, NULL)`;
          await conexion.runSql("Hit", insertMac);
        }
        procesedMacs.push(macAddress);
      } catch (err) {
        console.error("Error processing MAC:", err);
      }
    }

    const Sql = `
      DECLARE @MyMac nvarchar(20) = '${macAddress}';
      DECLARE @ImpresoraNom nvarchar(30);
      DECLARE @Empresa nvarchar(20);
      DECLARE @Sql nvarchar(3000);
      DECLARE @BotoApretat BIT = ${status.substring(5, 6) === "4" ? 1 : 0};

      SELECT @ImpresoraNom = nom, @Empresa = empresa FROM ImpresorasIp WHERE Mac = @MyMac;
      UPDATE ImpresorasIp SET TmSt = GETDATE() WHERE Mac = @MyMac;

      IF (@BotoApretat = 1)
      BEGIN
        IF (@Empresa = 'Hit')
        BEGIN
          DELETE [Hit].[dbo].[ImpresoraCola] WHERE Impresora = @ImpresoraNom;
          INSERT INTO [Hit].[dbo].[ImpresoraCola] (id, impresora, Texte, TmStPeticio)
          VALUES (NEWID(), @ImpresoraNom, 'Impressora NO Configurada. Truqueu al [bold:on]937161010 [bold:off] \n Codi impressora: \n [magnify: width 2; height 2] \n ' + @ImpresoraNom + ' \n [magnify: width 1; height 1] \n Gràcies :) ', GETDATE());
        END
        ELSE
        BEGIN
          SET @Sql = '
            DECLARE @click numeric;
            DECLARE @click2 numeric;
            DECLARE @imp numeric;
            SELECT @click = SUM(Alb), @click2 = SUM(Prod), @imp = SUM(Imp) FROM (
              SELECT COUNT(*) Alb, 0 Prod, 0 Imp FROM [' + @Empresa + '].[dbo].FeinesAFer WHERE tipus = ''ImpresoraIpReposicion'' AND param1 = ''' + @ImpresoraNom + '''
              UNION
              SELECT 0 Alb, COUNT(*) Prod, 0 Imp FROM [' + @Empresa + '].[dbo].FeinesAFer WHERE tipus = ''ImpresoraPremutBoto2'' AND param1 = ''' + @ImpresoraNom + '''
              UNION
              SELECT 0 Alb, 0 Prod, COUNT(*) Imp FROM [' + @Empresa + '].[dbo].ImpresoraCola WHERE Impresora = ''' + @ImpresoraNom + '''
            ) s;
            
            IF (@imp > 0 OR @click2 > 0)
            BEGIN
              DELETE [' + @Empresa + '].[dbo].[ImpresoraCola] WHERE impresora = ''' + @ImpresoraNom + '''
              DELETE [' + @Empresa + '].[dbo].FeinesAFer WHERE (tipus = ''ImpresoraIpReposicion'' OR tipus = ''ImpresoraPremutBoto2'') AND param1 = ''' + @ImpresoraNom + '''
              INSERT INTO [' + @Empresa + '].[dbo].[ImpresoraCola] (id, impresora, Texte, TmStPeticio) VALUES (NEWID(), ''' + @ImpresoraNom + ''', ''[magnify: width 2; height 2]Impressió CANCEL·LADA!!! [magnify: width 1; height 1] \n \n Nom impressora: [bold:on] '' + @ImpresoraNom + '' [bold:off]'', GETDATE())
            END
            ELSE IF (@click > 0)
            BEGIN
              DELETE [' + @Empresa + '].[dbo].FeinesAFer WHERE Tipus = ''ImpresoraIpReposicion'' AND Param1 = ''' + @ImpresoraNom + '''
              INSERT INTO [' + @Empresa + '].[dbo].FeinesAFer (id, Tipus, Ciclica, Param1) VALUES (NEWID(), ''ImpresoraPremutBoto2'', 0, ''' + @ImpresoraNom + ''')
              INSERT INTO [' + @Empresa + '].[dbo].[ImpresoraCola] (id, impresora, Texte, TmStPeticio) VALUES (NEWID(), ''' + @ImpresoraNom + ''', ''[magnify: width 2; height 2]Segon llistat demanat. Si tornes a prémer el botó es cancel·larà la impressió. [magnify: width 1; height 1] \n \n Nom impressora: [bold:on] '' + @ImpresoraNom + '' [bold:off]'', GETDATE())
            END
            ELSE
            BEGIN
              INSERT INTO [' + @Empresa + '].[dbo].FeinesAFer (id, Tipus, Ciclica, Param1) VALUES (NEWID(), ''ImpresoraIpReposicion'', 0, ''' + @ImpresoraNom + ''')
              INSERT INTO [' + @Empresa + '].[dbo].[ImpresoraCola] (id, impresora, Texte, TmStPeticio) VALUES (NEWID(), ''' + @ImpresoraNom + ''', ''[magnify: width 2; height 2]Petició de reposició feta... [magnify: width 1; height 1] \n \n Nom impressora: [bold:on] '' + @ImpresoraNom + '' [bold:off]'', GETDATE())
            END';
          EXEC sp_executesql @Sql;
        END
      END

      SET @Sql = 'SELECT COUNT(*) Q FROM ' + @Empresa + '.[dbo].[ImpresoraCola] WHERE Impresora = ''' + @ImpresoraNom + '''';
      EXEC sp_executesql @Sql;
    `;

    const data = await conexion.runSql("Hit", Sql);
    res.writeHead(200, { "Content-Type": "text/plain" });

    if (data.recordset[0]["Q"] > 0) {
      res.end(JSON.stringify({ jobReady: true, mediaTypes: ["text/plain"] }));
    } else {
      res.end(JSON.stringify({ jobReady: false, mediaTypes: ["text/plain"] }));
    }
  } catch (error) {
    console.error("Error in POST /printer:", error);
    res.status(500).end("Error");
  }
});

app.get("/printer", async (req, res) => {
  process.stdout.write("*");
  try {
    const macAddress = req.query.mac;
    const Sql = `
      DECLARE @MyMac nvarchar(20) = '${macAddress}';
      DECLARE @ImpresoraNom nvarchar(30);
      DECLARE @Empresa nvarchar(20);
      DECLARE @Sql nvarchar(3000);

      SELECT @ImpresoraNom = nom, @Empresa = empresa FROM ImpresorasIp WHERE Mac = @MyMac;

      SET @Sql = '
        DECLARE @I varchar(max);
        DECLARE @T varchar(max);
        SELECT TOP 1 @T = texte, @I = id FROM [' + @Empresa + '].[dbo].[ImpresoraCola] WHERE Impresora = ''' + @ImpresoraNom + ''' ORDER BY tmstpeticio;
        DELETE FROM [' + @Empresa + '].[dbo].[ImpresoraCola] WHERE id = @I;
        SELECT @T;
      ';
      EXEC sp_executesql @Sql;
    `;

    const data = await conexion.runSql("Hit", Sql);
    if (!data.recordset) return res.status(200).end("Error");

    const msg = processOldCodes(data.recordset[0][""]);
    const filenameGet = `./files/tempFileGet${Math.floor(Math.random() * 9999)}.stm`;
    const filenameOut = `./files/tempFileOut${Math.floor(Math.random() * 9999)}.bin`;

    fs.writeFile(filenameGet, msg, (err) => {
      if (err) {
        console.error("File write error:", err);
        return res.status(200).end("Error");
      }

      const isBuzzer = msg.includes("BOTÓ") || msg.includes("comandero");
      const cputilCmd = isBuzzer
        ? `"./cputil/cputil" utf8 thermal3 buzzer-start 2 scale-to-fit decode application/vnd.star.line ./${filenameGet} ./${filenameOut}`
        : `"./cputil/cputil" utf8 thermal3 scale-to-fit decode application/vnd.star.line ./${filenameGet} ./${filenameOut}`;

      exec(cputilCmd, (error) => {
        if (error) {
          console.warn("Exec error:", error);
          res.status(200).end("Error");
        } else {
          fs.readFile(filenameOut, "utf8", (err, binData) => {
            if (err) return res.status(200).end("read error");

            fs.writeFile("./files/Codis.bin", JSON.stringify(binData), () => { });
            fs.unlink(filenameGet, () => { });
            fs.unlink(filenameOut, () => { });
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end(binData);
          });
        }
      });
    });
  } catch (error) {
    console.error("Error in GET /printer:", error);
    res.status(200).end("Error");
  }
});

app.delete("/printer", async (req, res) => {
  try {
    const macAddress = req.query.mac;
    const servitDate = `[Servit-${moment().format("YY-MM-DD")}]`;
    const empresaSQL = `SELECT nom, empresa FROM ImpresorasIp WHERE Mac = '${macAddress}'`;

    const empresaData = await conexion.runSql("Hit", empresaSQL);
    if (!empresaData.recordset[0]) return res.end("none");

    const nom = empresaData.recordset[0].nom;
    const empresa = empresaData.recordset[0].empresa;

    if (!nom.includes("Tienda") && !nom.includes("Tot") && !nom.includes("Panadero")) {
      return res.end("none");
    }

    const updateSQL = `
      UPDATE ${servitDate} 
      SET Hora = ${moment().hour()}, 
      comentari = 'Reposicion[${"IMP " + moment().format("hh:mm:ss")}]' 
      WHERE client = '${nom.split("_")[1]}' AND Hora = 1
    `;
    await conexion.runSql(empresa, updateSQL);
    res.end("none");
  } catch (error) {
    console.error("Error in DELETE /printer:", error);
    res.end("Error");
  }
});

app.get("/", (req, res) => {
  res.status(200).sendFile(path.join(__dirname, "public", "index.html"));
});

const server = app.listen(app.get("port"), () => {
  const port = server.address().port;
  console.log("API app listening at http://localhost:%s", port);
});