const conexion = require("./conexion");
require("dotenv").config();
const moment = require("moment");
const path = require("path");
const fs = require("fs").promises;
const { existsSync } = require("fs");
const { exec } = require("node:child_process");
const util = require("node:util");
const execPromise = util.promisify(exec);
const express = require("express");

const app = express();
const procesedMacs = [];
const IS_WINDOWS = process.platform === "win32";

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

    if (!macAddress) return res.status(400).end("Missing printerMAC");

    if (!procesedMacs.includes(macAddress)) {
      try {
        const data = await conexion.runSql("Hit",
          `SELECT * FROM ImpresorasIp WHERE Mac = @mac;`,
          { mac: macAddress }
        );
        if (data?.rowsAffected[0] === 0) {
          const nomMac = macAddress?.split(":").join("");
          const insertMac = `INSERT INTO ImpresorasIp (Id, TmSt, Mac, Empresa, Nom, estado, ping) 
                             VALUES (NEWID(), NULL, @mac, 'Hit', @nom, 0, NULL)`;
          await conexion.runSql("Hit", insertMac, { mac: macAddress, nom: nomMac });
        }
        procesedMacs.push(macAddress);
      } catch (err) {
        console.error("Error processing MAC:", err);
      }
    }

    const botoApretat = status?.substring(5, 6) === "4" ? 1 : 0;
    const Sql = `
      DECLARE @MyMac nvarchar(20) = @mac;
      DECLARE @ImpresoraNom nvarchar(30);
      DECLARE @Empresa nvarchar(20);
      DECLARE @Sql nvarchar(max);
      DECLARE @BotoApretat BIT = @isPressed;

      SELECT @ImpresoraNom = nom, @Empresa = empresa FROM ImpresorasIp WHERE Mac = @MyMac;
      
      IF (@ImpresoraNom IS NOT NULL)
      BEGIN
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
              DECLARE @click numeric, @click2 numeric, @imp numeric;
              SELECT @click = SUM(Alb), @click2 = SUM(Prod), @imp = SUM(Imp) FROM (
                SELECT COUNT(*) Alb, 0 Prod, 0 Imp FROM [' + @Empresa + '].[dbo].FeinesAFer WHERE tipus = ''ImpresoraIpReposicion'' AND param1 = @P1
                UNION
                SELECT 0 Alb, COUNT(*) Prod, 0 Imp FROM [' + @Empresa + '].[dbo].FeinesAFer WHERE tipus = ''ImpresoraPremutBoto2'' AND param1 = @P1
                UNION
                SELECT 0 Alb, 0 Prod, COUNT(*) Imp FROM [' + @Empresa + '].[dbo].ImpresoraCola WHERE Impresora = @P1
              ) s;
              
              IF (@imp > 0 OR @click2 > 0)
              BEGIN
                DELETE [' + @Empresa + '].[dbo].[ImpresoraCola] WHERE impresora = @P1;
                DELETE [' + @Empresa + '].[dbo].FeinesAFer WHERE (tipus = ''ImpresoraIpReposicion'' OR tipus = ''ImpresoraPremutBoto2'') AND param1 = @P1;
                INSERT INTO [' + @Empresa + '].[dbo].[ImpresoraCola] (id, impresora, Texte, TmStPeticio) VALUES (NEWID(), @P1, ''[magnify: width 2; height 2]Impressió CANCEL·LADA!!! [magnify: width 1; height 1] \n \n Nom impressora: [bold:on] '' + @P1 + '' [bold:off]'', GETDATE());
              END
              ELSE IF (@click > 0)
              BEGIN
                DELETE [' + @Empresa + '].[dbo].FeinesAFer WHERE Tipus = ''ImpresoraIpReposicion'' AND Param1 = @P1;
                INSERT INTO [' + @Empresa + '].[dbo].FeinesAFer (id, Tipus, Ciclica, Param1) VALUES (NEWID(), ''ImpresoraPremutBoto2'', 0, @P1);
                INSERT INTO [' + @Empresa + '].[dbo].[ImpresoraCola] (id, impresora, Texte, TmStPeticio) VALUES (NEWID(), @P1, ''[magnify: width 2; height 2]Segon llistat demanat. Si tornes a prémer el botó es cancel·larà la impressió. [magnify: width 1; height 1] \n \n Nom impressora: [bold:on] '' + @P1 + '' [bold:off]'', GETDATE());
              END
              ELSE
              BEGIN
                INSERT INTO [' + @Empresa + '].[dbo].FeinesAFer (id, Tipus, Ciclica, Param1) VALUES (NEWID(), ''ImpresoraIpReposicion'', 0, @P1);
                INSERT INTO [' + @Empresa + '].[dbo].[ImpresoraCola] (id, impresora, Texte, TmStPeticio) VALUES (NEWID(), @P1, ''[magnify: width 2; height 2]Petició de reposició feta... [magnify: width 1; height 1] \n \n Nom impressora: [bold:on] '' + @P1 + '' [bold:off]'', GETDATE());
              END';
            EXEC sp_executesql @Sql, N'@P1 nvarchar(30)', @P1 = @ImpresoraNom;
          END
        END

        SET @Sql = 'SELECT COUNT(*) Q FROM [' + @Empresa + '].[dbo].[ImpresoraCola] WHERE Impresora = @P1';
        EXEC sp_executesql @Sql, N'@P1 nvarchar(30)', @P1 = @ImpresoraNom;
      END
      ELSE
      BEGIN
        SELECT 0 as Q;
      END
    `;

    const data = await conexion.runSql("Hit", Sql, { mac: macAddress, isPressed: botoApretat });
    res.status(200).json({ jobReady: data.recordset[0]?.["Q"] > 0, mediaTypes: ["text/plain"] });

  } catch (error) {
    console.error("Error in POST /printer:", error);
    res.status(500).end("Error");
  }
});

