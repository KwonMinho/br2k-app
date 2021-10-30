const changeBR2K_app = require('./lib/expand');
const express = require('express');

exports = module.exports = function (config){
  const app = express();
  const br2kApp = changeBR2K_app(app, config);
  return br2kApp;
}
