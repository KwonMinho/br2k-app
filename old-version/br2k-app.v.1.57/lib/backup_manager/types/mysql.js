const BackupClient = require("../frame/backup_client");
const mysql = require("mysql");
const compressing = require("compressing");
const fs = require("fs");
const { createHash } = require("crypto");

module.exports = class MysqlClient extends BackupClient {
  /**
   * @param {object} {
   *  host, user, password, database
   * }
   */
  constructor(auth) {
    super();
    this.auth = auth;
    this.client = mysql.createConnection(auth);
    this.client.connect();
    this.backupState = {
      snapshot: false,
      snapshotSize: 0,
      states: false,
      statesSize: 0,
    };

    this.isLoadNewStateVersion = false;
  }

  /**
   * @public
   * @param {string} accessHashValue main of keysInfo tha is the return values of putBackupKey func
   * @returns {string} accesskey
   */
  getBackupAccessKey(accessHashValue) {
    const dbPoint = this.auth.host;
    const database = this.auth.database;
    return `mysql/${dbPoint}/${database}/${accessHashValue}`;
  }

  /**
   * @public
   * @returns {boolean} isBackupEnd
   */
  isBackupEnd() {
    if (!this.backupState.snapshot) return false;
    if (!this.backupState.states) return false;
    this.backupState.snapshot = false;
    this.backupState.states = false;
    return true;
  }

  /**
   * @public
   * @returns {boolean} isLoadNewState
   */
  isLoadNewState() {
    return this.isLoadNewStateVersion;
  }

  /**
   * @public
   * @returns {object} keyInfos:{
   *  main: main access key(hash)
   *  states:
   *  snapshot
   * }
   */
  putBackupKey() {
    const keyInfo = {
      main: this._createRandomHash(),
      states: this._createRandomHash(),
      snapshot: this._createRandomHash(),
    };
    const query = `INSERT INTO router (id,state_id,snapshot_id) VALUES(?,?,?);`;
    const params = [keyInfo.main, keyInfo.states, keyInfo.snapshot];
    this.client.query(query, params, function (error, results, fields) {
      if (error) {
        console.log(error);
      }
    });
    return keyInfo;
  }

  /**
   * @public
   * @param {string} id: states of keysInfo tha is the return values of putBackupKey func
   * @param {string} statePath: path of BR2K service state
   * */
  async putStates(id, statePath) {
    const self = this;

    /*compress*/
    let number = 0;
    const compressPath = __dirname + "/compress.tgz";
    await compressing.tgz.compressDir(statePath, compressPath);

    const stream = fs.createReadStream(compressPath, {
      highWaterMark: 128 * 1024,
    });
    stream.on("data", (chuck) => {
      const query = `INSERT INTO states (id,chunk_id,data) VALUES(?,?,?);`;
      const buf = new Buffer.from(chuck);
      self.backupState.statesSize += buf.length;
      const params = [id, number.toString(), buf];
      number++;

      self.client.query(query, params, function (error, results, fields) {
        if (error) console.log(error);
      });
    });

    stream.on("end", () => {
      self.backupState.states = true;
      fs.unlinkSync(compressPath);
      console.log("Backup-Manager: end states work");
    });
  }

  /**
   * @public
   * @param {string} id: snapshot of keysInfo tha is the return values of putBackupKey func
   * @param {string} snapShotStream: etcdClient.maintenance.snapshot()
   * */
  putSnapshot(id, snapShotStream) {
    let number = 0;
    const self = this;

    snapShotStream.on("data", (obj) => {
      const query = `INSERT INTO snapshot (id,chunk_id,data) VALUES(?,?,?);`;

      const buf = new Buffer.from(obj.blob);
      self.backupState.snapshotSize += buf.length;

      const params = [id, number.toString(), buf];
      number++;
      self.client.query(query, params, function (error, results, fields) {
        if (error) console.log(error);
      });
    });

    snapShotStream.on("end", () => {
      self.backupState.snapshot = true;
      console.log("Backup-Manager: end snapshot work");
    });
  }

  /**
   * @public
   * @description object of latest backupData size
   * @returns {object}
   */
  getLatestBackupSizes() {
    return {
      snapshot: this.backupState.snapshotSize,
      states: this.backupState.statesSize,
    };
  }

  /**
   * @public
   * @param {objcet} log: backupLog stored in service registry(mysql-verison)
   * @returns {object} auth: mysql auth object
   */
  getBackupLogStorageAuth(log) {
    const auth = {
      host: log.storage.host,
      database: log.storage.database,
      user: log.storage.user,
      password: log.storage.password,
    };
    return auth;
  }

  /**
   * @public
   * @param {objcet} log: backupLog stored in service registry(mysql-verison)
   * @returns {string} backup-access-key
   */
  getBackupLogAccessKey(log){
    return log.storage['backup-access-key'];
  }

  /**
   * @public
   * @param {string} auth: stroage auth of backupLog stored in service registry
   * @param {string} accessKey main of keysInfo that is the return values of putBackupKey func
   * @param {string} statePath: path of BR2K service state
   * */
  loadBackupState(auth, accessKey, statePath) {
    const tmpClient = mysql.createConnection(auth);
    const routerQuery = `select * from router where id='${accessKey}'`;
    const compressPath = __dirname + "/compress.tgz";
    const stream = fs.createWriteStream(compressPath);
    const self = this;

    this.isLoadNewStateVersion = true;
    tmpClient.connect();
    tmpClient.query(routerQuery, (err, result, fields) => {
      const stateID = result[0]["state_id"];
      const stateQuery = `select * from states where id='${stateID}'`;

      tmpClient.query(stateQuery, async (err, results, fields) => {
        for (let i = 0; i < results.length; i++) {
          await stream.write(results[i].data);
        }
        await stream.end();
        const uncompressPath = self._getUncompressPath(statePath);
        await compressing.tgz.uncompress(compressPath, uncompressPath);
        tmpClient.end();
        this.isLoadNewStateVersion = false;
      });
    });
  }

  _getUncompressPath(statePath) {
    const len = statePath.length;
    const isSlush = statePath[len - 1] == "/";
    if (isSlush) return statePath + "..";
    else return statePath + "/..";
  }

  /**
   * @prvivate
   */
  _createRandomHash() {
    const current_date = new Date().valueOf().toString();
    const random = Math.random().toString();
    return createHash("md5")
      .update(current_date + random)
      .digest("hex");
  }
};
