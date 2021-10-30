// test.js
const Caver = require('caver-js')
const sleep = require("sleep");
const EthCrypto = require('eth-crypto');
const ServiceRegistry = require("../frame/service_registry");

module.exports = class KlaytnRegistry extends ServiceRegistry {


  constructor(scvID, accessPerm){
    super();
    this.scvID = scvID
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
  checkConnection() {
    caver.wallet.newKeyring(this.acc, this.privateKey)
    const endPoint = this.endpoint; //babob
    const address = this.contractCfg['address'];
    this.caver = new Caver(endPoint);
    const interfacePath = this.contractCfg['json-interface-path']; 
    const jsonInterface = require(interfacePath);
    this.sr =  new caver.contract(jsonInterface, address);
   
  }

  /**
   * @override
   */
  updateLeader(index) {
    try{
      await this.sr.methods.updateServiceLocation(this.scvID, index-1).send();
      this.tryCount = 0 ; 
    }catch(e){
      if (this.tryCount == 5){
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
   * @override
   */
  backupLog() {
    try {
      const encryptLog = await this._encryptLog(log);
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
   */
  getLatestBackupLog() {
    try {
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
};
