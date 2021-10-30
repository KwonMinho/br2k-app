const fs = require("fs");

module.exports = class Logger {

  //deprecated..
  set(statePath, scvID){
    this.statePath = statePath;
    this.scvID = scvID;
  }

  log(type, role, action, content) {
    const now = this._now();
    const log = `${now}[${type}][${role}][${action}][${content}] \n`;
    console.log(log);
    //fs.appendFileSync(`${this.statePath}/${this.scvID}-log`, log);
  }

  _now() {
    let _date = new Date();
    let year = _date.getFullYear();
    let month = _date.getMonth() + 1;
    let date = _date.getDate();
    let hours = _date.getHours();
    let minutes = _date.getMinutes();
    let sec = _date.getSeconds();
    let milliSec = _date.getUTCMilliseconds();
    return `${year}-${month}-${date} ${hours}:${minutes}:${sec}:${milliSec}`;
  }
};