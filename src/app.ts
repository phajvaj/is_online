const fs = require('node:fs');
// Check config file ====================================
checkConfigFile();

import path = require('path');
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import fastify from 'fastify';
import * as moment from 'moment';
import cronjob from './nodecron';

const serveStatic = require('serve-static');
var crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '../config') });

import helmet = require('@fastify/helmet');

// const fastifySession = require('fastify-session');
// var cron = require('node-cron');
// var shell = require("shelljs");

var serverOption = {}
if (process.env.SSL_ENABLE && process.env.SSL_ENABLE == '1' && process.env.SSL_KEY) {
  serverOption = {
    logger: {
      level: 'error',
    },
    bodyLimit: 5 * 1048576,
    http2: true,
    https: {
      key: fs.readFileSync(process.env.SSL_KEY),
      cert: fs.readFileSync(process.env.SSL_CRT)
    }
  }
} else {
  serverOption = {
    logger: {
      level: 'error',
    },
    bodyLimit: 5 * 1048576
  }
}
const app = fastify(serverOption);

const { name, version, subVersion } = require('./../package.json');
global.appDetail = { name, subVersion, version };

app.register(require('@fastify/formbody'));
app.register(require('@fastify/cors'), {});
app.register(require('fastify-no-icon'));
app.register(helmet, {});
app.register(require('@fastify/rate-limit'), {
  max: +process.env.MAX_CONNECTION_PER_MINUTE || 1000,
  // skipOnError: true,
  // cache: 10000,
  timeWindow: '1 minute'
});
app.register(serveStatic(path.join(__dirname, '../public')));

app.register(require('@fastify/view'), {
  engine: {
    ejs: require('ejs')
  }
})

app.register(require('@fastify/jwt'), {
  secret: process.env.SECRET_KEY
});
// global.ipAddr = require('./routes/main/local-server')(global.ipAddr, {});

// set MOPH Url =========================================
global.mophService = require('./routes/main/crontab')(global.mophService, {});
global.firstProcessPid = 0;
global.mophService = null;

// DB connection =========================================
connectDB();

// check token ===========================================================
app.decorate("authenticate", async (request: any, reply: any) => {
  request.authenDecoded = null;
  request.user = null;
  if (request.body && request.body.token) {
    request.headers.authorization = 'Bearer ' + request.body.token;
  }

  try {
    request.user = await request.jwtVerify();
    request.authenDecoded = request.user;
  } catch (err) {
    let ipAddr: any = request.headers["x-real-ip"] || request.headers["x-forwarded-for"] || request.ip;
    console.log(moment().format('HH:mm:ss.SSS'), ipAddr, 'error:' + StatusCodes.UNAUTHORIZED, err.message);
    reply.send({
      statusCode: StatusCodes.UNAUTHORIZED,
      message: getReasonPhrase(StatusCodes.UNAUTHORIZED)
    });
  }
});
// end: check token ===========================================================

app.decorate("checkRequestKey", async (request, reply) => {
  let skey = null;
  if (request.headers.localkey) {
    skey = request.headers.localkey;
  }
  var requestKey = crypto.createHash('md5').update(process.env.REQUEST_KEY).digest('hex');
  if (!skey || skey !== requestKey) {
    console.log('invalid key', requestKey);
    reply.send({
      statusCode: StatusCodes.UNAUTHORIZED,
      message: getReasonPhrase(StatusCodes.UNAUTHORIZED) + ' or invalid key'
    });
  }

});

// Add Route path ================================
var geoip = require('geoip-lite');
app.addHook('preHandler', async (request, reply) => {
  const headers = {
    "Cache-Control": "no-store",
    Pragma: "no-cache",
  };
  reply.headers(headers);

  let ipAddr: any = request.headers["x-real-ip"] || request.headers["x-forwarded-for"] || request.ip;
  ipAddr = ipAddr ? ipAddr.split(',') : [''];
  const ip = ipAddr[0].trim();
  var geo = geoip.lookup(ip);
  if (geo && geo.country && geo.country != 'TH' && ip != process.env.HOST) {
    console.log(ip, `Unacceptable country: ${geo.country}`);
    return reply.send({ status: StatusCodes.NOT_ACCEPTABLE, ip, message: getReasonPhrase(StatusCodes.NOT_ACCEPTABLE) });
  }
  console.log(moment().format('HH:mm:ss'), geo ? geo.country : 'unk', ip, request.url);
});
app.register(require('./route'));

app.register(cronjob);

var options: any = {
  port: process.env.PORT || 3004,
  host: process.env.HOST || '0.0.0.0'
}

app.listen(options, (err) => {
  if (err) throw err;
  console.info(`${moment().format('HH:mm:ss')} HIS-Connect API ${global.appDetail.version}-${global.appDetail.subVersion} started on port ${options.port}, PID: ${process.pid}`);
});

// DB connection =========================================
async function connectDB() {
  const dbConnection = require('./plugins/db');
  global.dbHIS = dbConnection('HIS');
  global.dbIs = dbConnection('ISONLINE');
  global.dbISOnline = global.dbIs;

  try {
    const result = await global.dbHIS.raw('SELECT NOW() as date');
    console.info(`   PID:${process.pid} >> HIS DB server connected, date on DB server: `, result[0][0].date);
  } catch (error) {
    console.error(`   PID:${process.pid} >> HIS DB server connect error: `, error.message);
  }
}

async function checkConfigFile() {
  if (fs.existsSync('./config')) {
    console.info('Check config file exist: Successfully');
  } else {
    console.error(`Check config file exist: Not found, please create file 'config' and try again.`);
    process.exit(1);
  }
}