
const sleep = require('sleep');
const { Etcd3 } = require('etcd3');
const {parse, stringify} = require('flatted');
const queue = require('function-queue');
const watcher =require('obj-watcher');
const ServiceRegistry = require('./service_registry');
const emptyRes = require('./utils/empty_res');
const fs = require('fs');




/* Service State */
const INIT = 0;
const REGISTER = 1;
const LEADER = 2;
const FOLLOWER = 3;

/* Req State */
const UNPROCESS = '0';
const UNPROCESSABLE = '9';
const SUCCESS = '1';
const FAILED = '-1';
const PROCESSING = '2';

/* Req Type */
const REPLICATE = 'R';
const NORMAL = 'N';
const EX_TXN = 'T';
const EX_TXN_PATH = '/external_txn';

/* Key Type */
const LS_KEY = 'log_size';
const RS_KEY = 'RS/'; 
const LPI_KEY = `latest_processed_index/`;
const SSI_KEY = 'service_state_index';
const LEADER_KEY = 'cur_leader'

/*etc..*/

// follwing action looping time-sec
const FOLLOWING_TIME_SEC = 0.5;
const IS_CHANGE_ROLE = -1;
const etcdOption = {hosts: 'localhost:2379'};
const PROCESSING_CHECK_POINT = __dirname+'/process.json';
const UNPROCESS_CHECK_POINT = __dirname+'/not_process.json';
const PROCESSED_CHECK_POINT = __dirname+'/processed.json';
const NOT_CUR_LEADER = false;

let DEBUG = false;




