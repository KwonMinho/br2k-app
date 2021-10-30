const webpackMiddleware = require("webpack-dev-middleware");
const webpack = require("webpack");
const express = require("express");
const Service = require("./service");
const { FIX_PATH } = require("./utils/config");


exports = module.exports = function (app, config) {
  /*webpack middleware*/
  const webpackCfg = config["webpack-config"];
  if (webpackCfg != null && webpackCfg != "") {
    const wcfg = require(webpackCfg);
    const complier = webpack(wcfg);
    app.use(webpackMiddleware(complier, wcfg.devServer));
  }

  /*request middleware in BR2K service*/
  app.scv = new Service(config);

  const storeReqMiddleWare = function (req, res, next) {
    app.scv.putRequestMiddleWare(req, res);
    //next();
  };
  app.use(
    express.json(), //express bodypaser
    express.urlencoded({ extended: true }), //express bodypaser
    storeReqMiddleWare
  );

  app.defineRLE = function(method, path, cb){
    app.all(path, ()=>{});
    const processPath = method.toLowerCase() + path;
    app.scv.setRLE({
      path: processPath,
      cb: cb
    });

    let isReplicate = false;
    const service = {
      /*Stateful(Replication) Request Router*/
      replicate: (cb) => {
        isReplicate = true;
        app.scv.setRouting(true, {
          path: processPath,
          cb: cb,
        });
    
        return this;
      },
      /*Stateless Request Router*/
      nonReplicate: (cb) => {
        if(isReplicate){
          console.log('The request has already been determined as a replicate type..(replicate, backupState, rollback func)');
          process.exit(1);
        }
        app.scv.setRouting(false, {
          path: processPath,
          cb: cb,
        });
        return this;
      },
      backupState: (cb) => {
        isReplicate = true;
        app.scv.setBackUpState({
          path: processPath,
          cb: cb,
        });
        return this;
      },
      rollback: (cb) => {
        isReplicate = true;
        app.scv.setRollbacks({
          path: processPath,
          cb: cb,
        });
        return this;
      },
    }
    return service;
  }


  /*External_TXN Request*/
  app.all(FIX_PATH.external_success_txn, () => {});

  return app;
};
