const conexion = require("./conexion");
//http://santaana2.nubehit.com:4040/printer
var express = require("express");
const fs = require("fs");
const { exec } = require("node:child_process");
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/:printer", async function (req, res) {
  console.log("paso2");
  process.stdout.write("*");
  try {
    res.writeHead(200, { "Content-Type": "text/plain" });
    let macAdress = req.rawHeaders[21];
    var response = "ERROR CON EL SERVIDOR, PORFAVOR CONTACTE CON HIT";
    let Sql = ``;
    Sql += `DECLARE @MyMac nvarchar(20); `;
    Sql += `DECLARE @ImpresoraNom nvarchar(20); `;
    Sql += `DECLARE @Empresa nvarchar(20); `;
    Sql += `DECLARE @Sql nvarchar(2000); `;
    Sql += `Set @MyMac = '${macAdress}'; `;
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
      fs.writeFile(filenameGet, data.recordset[0][""], function (err) {
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
                    function (err) {}
                  );

                  fs.unlink(filenameGet, function (err) {});
                  fs.unlink(filenameOut, function (err) {});
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

app.post("/:printer", async function (req, res) {
  process.stdout.write(".");
  try {
    let macAdress = req.rawHeaders[11];
    let status = req.body["status"];
    if (!procesedMacs.includes(macAdress))
      conexion
        .recHit(
          "Hit",
          `select  * from ImpresorasIp where Mac = '${macAdress}';`
        )
        .then((data) => {
          if (data?.rowsAffected[0] == 0) {
            let insertMac = `insert into ImpresorasIp (Id,TmSt, Mac, Empresa, Nom,estado,ping) values (NEWID(),null,'${macAdress}','Hit','${macAdress
              ?.split(":")
              .join("")}',0,null)`;
            conexion.recHit("Hit", insertMac).catch((err) => {
              res.end("Error");
            });
          }
          procesedMacs.push(macAdress);
        })
        .catch((err) => {
          res.end("Error");
        });
    //process.stdout.write(macAdress)
    let Sql = ``;
    Sql += `DECLARE @MyMac nvarchar(20); `;
    Sql += `DECLARE @ImpresoraNom nvarchar(20); `;
    Sql += `DECLARE @Empresa nvarchar(20); `;
    Sql += `declare @ImpresoraCodi nvarchar(20); `;
    Sql += `DECLARE @Sql nvarchar(2000); `;
    Sql += `Declare @BotoApretat BIT; `;
    Sql += `Set @MyMac = '${macAdress}'; `;
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

var server = app.listen(app.get("port"), function () {
  var host = "http://santaana2.nubehit.com";
  host = "192.168.1.148";
  var port = server.address().port;

  console.log("API app listening at http://%s:%s", host, port);
});