module.exports = class Service{

  constructor(cfg){
    const scvRegCfg = cfg['service-registry'];
    if(cfg['debug-mode'] == true) DEBUG = true;

    /*Service state*/
    this.state = INIT;

    /*Service registry client for update service location*/
    this.serviceRegistry = new ServiceRegistry(scvRegCfg);

    /*Variables for leader request process*/
    this.responsePool = new Map;
    this.reqPool = new Map;
    this.storeQ = queue();
    this.processQ = queue();

    /*Processe Pool*/
    this.replicatingProcess = new Map;
    this.normalProcess = new Map;
    this.rollbackProcess = new Map;

    /*Etcd clients for replicating service*/
    this.watchETCD = new Etcd3(etcdOption);
    this.storeETCD = new Etcd3(etcdOption);
    this.processETCD = new Etcd3(etcdOption);
    this.curWatchEvent;
    this.ssi = 0;
    this.lpi = 0;
    this.logSize = 0;
    this.scvIndex=0;
    this.myLPI = '';

    /*processing lock*/
    this.isChangeRole = false;
    this.watingRole;
    const self = this;
    this.watcher = watcher;
    this.watcher.watch('isRunAction', {run: false});
    this.watcher.onChange('isRunAction',(old, newObj)=>{
      if(self.isChangeRole == true && newObj.run == false){
        if(self.watingRole == LEADER) self.transitionRole(true, self);
        else self.transitionRole(false, self);
        self.isChangeRole = false;
      }
    });

    /*tmp*/
    this.retryRS_Task = null;
    this.startRole();
  }

  

  /*
   * *  API Function
   * */
  storeReqMiddleware(req, res){
    if(this.state != LEADER){
      const errMSG = {
        error: 'It does not provide a service here'
      }
      res.send(errMSG);
      return;
    }

    const method = req.method.toLowerCase();
    const path = req._parsedUrl.pathname;
    const reqType = this.getReqType(method,path);

    if(reqType=='exception'){
      const errMSG = {
        error: 'Current request type not found'
      }
      res.send(errMSG);
      return;
    }

    this.storeQ.push(this.storeReqAction, {
      req: req,
      res: res,
      reqType: reqType,
      scv: this
    });
  }

  /*
   * *  API Function
   * */
  setRollbacks(process){
    this.rollbackProcess.set(process.path, process.cb);
  }

  /*
   * *  API Function
   * */
  setRouting(isReplicate, process){
    if(isReplicate){
      this.replicatingProcess.set(process.path, process.cb);
    }else{
      this.normalProcess.set(process.path, process.cb);
    }
  }



  /**
   * WHEN (SERVICE ROLE = INIT STATE)
   * */
  async startRole(){
    await this.checkConnectionEtherClient();
    await this.checkConnectionEtcdClient();

    let status;
    let memberList;

    try{
      status = await this.watchETCD.maintenance.status();
      memberList = await this.watchETCD.cluster.memberList({linearizable: true});
    }catch(e){
      sleep.sleep(2);
      this.startRole();
      return;
    }

    const curMemberID = status.header.member_id;
    const leaderID = status.leader;
    const members = memberList.members;

    for(let member of members){
      if(member.ID == curMemberID){
        const scvIndex = Number(member.name.replace('etcd',''));
        const isLeader = (curMemberID == leaderID);
        await this.settingCoreKey(scvIndex);
        await this.transitionRole(isLeader, this);
        setInterval(this.loopingWatchEtcdState, 1000, this);
      }
    }
  }



  /**
   * WHEN (SERVICE ROLE = INIT STATE)
   * */
  async settingCoreKey(scvIndex){
    const client = this.watchETCD;

    this.scvIndex = scvIndex;
    this.myLPI = LPI_KEY+scvIndex;

    this.LS_KEY = LS_KEY;
    this.RS_KEY = RS_KEY;
    this.LPI_KEY = LPI_KEY;
    this.SSI_KEY = SSI_KEY;
    this.LEADER_KEY = LEADER_KEY;

    try{
      const lpi = await client.get(this.myLPI);
      if( lpi == null ) await client.put(this.myLPI).value(0);
      else this.lpi = Number(lpi);
  
      const size = await client.get(LS_KEY);
      if( size == null ) await client.put(LS_KEY).value(0);

      const ssi = await client.get(SSI_KEY);
      if(ssi == null) await client.put(SSI_KEY).value(0);

      const curLeader = await client.get(LEADER_KEY);
      if(curLeader == null) await client.put(LEADER_KEY).value(-1);
        
      printDebug('I : [setting etcd key for replicating]');
    }catch(e){
      printDebug('F : [init core key!..After 1 sec, retrying]');
      sleep.sleep(1);
      this.settingCoreKey();
    }
  }



  /**
   * WHEN (SERVICE ROLE = INIT STATE)
   * */
  transitionRole(isLeader, self){
    if(isLeader) self.startRegisterRole();
    else self.startFollowerRole();
  }


  /**
   * TRANSICTION
   * */
  async startRegisterRole(){
    this.state = REGISTER;
    await this.watchETCD.put(LEADER_KEY).value(this.scvIndex);
    await this.clearRoleState();

    const isRunAction = this.watcher.get('isRunAction').run;
    if(isRunAction){
      printDebug('I : [waiting for work done in previous role to finish]');
      this.isChangeRole = true;
      this.watingRole = LEADER;
      
      const self = this;
      setTimeout(()=>{
        if(self.isChangeRole == true){
          self.transitionRole(true, self);
        }
      },10000);
      return;
    };

    printDebug('I : [transition service state=REGISTER]');
    if(this.isHasProcessingPoint()){
      await this.retryRollbackAndProcess();
    }
    if(this.isHasNotProcessPoint()){
      await this.retryRunProcess();
    }
    if(this.isHasProcessedPoint()){
      await this.retryUpdateLPI();
    }

    await this.prepareServiceAction();
    await this.serviceRegistry.updateLeader(this.scvIndex);
    this.startLeaderRole();
  }

  /**
   * TRANSICTION
   * */
  async startFollowerRole(){
    this.state = FOLLOWER;
    await this.clearRoleState();

    const isRunAction = this.watcher.get('isRunAction').run;
    if(isRunAction){
      printDebug('I : [waiting for work done in previous role to finish]');
      this.isChangeRole = true;
      this.watingRole = FOLLOWER;
      const self = this;
      setTimeout(()=>{
        if(self.isChangeRole == true){
          self.transitionRole(false, self);
        }
      },10000);
      return;
    };

    if(this.isHasProcessingPoint()){
      await this.retryRollbackAndProcess();
    }
    if(this.isHasNotProcessPoint()){
      await this.retryRunProcess();
    }
    if(this.isHasProcessedPoint()){
      await this.retryUpdateLPI();
    }
  
    await this.ListenUpdateSSI();
    await this.loopingFollowingAction();
    printDebug('I : [transition service state=FOLLOWER]');
  }


  /**
   * TRANSICTION
   * */
  async startLeaderRole(){
    printDebug('I : [transition service state=LEADER]');
    this.state = LEADER;
    await this.ListenUpdateLogSize();
  }


  /**
   * ACTION - [Task Obj: leader role], [When: recevied req]
   * */
  async storeReqAction(nextAction, storePack){
    const scv = storePack.scv;
    const req = storePack.req;
    const res = storePack.res;
    const type = storePack.reqType;
    const etcdClient = scv.storeETCD;
    const SCV_INDEX = scv.scvIndex;
    const SIZE = scv.logSize; 
    const NEXT_INDEX = SIZE+1;
    const CUR_RS = scv.RS_KEY+NEXT_INDEX;
    const LS_KEY = scv.LS_KEY;
    const CUR_SERVICE = scv.scvIndex.toString();
    const LEADER_KEY = scv.LEADER_KEY;


    req.storedIndex = NEXT_INDEX;
    const log = await stringify(req);
    scv.responsePool.set(NEXT_INDEX.toString(), res);
    scv.reqPool.set(NEXT_INDEX.toString(), req);

    try{
      const result = await etcdClient.if(LEADER_KEY, 'Value', '==' , CUR_SERVICE)
                                     .then(
                                        etcdClient.put(''+NEXT_INDEX).value(log),
                                        etcdClient.put(CUR_RS).value(type+UNPROCESS),
                                        etcdClient.put(LS_KEY).value(NEXT_INDEX))
                                     .commit();

      if(result.succeeded){
        scv.logSize = NEXT_INDEX;
        printDebug(`I : [leader-${SCV_INDEX}]-[stored req:${NEXT_INDEX}]\n`);
      }
      else{
        scv.responsePool.delete(NEXT_INDEX.toString());
        scv.reqPool.delete(NEXT_INDEX.toString());
        res.send('Store Failed..retry plz');    
      }
    }catch(e){
      printDebug(`E : [leader-${SCV_INDEX}]-[failed stored req:${NEXT_INDEX}]`);
      printDebug(e);
    }finally{
      nextAction();
    }
  }


  /**
   * ACTION - [Task Obj: leader role], [When: Update log size]
   * */
  async processReqLogAction(nextAction, info){
    /* START */
    info.scv.startAction();   

    let scv = info.scv;
    let process;
    let processedResult;
    let CUR_INDEX = info.index;
    let CUR_RS = scv.RS_KEY+CUR_INDEX;
    let SSI_KEY = scv.SSI_KEY;
    let req = scv.reqPool.get(CUR_INDEX);
    let res = scv.responsePool.get(CUR_INDEX);
    let reqType = scv.getReqType(req.method.toLowerCase(), req._parsedUrl.pathname);
    let client = scv.processETCD;
    let isNotEmpty = true;


    printDebug(`I : [leader-${scv.scvIndex}]-[start processReq index:${CUR_INDEX}]`);
    /*
    CASE 1 CHECK EMPTY RES, REQ
    */
    if(res == undefined || req == undefined){
      try{
        isNotEmpty = false;
        scv.lpi = Number(CUR_INDEX);
        const result = await client.if(scv.LEADER_KEY, 'Value', '==', scv.scvIndex)
                                   .then(client.put(CUR_RS).value(reqType+FAILED))
                                   .commit();
        if(!result.succeeded){
          printDebug(`I : [leader: processReq]-[CHANGED ROLE: ${CUR_INDEX}]`);
          scv.endAction();
          return;
        }
      }catch(e){
        printDebug(`F : [leader: Failed processReq]-[UPDATED RS: NOT FOUND REQ, RES]-[RETRY]`);
        sleep.sleep(2);
        await scv.processReqLogAction(nextAction, info);
        return;
      }
    }

    printDebug(`I : [leader-${scv.scvIndex}]-[processing req index:${CUR_INDEX}]`);
    /*
    CASE 2 EX_TXN
    */
    if(reqType == EX_TXN && isNotEmpty){
      res.send('success stored external_TXN log');
      scv.lpi = Number(CUR_INDEX);
      scv.reqPool.delete(CUR_INDEX);
      scv.responsePool.delete(CUR_INDEX);
    }

    /*
    CASE 3 NORMAL, REPLICATION
    */
    if(reqType != EX_TXN && isNotEmpty){
      // CASE 3.1
      try{
        process = scv.findReqProcess(req, reqType);
        printDebug(`I : [leader-${scv.scvIndex}: [processReq]-[UPDATE RS: PROCESSING -: ${CUR_INDEX}]`);
        const result = await client.if(scv.LEADER_KEY, 'Value', '==', scv.scvIndex)
                                   .then(client.put(CUR_RS).value(reqType+PROCESSING+scv.scvIndex))
                                   .commit();
        
        if(result.succeeded == NOT_CUR_LEADER){ 
          /*END-POINT*/
          printDebug(`I : [leader-${scv.scvIndex}: [processReq]-[UPDATE RS: PROCESSING -> CHANGED ROLE: ${CUR_INDEX}]`);
          scv.endAction();
          return;
        }else{
          printDebug(`I : [leader-${scv.scvIndex}: [processReq]-[UPDATE RS: SUCESSFUL PROCESSING -: ${CUR_INDEX}]`);
          await scv.markingUnprocess(Number(CUR_INDEX));  
        }
      }catch(e){
        /*END-POINT*/
        printDebug(`F : [leader-${scv.scvIndex}: [processReq]-[FAILED UPDATED CUR_RS:PROCESSING]-[${CUR_INDEX}]`);
        sleep.sleep(2);
        await scv.deleteMarking(UNPROCESS_CHECK_POINT);
        await scv.processReqLogAction(nextAction, info);
        return;
      }

      // CASE 3.2
      try{
        await scv.deleteMarking(UNPROCESS_CHECK_POINT);
        await scv.markingProcessing(Number(CUR_INDEX));
        printDebug(`I : [leader-${scv.scvIndex}: [processReq]-[START PROCESS REQ INDEX:${CUR_INDEX}]`);
        const result = await process(req, res);
        scv.lpi = Number(CUR_INDEX);
        await scv.deleteMarking(PROCESSING_CHECK_POINT);
        await scv.markingProcessed(Number(CUR_INDEX));

        if(result == -1) processedResult = FAILED;
        else processedResult = SUCCESS;
        printDebug(`I : [leader-${scv.scvIndex}: [processReq]-[SUCCESSFUL PROCESS REQ INDEX:${CUR_INDEX}]`);
      }catch(e){
        console.log(e);
        processedResult = FAILED;
      }

      // CASE 3.4 Update RS
      try{
        const result = await client.if(scv.LEADER_KEY, 'Value', '==', scv.scvIndex)
                                   .then(client.put(CUR_RS).value(reqType+processedResult))
                                   .commit();

        scv.reqPool.delete(CUR_INDEX);
        scv.responsePool.delete(CUR_INDEX);

        if(result.succeeded == NOT_CUR_LEADER){
          /*END-POINT*/
          printDebug(`I : [leader: processReq]-[UPDATE RS: PROCESS RESULT -> CHANGED ROLE: ${CUR_INDEX}]`);
          await scv.notFailedUpdateLPI(scv, scv.myLPI, CUR_INDEX, true);
          await scv.deleteMarking(PROCESSED_CHECK_POINT);
          scv.endAction();          
          return;
        }
      }catch(e){
        printDebug(`F : [leader-${scv.scvIndex}: Failed processReq]-[UPDATED CUR_RS: NORMAL or REPLICATION PROCESSED]-[${CUR_INDEX}]`);
        const result = await scv.retryUpdateRS(scv, CUR_RS, reqType+processedResult);

        if(result == IS_CHANGE_ROLE){
          /*END-POINT*/
          printDebug(`I : [leader: processReq]-[CHANGED ROLE: ${CUR_INDEX}]`);
          await scv.notFailedUpdateLPI(scv, scv.myLPI, CUR_INDEX, true);
          await scv.deleteMarking(PROCESSED_CHECK_POINT);
          scv.endAction();
          return;
        }
      }
    }

    /*
    FINAL
    */
    try{
      await scv.notFailedUpdateLPI(scv, scv.myLPI, CUR_INDEX, true);
      await scv.deleteMarking(PROCESSED_CHECK_POINT);
      const result = await client.if(scv.LEADER_KEY, 'Value', '==', scv.scvIndex)
                                 .then(client.put(SSI_KEY).value(CUR_INDEX))
                                 .commit();

      if(result.succeeded == NOT_CUR_LEADER){
        printDebug(`I : [leader: processReq]-[CHANGED ROLE: ${CUR_INDEX}]`);
        scv.endAction();
        return;
      }
      printDebug(`I : [leader-${scv.scvIndex}]-[end process req index:${CUR_INDEX}]\n`);
      scv.endAction();
      nextAction();
    }catch(e){
      printDebug(`F : [leader-${scv.scvIndex}: Failed processReq]-[UPDATED LPI or SSI: ERROR]-[${CUR_INDEX}]`);
      scv.endAction();
      nextAction();
    }
  }

  /**
   * ACTION - [Task Obj: leader role], [When: Start leader]
   * */
  async prepareServiceAction(){
    this.startAction();

    printDebug(`I : [leader: Started preparing service for reader service]`);
    const client = this.processETCD;

    try{
      this.logSize = Number(await client.get(LS_KEY));
    }catch(e){
      printDebug(`F : [leader: Failed prepareService]-[GET LOG_SIZE]`);
      sleep.sleep(2);
      await this.prepareServiceAction();
      return;
    }

    while(this.logSize > this.lpi){
      let CUR_INDEX = this.lpi+1;
      let CUR_RS_KEY = (RS_KEY+CUR_INDEX);
      let req;
      let curRS;
      let process;
      let beforeLeader;

      /*GET RS*/
      try{
        curRS = await client.get(CUR_RS_KEY);
      }catch(e){
        printDebug(`F : [leader: Failed prepareService]-[GET RS_KEY]`);
        sleep.sleep(2);
        await this.prepareServiceAction();
        return;
      }
      let reqType = curRS[0];
      let stateResult = curRS[1];

      printDebug(`I : [leader: processing index of prepare service]-[index:${CUR_INDEX}]`);
      /*CASE 1-UNPROCESS*/
      if(stateResult == UNPROCESS){
        try{
          const result = await client.if(this.LEADER_KEY, 'Value', '==', this.scvIndex)
                                     .then(client.put(CUR_RS_KEY).value(reqType+UNPROCESSABLE))
                                     .commit(); 
          if(result.succeeded == NOT_CUR_LEADER){
            printDebug(`I : [leader: prepareService]-[ING-CHANGED ROLE: ${CUR_INDEX}]`);
            this.endAction();
            return;
          }
        }catch(e){
          printDebug(`F : [leader: Failed prepareService]-[UPDATE RS_KEY:UNPROCESS]`);
          sleep.sleep(2);
          await this.prepareServiceAction();
          return;
        }
      }

      /*CASE 2-REPLICATE*/
      if(reqType == REPLICATE){
        try{
          const reqLog = await client.get(''+CUR_INDEX);
          req = parse(reqLog);
          process = await this.findReqProcess(req, REPLICATE);
        }catch(e){
          printDebug(`F : [leader: Failed prepareService]-[UPDATE RS_KEY:UNPROCESS]`);
          sleep.sleep(2);
          await this.prepareServiceAction();
          return;
        }
      }

      /*CASE 2.1-SUCCESS*/
      if(stateResult == SUCCESS && process != null){
        try{
          await process(req, emptyRes);
          this.lpi = CUR_INDEX;
        }catch(e){
          printDebug(`F : [leader: Failed prepareService]-[SUCCESSFUL_PROCESSING]-[index:${CUR_INDEX}]`);
          printDebug(`Exit with fatal error`);
          process.exit(1);
        }
      }

      /*CASE 2.2-PROCESSING*/
      let processedResult;
      if(stateResult == PROCESSING && process != null){
        try{
          beforeLeader = curRS[2];
          this.markingProcessing(CUR_INDEX)
          const result = await process(req, emptyRes);
          this.lpi = CUR_INDEX;
          this.deleteMarking(PROCESSING_CHECK_POINT);
          this.markingProcessed(CUR_INDEX);
          
          if(result == -1) processedResult = FAILED;
          else processedResult = SUCCESS; 
        }catch(e){
          console.log(e);
          printDebug(`F : [leader: Failed prepareService]-[PROCESSING RESULTS]-[index:${CUR_INDEX}]`);
          processedResult = FAILED;
        }
      }
      if(processedResult != null){
        try{
          const result = await client.if(this.LEADER_KEY, 'Value', '==', this.scvIndex)
                                     .then(client.put(CUR_RS_KEY).value(reqType+processedResult+PROCESSING+beforeLeader))
                                     .commit();
          
          if(result.succeeded == NOT_CUR_LEADER){
            printDebug(`I : [leader: prepareService]-[CHANGED ROLE: ${CUR_INDEX}]`);
            await this.notFailedUpdateLPI(this, this.myLPI, CUR_INDEX, true);
            this.deleteMarking(PROCESSED_CHECK_POINT);
            this.endAction();
            return;
          }
        }catch(e){
          printDebug(`F : [leader-${this.scvIndex}: Failed prepareService]-[UPDATED CUR_RS: PROCESSING REQ]-[${CUR_INDEX}]`);
          const result = await this.retryUpdateRS(this, CUR_RS_KEY, curRS+processedResult);
          if(result == IS_CHANGE_ROLE){
            printDebug(`I : [leader: prepareService]-[CHANGED ROLE: ${CUR_INDEX}]`);
            await this.notFailedUpdateLPI(this, this.myLPI, CUR_INDEX, true);
            this.deleteMarking(PROCESSED_CHECK_POINT);
            this.endAction();
            return;
          }
        }
      }

      /*CASE 3-END_CUR_WORK*/
      try{
        this.lpi = CUR_INDEX;
        await client.put(this.myLPI).value(CUR_INDEX);
        this.deleteMarking(PROCESSED_CHECK_POINT);
        const result = await client.if(this.LEADER_KEY, 'Value', '==', this.scvIndex)
                                   .then(client.put(this.SSI_KEY).value(CUR_INDEX))
                                   .commit(); 
        if(result.succeeded == NOT_CUR_LEADER){
          printDebug(`I : [leader: prepareService]-[ING-CHANGED ROLE: ${CUR_INDEX}]`);
          this.endAction();
          return;
        }        
      }catch(e){
        printDebug(`F : [leader: Failed prepareService]-[UPDATE LPI]-[index:${CUR_INDEX}]`);
        sleep.sleep(2);
        await this.prepareServiceAction();
        return;
      }
    }
    this.endAction();
    printDebug('I : [leader: completed..prepare service]');
  }

  /**
   * ACTION - [Task Obj: follower role], [When: loopingFollowingAction]
   * */
  async followingAction(scv){
    // prevent from overlap run
    if(scv.state != FOLLOWER) return;
    if(scv.isRunAction()) return;
    else scv.startAction();

    const client = scv.processETCD;
    const SSI_KEY = scv.SSI_KEY;
    const LPI_KEY = scv.myLPI;
    const RS_KEY = scv.RS_KEY;

    try{
      scv.ssi = Number(await client.get(SSI_KEY));
    }catch(e){
      printDebug(`E : [follower: faield following latest state]-[GET SSI, LPI]`);
      scv.endAction();      
      return;
    }

    while(scv.ssi > scv.lpi){
      if(scv.state != FOLLOWER){
        scv.endAction();
        return;
      }

      let req;
      let curRS;
      let reqLog;
      let reqType;
      let process;
      let resultState;
      let CUR_INDEX = scv.lpi+1;
      let CUR_RS_KEY = (RS_KEY+CUR_INDEX);

      try{
        curRS = await client.get(CUR_RS_KEY);
        reqType = curRS[0];
        resultState = curRS[1];
      }catch(e){
        printDebug(`E : [follower: faield following latest state]-[GET-CUR_RS:${CUR_INDEX}]`);
        scv.endAction();
        return;
      }
 
      printDebug(`I : [follower: follwing latest state]-[index:${CUR_INDEX}]`);
      if(resultState === SUCCESS && reqType == REPLICATE){
        try{
          reqLog = await client.get(''+CUR_INDEX);
        }catch(e){
          printDebug(`E : [follower: faield following latest state]-[GET-LOG:${CUR_INDEX}]`);
          scv.endAction();
          return;
        }
        req = await parse(reqLog);
        process = scv.findReqProcess(req, REPLICATE);

        try{
          await process(req, emptyRes);
          scv.lpi = CUR_INDEX;
        }catch(e){
          printDebug(`E : [follower: faield following latest state]-[PROCESS:${CUR_INDEX}]`);
          scv.endAction();
          return;
        }
      }

      try{
        scv.lpi = CUR_INDEX;
        await client.put(LPI_KEY).value(''+CUR_INDEX);
      }catch(e){
        printDebug(`E : [follower: faield following latest state]-[UPDATE_LPI:${CUR_INDEX}]`);
        scv.endAction();
        return;
      }
    }
    scv.endAction();
  }

  /**
   * LISTEN - [Task Obj: leader role]
   * */
  async ListenUpdateLogSize(){
    const self = this;
    this.curWatchEvent = await this.watchETCD.watch().prefix(LS_KEY).create();
    this.curWatchEvent.on('put',(res)=>{
      const processingPack = {
        scv: self,
        index: res.value.toString()
      }
      self.processQ.push(this.processReqLogAction, processingPack);
    })
  }

  /**
   * LISTEN - [Task Obj: follower role]
   * */
  async ListenUpdateSSI(){
    const self = this;
    this.curWatchEvent = await this.watchETCD.watch().prefix(SSI_KEY).create();
    this.curWatchEvent.on('put',(res)=>{
      self.ssi = Number(res.value.toString());
    })
  }

  /**
   * LOOPING - [Task Obj: follower role]
   * */
  async loopingFollowingAction(){
    const self = this;
    const LOOPING_TIME = FOLLOWING_TIME_SEC*1000;
    this.loopingFollwID = setInterval(this.followingAction, LOOPING_TIME ,self);
  }

  /**
   * LOOPING - Task Obj: all role
   * */
  async loopingWatchEtcdState(self){
    const etcdStatus = await self.watchETCD.maintenance.status();
    const curEtcdLeader = (etcdStatus.header.member_id === etcdStatus.leader)
    const scvState = self.state;
    const isLeaderStart = (curEtcdLeader && scvState == FOLLOWER);
    const isFollowerStart = (!curEtcdLeader && (scvState == LEADER || scvState == REGISTER));

    if(isLeaderStart){
      self.startRegisterRole();
      printDebug('I: transition etcd state: LEADER');
    }
    
    if(isFollowerStart){
      self.startFollowerRole();
      printDebug('I: transition etcd state: FOLLOWER');
    }
  }

  /**
   * Init state for transition
   * */
  clearRoleState(){
    if(this.curWatchEvent != null){
      this.curWatchEvent.cancel();
    }
    if(this.loopingFollwID != null){
      clearInterval(this.loopingFollwID);
      this.loopingFollwID = null;
    }

    this.storeQ.removeAllObjects();
    this.processQ.removeAllObjects();
    
    this.reqPool.clear();
    this.responsePool.clear();
  }


  /**
   * For NotFailed LPI Update
  */
  async notFailedUpdateLPI(scv, key, value, isFirstTry){
    try{
      if(!isFirstTry) sleep.sleep(2);
      printDebug(`I : [UPDATE_LPI]-[${value}]`);
      await scv.processETCD.put(key).value(value);
    }catch(e){
      console.log(e);
      await scv.notFailedUpdateLPI(scv, key, value, false);
      return;
    }
  }

  /* util */
  startAction(){
    this.watcher.set('isRunAction',{run: true});
  }

  /* util */
  endAction(){
    this.watcher.set('isRunAction',{run: false});
  }

  /* util */ 
  isRunAction(){
    const isRuning = this.watcher.get('isRunAction').run;
    return isRuning;
  }

  /* util */
  findRollbackProcess(req){
    const method = req.method.toLowerCase();
    const path = req._parsedUrl.pathname;
    const rollbackProcess = this.rollbackProcess.get(method+path);
    return rollbackProcess;
  }

  /* util */
  findReqProcess(req, reqType){
    const method = req.method.toLowerCase();
    const path = req._parsedUrl.pathname;

    if(reqType==REPLICATE){
      return this.replicatingProcess.get(method+path);
    }
    if(reqType==NORMAL){
      return this.normalProcess.get(method+path);
    }
  }

  //For ProcessReqAction 
  markingProcessing(index){
    const processIndex = {
      index: index
    }
    fs.writeFileSync(PROCESSING_CHECK_POINT, JSON.stringify(processIndex));
  }

  //For ProcessReqAction 
  markingUnprocess(index){
    const processIndex = {
      index: index
    }
    fs.writeFileSync(UNPROCESS_CHECK_POINT, JSON.stringify(processIndex));
  }

  //For ProcessReqAction 
  markingProcessed(index){
    const processIndex = {
      index: index
    }
    fs.writeFileSync(PROCESSED_CHECK_POINT, JSON.stringify(processIndex));
  }

  //For ProcessReqAction
  deleteMarking(type){
    fs.unlinkSync(type);
  }

  /**
   * For final RS update: ProcessReqAction
   */
  async retryUpdateRS(scv, key, value){
    const client = scv.processETCD;

    try{
      sleep.sleep(2);
      printDebug(`F : [retryUpdateRS]-[${key}]`);
      const result = await client.if(scv.LEADER_KEY, 'Value', '==', scv.scvIndex )
                                 .then(client.put(key).value(value))
                                 .commit();

      if(!result.succeeded){
        printDebug(`I : [leader: processReq]-[CHANGED ROLE: ${CUR_INDEX}]`);
        return -1;
      }
      return 1;
    }catch(e){
      const result = await scv.retryUpdateRS(scv, key, value, false);
      return result;
    }
  }

  /**
   * Condition: When the process ends but the LPI fails to update
   *            => (isHasProcessedPoint() == true)
   * */
  async retryUpdateLPI(){
    let readFile = fs.readFileSync(PROCESSED_CHECK_POINT);
    let info = JSON.parse(readFile);
    let curIndex = info.index;
    await this.notFailedUpdateLPI(this, this.myLPI, curIndex, true);
    this.lpi = Number(curIndex);
    await this.deleteMarking(PROCESSED_CHECK_POINT);
  }

  /**
   * Condition: When updated RS while processing, but not start process()
   *            => (isHasNotProcess() == true)
   * */  
  async retryRunProcess(){
    let readFile = fs.readFileSync(UNPROCESS_CHECK_POINT);
    let info = JSON.parse(readFile);
    let curIndex = info.index;
    let process;
    let req;

    try{
      let reqBin = await this.processETCD.get(curIndex);
      req = await parse(reqBin);
    }catch(e){
      printDebug(`F : [retryProcess]-[FAILED GET REQ]-[${curIndex}]`);
      await this.retryRunProcess();
      printDebug(`I : [retryProcess]-[RETRY]-[${curIndex}]`);
      return;
    }

    process = this.findReqProcess(req, REPLICATE);

    if(process == null){
      printDebug(`I : [retryProcess]-[CUR REQ TYPE IS NOT REPLICATE TYPE]-[${curIndex}]`);
      return;
    }

    try{
      printDebug(`I : [retryProcess]-[RUN RETRY_PROCESS]-[${curIndex}]`);
      await process(req, emptyRes);
      this.lpi = Number(curIndex);
      printDebug(`I : [retryProcess]-[SUCCESS RETRY_PROCESS]-[${curIndex}]`);
    }catch(e){
      printDebug(`E : [retryProcess]-[FAILED RETRY_PROCESS]-[${curIndex}]`);
    }

    await this.notFailedUpdateLPI(this, this.myLPI, curIndex, true);
    await this.deleteMarking(UNPROCESS_CHECK_POINT);
  }

  /**
   * Condition: When app service is terminated during processing
   *            => (isHasProcessing() == true)
   * */  
  async retryRollbackAndProcess(){
    let readFile = fs.readFileSync(PROCESSING_CHECK_POINT);
    let info = JSON.parse(readFile);
    let curIndex = info.index.toString();
    let rollbackProcess;
    let process;
    let req;

    try{
      let reqLog = await this.processETCD.get(curIndex);
      req = await parse(reqLog);
    }catch(e){
      printDebug(`F : [rollbackAndProcess]-[FAILED GET REQ]-[${curIndex}]`);
      this.rollback();
      printDebug(`I : [rollbackAndProcess]-[RETRY]-[${curIndex}]`);
      return;
    }

    rollbackProcess = this.findRollbackProcess(req);
    process = this.findReqProcess(req, REPLICATE);

    if(process == null){
      printDebug(`I : [rollbackAndProcess]-[CUR REQ TYPE IS NOT REPLICATE TYPE]-[${curIndex}]`);
      await this.notFailedUpdateLPI(this, this.myLPI, curIndex, true);
      await this.deleteMarking(PROCESSING_CHECK_POINT);
      return;
    }

    try{
      printDebug(`I : [rollbackAndProcess]-[RUN ROLLBACK PROCESS]-[${curIndex}]`);
      await rollbackProcess(req);
      printDebug(`I : [rollbackAndProcess]-[SUCCESSFUL ROLLBACK PROCESS]-[${curIndex}]`);
    }catch(e){
      console.log(e);
      printDebug(`I : [rollbackAndProcess]-[NOT FOUND ROLLBACK PROCESS]-[${curIndex}]`);
      await this.notFailedUpdateLPI(this, this.myLPI, curIndex, true);
      await this.deleteMarking(PROCESSING_CHECK_POINT);
      return;
    }
    

    try{
      await process(req, emptyRes);
      this.lpi = Number(curIndex);
      printDebug(`I : [rollbackAndProcess]-[SUCCESS PROCESS]-[${curIndex}]`);
    }catch(e){
      printDebug(`F : [rollbackAndProcess]-[FAILED PROCESS]-[${curIndex}]`);
    }
    await this.deleteMarking(PROCESSING_CHECK_POINT);
    await this.notFailedUpdateLPI(this, this.myLPI, curIndex, true);
  }

  isHasProcessedPoint(){
    return fs.existsSync(PROCESSED_CHECK_POINT);
  }

  isHasProcessingPoint(){
    return fs.existsSync(PROCESSING_CHECK_POINT);
  }
  
  isHasNotProcessPoint(){
    return fs.existsSync(UNPROCESS_CHECK_POINT);
  }

  /* util in storeReq Func */
  getReqType(method, path){
    if(path==EX_TXN_PATH) return EX_TXN;
    const processPath = method+path;
    const replicating = this.replicatingProcess.get(processPath);
    if(replicating != undefined) return REPLICATE;
    const normal = this.normalProcess.get(processPath);
    if(normal != undefined) return NORMAL;
    return 'exception';
  }

  /* WHEN (SERVICE ROLE = INIT STATE) */
  async checkConnectionEtherClient(){
    try{
      await this.serviceRegistry.newSRClient();
      console.log('I : completed checking connection of ethereum client');
      return;
    }catch(e){
      console.log(e);
      console.log('E : failed checking connection of ethereum client');
      sleep.sleep(1);
      console.log('I : retrying checking connection of ethereum client');
      await this.checkConnectionEtherClient();
      return;
    }
  }
  
  /* WHEN (SERVICE ROLE = INIT STATE) */
  async checkConnectionEtcdClient(){
    try{
      await this.watchETCD.maintenance.status();
      console.log('I : completed checking connection of etcd client');
      return;
    }catch(e){
      console.log('E : failed checking connection of etcd client');
      sleep.sleep(1);
      console.log('I : retrying checking connection of etcd client');
      await this.checkConnectionEtcdClient();
      return;
    }
  }



}
/*END*/




function printDebug(info){
  if(DEBUG) console.log(info);
}