app.get("/printer", async (req, res) => {
  process.stdout.write("*");
  try {
    const macAddress = req.query.mac;
    if (!macAddress) return res.status(400).end("Missing mac");

    const Sql = `
      DECLARE @MyMac nvarchar(20) = @mac;
      DECLARE @ImpresoraNom nvarchar(30);
      DECLARE @Empresa nvarchar(20);
      DECLARE @Sql nvarchar(max);

      SELECT @ImpresoraNom = nom, @Empresa = empresa FROM ImpresorasIp WHERE Mac = @MyMac;

      IF (@ImpresoraNom IS NOT NULL)
      BEGIN
        SET @Sql = '
          DECLARE @I varchar(max);
          DECLARE @T varchar(max);
          SELECT TOP 1 @T = texte, @I = id FROM [' + @Empresa + '].[dbo].[ImpresoraCola] WHERE Impresora = @P1 ORDER BY tmstpeticio;
          DELETE FROM [' + @Empresa + '].[dbo].[ImpresoraCola] WHERE id = @I;
          SELECT @T';
        EXEC sp_executesql @Sql, N'@P1 nvarchar(30)', @P1 = @ImpresoraNom;
      END
    `;

    const data = await conexion.runSql("Hit", Sql, { mac: macAddress });
    if (!data.recordset || data.recordset.length === 0 || data.recordset[0][""] === undefined) {
      return res.status(200).end("");
    }

    const msg = processOldCodes(data.recordset[0][""] || "");
    const randomId = Math.floor(Math.random() * 9999);

    // Resolve absolute paths for files
    const filenameGet = path.resolve(__dirname, "files", `tempFileGet${randomId}.stm`);
    const filenameOut = path.resolve(__dirname, "files", `tempFileOut${randomId}.bin`);

    await fs.writeFile(filenameGet, msg);

    const isBuzzer = msg.includes("BOTÓ") || msg.includes("comandero");
    const cputilArgs = isBuzzer ? "buzzer-start 2" : "";

    // Cross-platform command logic
    let cputilCmd = "";
    if (IS_WINDOWS) {
      const cpuPathWin = path.join(__dirname, "cputil", "cputil.exe");
      if (existsSync(cpuPathWin)) {
        cputilCmd = `"${cpuPathWin}" utf8 thermal3 ${cputilArgs} scale-to-fit decode application/vnd.star.line "${filenameGet}" "${filenameOut}"`;
      } else {
        console.warn("[Local Testing] cputil.exe not found. Skipping binary execution on Windows.");
      }
    } else {
      // Standard for Docker/Linux
      cputilCmd = `"./cputil/cputil" utf8 thermal3 ${cputilArgs} scale-to-fit decode application/vnd.star.line "${filenameGet}" "${filenameOut}"`;
    }

    try {
      if (cputilCmd) {
        await execPromise(cputilCmd);
        const binData = await fs.readFile(filenameOut, "utf8");
        await fs.writeFile(path.resolve(__dirname, "files", "Codis.bin"), JSON.stringify(binData)).catch(() => { });
        res.status(200).set("Content-Type", "text/plain").send(binData);
      } else {
        res.status(200).set("Content-Type", "text/plain").send("OK_DRY_RUN_" + randomId);
      }
    } catch (execError) {
      console.warn("cputil execution failed (Expected if not on Linux):", execError.message);
      res.status(200).end("");
    } finally {
      await fs.unlink(filenameGet).catch(() => { });
      await fs.unlink(filenameOut).catch(() => { });
    }

  } catch (error) {
    console.error("Error in GET /printer:", error);
    res.status(500).end("");
  }
});

app.delete("/printer", async (req, res) => {
  try {
    const macAddress = req.query.mac;
    if (!macAddress) return res.status(400).end("Missing mac");

    const servitTable = `[Servit-${moment().format("YY-MM-DD")}]`;
    const empresaSQL = `SELECT nom, empresa FROM ImpresorasIp WHERE Mac = @mac`;

    const empresaData = await conexion.runSql("Hit", empresaSQL, { mac: macAddress });
    if (!empresaData.recordset[0]) return res.status(200).end("none");

    const { nom, empresa } = empresaData.recordset[0];

    if (!nom.includes("Tienda") && !nom.includes("Tot") && !nom.includes("Panadero")) {
      return res.status(200).end("none");
    }

    const updateSQL = `
      UPDATE ${servitTable} 
      SET Hora = @hora, 
      comentari = @comment 
      WHERE client = @client AND Hora = 1
    `;

    const params = {
      hora: moment().hour(),
      comment: `Reposicion[IMP ${moment().format("HH:mm:ss")}]`,
      client: nom.split("_")[1]
    };

    try {
      await conexion.runSql(empresa, updateSQL, params);
    } catch (sqlErr) {
      if (sqlErr.number === 208) { // Invalid object name (table not found in the target DB)
        console.warn(`Table ${servitTable} not found in database ${empresa}.`);
      } else {
        throw sqlErr;
      }
    }
    res.status(200).end("none");

  } catch (error) {
    console.error("Error in DELETE /printer:", error);
    res.status(500).end("Error");
  }
});

app.get("/", (req, res) => {
  res.status(200).sendFile(path.join(__dirname, "public", "index.html"));
});

const server = app.listen(app.get("port"), () => {
  console.log("API app listening at http://localhost:%s", server.address().port);
});