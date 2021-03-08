"use strict";
const process = require("process");
//process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
const express = require("express");
const app = express();
const helmet = require("helmet");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const Syslog = require('simple-syslog-server') ;
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const uuid = require("uuid");
const winston = require('winston');
const { format } = winston;
const { combine, label, json } = format;
const RedisSMQ = require("rsmq");
const rsmq = new RedisSMQ( {host: "127.0.0.1", port: 6379, ns: "rsmq"} );
const rsmqWorker = require("rsmq-worker")
const worker = new rsmqWorker( "api-uat-error" ,{
    host: "127.0.0.1",
    port: 6379,
    ns: "rsmq"
});

const AMSworker = new rsmqWorker( "ams-uat-error" ,{
    host: "127.0.0.1",
    port: 6379,
    ns: "rsmq"
});

// SETTING UP

//
// Configure the logger for `api-uat-error`
//
winston.loggers.add('api-uat-error', {
  format: combine(
    label({ label: 'api-uat-error' }),
    json()
  ),
  transports: [
    new winston.transports.File({ filename: 'api-uat-error.log' })
  ]
});

//
// Configure the logger for `ams-uat-error`
//
winston.loggers.add('ams-uat-error', {
  format: combine(
    label({ label: 'ams-uat-error' }),
    json()
  ),
    transports: [
        new winston.transports.File({ filename: 'ams-uat-error.log' })
    //new winston.transports.Http({ host: 'localhost', port:8080 })
  ]
});

const categoryAPI = winston.loggers.get('api-uat-error');
const categoryAMS = winston.loggers.get('ams-uat-error');

// 

// const logger = winston.createLogger({
//   level: 'info',
//   format: winston.format.json(),
//   defaultMeta: { service: 'api-uat-error' },
//   transports: [
//     new winston.transports.File({ filename: 'api-uat-error.log' }),
//   ],
// });

if (process.env.NODE_ENV == "development") {
  console.log("Server using development mode");
  app.use(errorhandler({ log: errorNotification }));
  process.on("warning", (warning) => {
    console.warn(warning.name); // 'Warning'
    console.warn(warning.message); // 'Something happened!'
    console.warn(warning.code); // 'MY_WARNING'
    console.warn(warning.stack); // Stack trace
    console.warn(warning.detail); // 'This is some additional information'
  });
} else {
  console.log("Server using production mode");
  /** Seting up server to accept cross-origin browser requests */
  app.use(function (req, res, next) {
    //allow cross origin requests
    res.setHeader(
      "Access-Control-Allow-Methods",
      "POST, PUT, OPTIONS, DELETE, GET"
    );
    res.header("Access-Control-Allow-Origin", "http://localhost:3000");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept"
    );
    res.header("Access-Control-Allow-Credentials", true);
    next();
  });
}

app.use(helmet());
app.use(helmet.hidePoweredBy());
app.use(bodyParser.urlencoded({ extended: false }));
//app.use(bodyParser.json());
app.use(bodyParser.json({ type: "application/json" }));
app.use(cookieParser());

// allow cors requests from any origin and with credentials
app.use(
  cors({
    origin: (origin, callback) => callback(null, true),
    credentials: true,
  })
);


function startTimer() {
  const started = process.uptime()
  return () => Math.floor((process.uptime() - started) * 1000) // uptime gives us seconds
}

app.all("/app/v1/healthz", (req, res) => {
 console.log(`${req.method} - ${req.originalUrl} - ${req.ip}`);
  const rss = (process.memoryUsage().rss / (1024 * 1024)).toFixed(2);
  const heapTotal = (process.memoryUsage().heapTotal / (1024 * 1024)).toFixed(2);
  const uptime = (process.uptime() / 60).toFixed(2);
  res.status(200).send({ message: "healthy", status: 200, application: "api", upTime: uptime ,heapTotal:heapTotal,rss:rss});
});

    rsmq.receiveMessage({ qname: "myqueue" }, function (err, resp) {
        if (err) {
            console.error(err)
            return
        }

        if (resp.id) {
            console.log("Message received.", resp)
        } else {
            console.log("No messages for me...")
        }
    });
      
    // categoryAPI.info('logging to file and console transports');
    // categoryAMS.info('logging to http transport');
 
  worker.on( "message", function( msg, next, id ){
      console.log(msg);
      categoryAPI.info(msg);
    next()
  });

  AMSworker.on( "message", function( msg, next, id ){
     console.log(msg);
     categoryAMS.info(msg);
   next()
 });

 
  // optional error listeners
  worker.on('error', function( err, msg ){
      console.log( "ERROR", err, msg.id );
  });
  worker.on('exceeded', function( msg ){
      console.log( "EXCEEDED", msg.id );
  });
  worker.on('timeout', function( msg ){
      console.log( "TIMEOUT", msg.id, msg.rc );
  });
 
  worker.start();
  
// TCP Server Start

// Create our syslog server with the given transport
// const options = {} ;
// const address = '0.0.0.0' ; // Any
// const port = 5000 ;
// const listen = {host: address, port: port} ;
// var server = Syslog.TCP(options) ;
 
// server.on('msg', data => {
//     console.log('message received from %s:%i\n%o\n', data.address, data.port, data) ;
// })
// .listen(listen)
// .then(() => {
//     console.log(`Now listening on: ${address}:${port}`) ;
// });

// Create our syslog server with the given transport
const socktype = 'TCP' ; // or 'TCP' or 'TLS'
const address = '0.0.0.0' ; // Any
const port = 5000 ;
var server = Syslog(socktype) ;
 
// State Information
var listening = false ;
var clients = [] ;
var count = 0 ;
// sudo lsof -i :5000
server.on('msg', data => {
    console.log('message received (%i) from %s:%i\n%o\n', ++count, data.address, data.port, data) ;
})
.on('invalid', err => {
    console.warn('Invalid message format received: %o\n', err) ;
})
.on('error', err => {
    console.warn('Client disconnected abruptly: %o\n', err) ;
})
.on('connection', s => {
    let addr = s.address().address ;
    console.log(`Client connected: ${addr}\n`) ;
    clients.push(s) ;
    s.on('end', () => {
        console.log(`Client disconnected: ${addr}\n`) ;
        let i = clients.indexOf(s) ;
        if(i !== -1)
            clients.splice(i, 1) ;
    }) ;
})
.listen({host: address, port: port})
.then(() => {
    listening = true ;
    console.log(`Now listening on: ${address}:${port}`) ;
})
.catch(err => {
    if ((err.code == 'EACCES') && (port < 1024)) {
        console.error('Cannot listen on ports below 1024 without root permissions. Select a higher port number: %o', err) ;
    }
    else { // Some other error so attempt to close server socket
        console.error(`Error listening to ${address}:${port} - %o`, err) ;
        try {
            if(listening)
                server.close() ;
        }
        catch (err) {
            console.warn(`Error trying to close server socket ${address}:${port} - %o`, err) ;
        }
    }
}) ;
 
// const options = {
//   key: fs.readFileSync('/keys/key.pem'),
//   cert: fs.readFileSync('/keys/cert.pem')
// };

function startServer() {
  const port =
    process.env.NODE_ENV === "production" ? process.env.PORT || 80 : 3099;
  app.listen(port, () => {
    // console.log(
    //   "Server listening on port http://localhost:" +
    //     port +
    //     "/app/v1/healthz" +
    //     " [ How to Message in a World of Noise ]"
    // );
    //winston.info(`Server listening on port http://localhost:${port}`);
  });
}

//startServer();

// @End //
