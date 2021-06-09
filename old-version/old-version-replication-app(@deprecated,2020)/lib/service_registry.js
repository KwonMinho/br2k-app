const Web3 = require('web3');
const sleep = require('sleep');


module.exports = class ServiceRegistry{

  constructor(scvRegCfg){
    this.scvID = scvRegCfg['id'];
    this.acc = scvRegCfg['account'];
    this.psword  = scvRegCfg['password'];
    this.endpoint = scvRegCfg['endpoint'];
    this.abiPath = scvRegCfg['abi_path'];
    this.tryCount = 0;
  }


  async newSRClient(){
    const endPoint = this.endpoint;
    const abiPath = this.abiPath;
    const provider = this.getProvdier(endPoint);
    this.web3 = new Web3(provider);
    const netID = await this.web3.eth.net.getId();
    const srABI = require(abiPath);
    const srInfo = srABI.networks[netID];
    this.sr = await new this.web3.eth.Contract(srABI.abi, srInfo.address);
  }

  getProvdier(endpoint){
    const isWS = endpoint.includes('ws');
    const isHTTP = endpoint.includes('http');
    if(isWS) return new Web3.providers.WebsocketProvider(endpoint);
    else if(isHTTP) return new Web3.providers.HttpProvider(endpoint);
    else{
      console.log('Not valid blockchain endpoint');
      process.exit(1);
    }
  }

  async updateLeader(index){
    try{
      const option = {
        from: this.acc,
        gas: 2000000,
        gasPrice: 1,
      }
      await this.web3.eth.personal.unlockAccount(this.acc,this.psword);
      await this.sr.methods.updateServiceLocation(this.scvID, index-1).send(option);
      this.tryCount = 0;
    }catch(e){
      if(this.tryCount == 5){
        console.log('Error Register Task: Service Registry');
        process.exit(1);
      }
      ++this.tryCount;
      console.log(e);
      sleep.sleep(1);
      console.log(`${this.tryCount} retry...register service in service registry`);
      this.updateLeader(index);
    }
  }


//END
}
