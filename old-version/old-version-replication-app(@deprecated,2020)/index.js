const applyReplicationMode = require('./lib/expand');
const express = require('express');

exports = module.exports = function (config){
  const app = express();
  const robustApp = applyReplicationMode(app, config);
  return robustApp;
}
