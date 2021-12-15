const webpackMiddleware = require('webpack-dev-middleware');
const webpack = require('webpack');
const bodyParser = require('body-parser');
const Service = require('./service')
const EX_TXN_PATH = '/external_txn';



exports = module.exports = function(app, cfg){
  checkConfig(cfg);

  app.scv = new Service(cfg);

  const storeReqMiddleWare = function(req, res, next){
    app.scv.storeReqMiddleware(req, res);
    next();
  }

  const webpackCfg = cfg['webpack-config'];
  if(webpackCfg == null || webpackCfg == ''){
    app.use(
      bodyParser.json(),
      bodyParser.urlencoded({extended: true}),
      storeReqMiddleWare
    )
  }else{
    const cfg = require(webpackCfg);
    const complier = webpack(cfg);
    app.use(
      webpackMiddleware(complier, cfg.devServer),
      bodyParser.json(),
      bodyParser.urlencoded({extended: true}),
      storeReqMiddleWare
    )
  }


  /*Add Service-Replication Mode Router */
  app.replicateReq = function(method, path, cb){
    app.all(path,()=>{});
    const processPath = method.toLowerCase()+path;

    app.scv.setRouting(true,{
      path: processPath,
      cb: cb,
    })
    const service = {
      rollback: (cb)=>{
        app.scv.setRollbacks({
          path: processPath,
          cb: cb
        });
      }
    }
    return service;
  }

  app.req = function(method, path, cb){
    app.all(path,()=>{});
    const processPath = method.toLowerCase()+path;
    app.scv.setRouting(false,{
      path: processPath,
      cb: cb,
    })
  }

  app.rollback = function(method, path, cb){
    const processPath = method.toLowerCase()+path;
    app.scv.setRollbacks({
      path: processPath,
      cb: cb
    });
  }

  app.all(EX_TXN_PATH,()=>{});

  return app;
}



function checkConfig(cfg){

  const scvRegCfg = cfg['service-registry'];

  if(scvRegCfg == null){
    throw new TypeError('Config "service-registry" is empty');
  }

  if(scvRegCfg.id == null){
    throw new TypeError('Not found id in config');
  }
  if(scvRegCfg.endpoint == null){
    throw new TypeError('Not found endpoint in config');
  }
  if(scvRegCfg.password == null){
    throw new TypeError('Not found password in config');
  }  
  if(scvRegCfg.account == null){
    throw new TypeError('Not found account in config');
  }
}