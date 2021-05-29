const didCfg= require("../config/did.config");
const random = require('random');

module.exports = class CfgMgmt {
  constructor() {
    this.didCfg = didCfg;
  }

  /**@dev return verifier did
   * @returns verifier did
   */
  getDid(){
    return this.didCfg.DID;
  }

  /**@dev return verifier private key of dom
   * @returns verifier private key (random selected) {id, value}
   */
  getRandomPrivatekey(){
    const selectKeyIndex = random.int( 0, this.didCfg.PRIVATE_KEY_LIST.length-1);
    return this.didCfg.PRIVATE_KEY_LIST[selectKeyIndex];
  }

  getNetwork(){
    return this.didCfg.NETWORK;
  }


  getEndpoint(){
    return this.didCfg.VERIFIER_END_POINT;
  }


  getDidABI(){
    return this.didCfg.DID_ABI_PATH;
  }

  getDidAddr(){
    return this.didCfg.DID_REGISTRY;
  }

};