import knex from 'knex';

var timezone = 'Asia/Bangkok';
var options = {
  HIS: {
    client: process.env.HIS_DB_CLIENT || 'mysql',
    connection: {
      host: process.env.HIS_DB_HOST,
      user: process.env.HIS_DB_USER,
      password: process.env.HIS_DB_PASSWORD,
      database: process.env.HIS_DB_NAME,
      port: +process.env.HIS_DB_PORT || 3306,
      charset: process.env.HIS_DB_CHARSET || 'utf8',
      schema: process.env.HIS_DB_SCHEMA || 'public',
      encrypt: process.env.HIS_DB_ENCRYPT || true,
      timezone
    }
  },
  ISONLINE: {
    client: process.env.IS_DB_CLIENT || process.env.HIS_DB_CLIENT || 'mysql',
    connection: {
      host: process.env.IS_DB_HOST || process.env.HIS_DB_HOST,
      user: process.env.IS_DB_USER || process.env.HIS_DB_USER,
      password: process.env.IS_DB_PASSWORD || process.env.HIS_DB_PASSWORD,
      database: process.env.IS_DB_NAME || 'isdb',
      port: +process.env.IS_DB_PORT || +process.env.HIS_DB_PORT || 3306,
      charset: process.env.IS_DB_CHARSET || process.env.HIS_DB_CHARSET || 'utf8',
      schema: process.env.IS_DB_SCHEMA || process.env.HIS_DB_SCHEMA,
      encrypt: process.env.IS_DB_ENCRYPT || process.env.HIS_DB_ENCRYPT || true,
      timezone
    }
  },
  REFER: {
    client: process.env.REFER_DB_CLIENT || process.env.REFER_DB_CLIENT || 'mysql',
    connection: {
      host: process.env.REFER_DB_HOST || process.env.HIS_DB_HOST,
      user: process.env.REFER_DB_USER || process.env.HIS_DB_USER,
      password: process.env.REFER_DB_PASSWORD || process.env.HIS_DB_PASSWORD,
      database: process.env.REFER_DB_NAME || process.env.HIS_DB_NAME,
      port: +process.env.REFER_DB_PORT || +process.env.HIS_DB_PORT || 3306,
      charset: process.env.REFER_DB_CHARSET || process.env.HIS_DB_CHARSET || 'utf8',
      schema: process.env.REFER_DB_SCHEMA || process.env.HIS_DB_SCHEMA || 'public',
      encrypt: process.env.REFER_DB_ENCRYPT || process.env.HIS_DB_ENCRYPT || true,
      timezone
    }
  }
};

const dbConnection = (type = 'HIS') => {
  let option: any = options[type.toUpperCase()];
  if (['mysql', 'mysql2'].indexOf(option.client) >= 0) {
    option['pool'] = {
      min: 0, max: 10,
      afterCreate: (conn, done) => {
        conn.query('SET NAMES ' + option.connection.charset, (err) => {
          done(err, conn);
        });
      }
    };
  } else {
    option['pool'] = { min: 0, max: 10 };
  }
  return knex(option);
};

module.exports = dbConnection;