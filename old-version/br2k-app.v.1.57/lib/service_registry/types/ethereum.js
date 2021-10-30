const ServiceRegistry = require("../frame/service_registry");
const Web3 = require("web3");
const sleep = require("sleep");
const EthCrypto = require('eth-crypto');


module.exports = class EtherRegistry extends ServiceRegistry {

  constructor(scvID, accessPerm) {
    super();
    this.scvID = scvID;
    this.acc = accessPerm["account"];
    this.psword = accessPerm["password"];
    this.privateKey = accessPerm["private-key"];
    this.endpoint = accessPerm["endpoint"];
    this.contractCfg = accessPerm["contract"];
    this.tryCount = 0;
  }

  /**
   * @override
   */
  async checkConnection() {
    const endPoint = this.endpoint;
    const address = this.contractCfg['address'];
    const provider = this._getProvdier(endPoint);
    this.web3 = new Web3(provider);
    const interfaceFile = this.contractCfg['json-interface-path']; 
    const jsonInterface = require(interfaceFile);
    this.sr = await new this.web3.eth.Contract(jsonInterface, address,{
      from: this.acc,
      gas: 2000000,
      gasPrice: 1,
    });
  }

  /**
   * @override
   * @param {number} index
   */
  async updateLeader(index) {
    try {
      await this.web3.eth.personal.unlockAccount(this.acc, this.psword);
      await this.sr.methods.updateServiceLocation(this.scvID, index-1).send();
      this.tryCount = 0;
    } catch (e) {
      if (this.tryCount == 5) {
        console.log("Error Register Task: Service Registry");
        process.exit(1);
      }
      ++this.tryCount;
      console.log(e);
      sleep.sleep(1);
      console.log(
        `${this.tryCount} retry...register service in service registry`
      );
      this.updateLeader(index);
    }
  }

  /**
   * @protected
   * @param {object} logObj
   * @returns {string}
  */
  async _encryptLog(logObj) {
    const logString = JSON.stringify(logObj)
    const publicKey = EthCrypto.publicKeyByPrivateKey(this.privateKey);
    const encrypted = await EthCrypto.encryptWithPublicKey(
        publicKey, // publicKey
        logString // message
    );
    const strEncrypted = EthCrypto.cipher.stringify(encrypted);
    return strEncrypted;
  }

  /**
   * @param {string} encryptedLog
   * @returns {object}
  */
  async _decryptLog(encryptedLog){
    const encryptObj = EthCrypto.cipher.parse(encryptedLog);
    const originLog = await EthCrypto.decryptWithPrivateKey(
        this.privateKey, // privateKey
        encryptObj // encrypted-data
    );
    return originLog;
  }

  /**
   * @override
   * @param {object} log: log
   */
  async backupLog(log) {
    try {
      const encryptLog = await this._encryptLog(log);
      await this.web3.eth.personal.unlockAccount(this.acc, this.psword);
      await this.sr.methods.backupLog(this.scvID, encryptLog).send();
      this.tryCount = 0;
    } catch (e) {
      if (this.tryCount == 5) {
        console.log("Error: backup to accessKey: Service Registry");
        process.exit(1);
      }
      ++this.tryCount;
      console.log(e);
      sleep.sleep(1);
      console.log(
        `${this.tryCount} retry...backup to accessKey in service registry`
      );
      this.backupLog(log);
    }
  }

  /**
   * @override
   * @returns log object
   */
  async getLatestBackupLog() {
    try {
      await this.web3.eth.personal.unlockAccount(this.acc, this.psword);
      const result = await this.sr.methods.getLatestBackupLog(this.scvID).call();
      const backupLog = await this._decryptLog(result);
      this.tryCount = 0;
      return JSON.parse(backupLog);
    } catch (e) {
      if (this.tryCount == 5) {
        console.log("Error: backup to accessKey: Service Registry");
        process.exit(1);
      }
      ++this.tryCount;
      console.log(e);
      sleep.sleep(1);
      console.log(
        `${this.tryCount} retry...backup to accessKey in service registry`
      );
      this.getLatestBackupLog();
    }
  }

  /**
   * @private
   * @param {*} endpoint
   * @returns
   */
  _getProvdier(endpoint) {
    const isWS = endpoint.includes("ws");
    const isHTTP = endpoint.includes("http");
    if (isWS) return new Web3.providers.WebsocketProvider(endpoint);
    else if (isHTTP) return new Web3.providers.HttpProvider(endpoint);
    else {
      console.log("Not valid blockchain endpoint");
      process.exit(1);
    }
  }
  //END
};
