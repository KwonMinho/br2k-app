const Role = require("./role");
const Follower = require("./follower");

const queue = require("function-queue");
const emptyRes = require("../utils/empty_res");
const { Etcd3, Range } = require("etcd3");
const { stringify } = require("flatted");
const {
  TIME,
  OPREATION,
  ETCD_CFG,
  ETCD_TXN_RESULT,
  SCV_MSG,
  ETCD_KEY,
  ETCD_VALUE,
  RES_TYPE,
  RES_STATE,
  ROLE,
  EXCEPTION,
  STATE_DEFAULT
} = require("../utils/config");

//fix
function Log(type, action, msg) {
  console.log(`${type}: [${action}]-[${msg}]`);
}

class Leader extends Role {
  constructor(beforeRole, rcfg) {
    super(beforeRole, rcfg);

    this.resPool;
    this.reqPool;
    this.storeQ;
    this.processQ;
    this.versionUpLog;

    this._init();
    this._startRegisterRole();
  }

  /**
   * @override
   * @public
   * @param {object} req: user request
   * @param {object} res: user response
   */
  replicateRequest(req, res) {
    const method = req.method.toLowerCase();
    const path = req.originalUrl;
    const reqType = this._getReqType(method, path);

    if (reqType == EXCEPTION.notFoundReqType) {
      res.send({
        error: SCV_MSG.notFoundReqType,
      });
      return;
    }

    this.storeQ.push(this._replicateRequest, {
      req: req,
      res: res,
      reqType: reqType,
      self: this,
    });
  }

  /**
   * @protected
   */
  _init() {
    this.storeQ = queue();
    this.processQ = queue();
    this.resPool = new Map();
    this.reqPool = new Map();
    this.putETCDClient = new Etcd3(ETCD_CFG.instanceOption);
    this.curWatchEvent = new Etcd3(ETCD_CFG.instanceOption);
    this.etcdClient = new Etcd3(ETCD_CFG.instanceOption);
    this.watchETCDClient = new Etcd3(ETCD_CFG.instanceOption);
  }

  /**
   * @protected
   */
  async _startRegisterRole() {
    this.logger.log('info','register','transition role', 'start');

    this.curRole = ROLE.register;
    this.checkRoleIntance = setInterval(this._checkRole, TIME.follwing_INTERVAL, this);
    await this.putETCDClient.put(ETCD_KEY.curLeader).value(this.scvID);
    const isUncompletion = await this._completionCheck();

    if (!isUncompletion) {
      await this._registerRecoveryState();
    } else {
      await this._prepareService();
      await this.serviceRegistry.updateLeader(this.scvIndex);
      this._startLeaderRole();
    }
  }

  /**
   * @protected
   * @override
   */
  async _retryStartRole() {
    await this._prepareService();
    await this.serviceRegistry.updateLeader(this.scvIndex);
    this._startLeaderRole();
  }

  /**
   * @protected
   */
  async _registerRecoveryState() {
    const self = this;
    const defaultModeCallBackFunc = () => {
      const FOLLOWING = TIME.follwing * 1000;

      const looping = setInterval(
        async (self) => {
          if (!self.backupManager.isLoadNewState()) {
            clearInterval(looping);
            await self._retryStartRole();
          }
        },
        FOLLOWING,
        self
      );
    };
    await this._recoveryState(defaultModeCallBackFunc);
  }

  /**
   * @protected
   * @action_leader
   * @param {fucntion} next: next action
   * @param {object} payload:
   *     payload{
   *        req(object),
   *        res(object),
   *        type(string),
   *        self(object, this)
   */
  async _replicateRequest(next, payload) {
    const req = payload.req;
    const res = payload.res;
    const type = payload.reqType;
    const self = payload.self;

    const ec = self.putETCDClient;
    const index = (self.logSize + 1).toString();
    const curRESKey = ETCD_KEY.res + index; // RES=request Entry State
    const stateRES = type + RES_STATE.null;

    req.br2k = {
      entryIndex: index,
      subject: {
        id: self.scvID,
        index: self.scvIndex
      }
    }

    self.resPool.set(index, res);
    self.reqPool.set(index, req);

    try {
      const entry = await stringify(req);
      const txn = await ec
        .if(ETCD_KEY.curLeader, "Value", "==", self.scvID)
        .then(
          ec.put(index).value(entry),
          ec.put(curRESKey).value(stateRES),
          ec.put(ETCD_KEY.logSize).value(index)
        )
        .commit();

      if (txn.succeeded) {
        self.logSize = parseInt(index);
        self.logger.log('info','leader','action: replicate request', `req-${index}`);
      } else {
        self._delPoolsInstance(index);
        res.send(RES_STATE.failed_STORE_REQUEST);
      }
    } catch (e) {
      self.logger.log('error','leader','action: replicate request', `failed to put reqeust-${index}`);
    } finally {
      next();
    }
  }

  /**
   * @action_leader
   * @protected
   * @param {fucntion} next: next action
   * @param {string} info: {index(string), mode(string):stateMode ,self(object)}
   * */
  async _processRequest(next, info) {
    const index = info.index;
    const self = info.self;
    const curRESKey = ETCD_KEY.res + index;
    const req = self.reqPool.get(index);
    const res = self.resPool.get(index);
    const method = req.method.toLowerCase();
    const path = req.originalUrl;
    const reqType = self._getReqType(method, path);
    const isEmpty = res == undefined || req == undefined;
    const action = "process request";

    const logInfo = ['info','leader','action: process request'];
    const logError = ['error','leader','action: process request'];

    /* 0. check empty req,res */
    self._lockAction();
    self.logger.log(...logInfo, `start: ${index}`);
    if (isEmpty) {
      self.logger.log(...logError, `[not found req,res instance]: ${index}`);

      const result = await self._updateRES(
        'leader',
        curRESKey,
        reqType + RES_STATE.failed,
        index
      );

      if (self._isNotCurLeader(result)) {
        self.logger.log(...logInfo, `changed role -> follower: ${index}`);
        await self._updateLPI();
        await self._unlockAction();
      } else if (self._isFailedEtcdTXN(result)) {
        await self._processRequest(next, index);
      }
      return;
    } /*END-POINT*/

    /* main action content */
    if (reqType == RES_TYPE.excetion_TXN) {
      self.logger.log(...logInfo, `Exception-TXN: ${index}`);
      res.send(SCV_MSG.successPutExtenalTxn);
      self._delPoolsInstance(index);
    } else {
      /* fix*/
      if (self._isRollbackMode()) {
        self.logger.log(...logInfo, `rollback mode:stored current state in local`);
        await self._storedState(req);
      }
      /* step.1 inprocess */
      const ipstate = reqType + RES_STATE.inProcess + self.scvID;
      const result = await self._updateRES('leader',curRESKey, ipstate, index);
      self.logger.log(...logInfo, `request state -> Inprocess: ${index}`);

      if (self._isNotCurLeader(result)) {
        self.logger.log(...logInfo, `changed role -> follower: ${index}`);
        await self._updateLPI();
        await self._unlockAction();
      } else if (self._isFailedEtcdTXN(result)) {
        await self._processRequest(next, index);
      }
      /* step.2 start process */
      /* step.3.1 commit RES results */
      /* step.3.2 unsafe state to safe state */
      const psResult = await self._startProcessing(
        ['leader',action],
        req,
        res,
        reqType,
        index
      );
      await self._commitRES(curRESKey, reqType + psResult);
      self._delPoolsInstance(index);
    }
    /* step. 4,5 increase LPI,SSI */
    await self._updateLPI(index);
    await self._updateSSI(index);
    self.logger.log(...logInfo, `update service state: ${index}`);

    /* bakcup entry */
    self._checkVersionUp();

    /* 0. end func */
    self._unlockAction();
    self.logger.log(...logInfo, `end process: ${index}`);
    next();
  }

  /**
   * @action_versionUP
   * @protected
   */
  _checkVersionUp() {
    if (this.lpi >= this.versionUpSize) {
      this._startStateVersionUp();
    }
  }

  /**
   * @action_versionUP
   * @protected
   */
  async _startStateVersionUp() {
    this.logger.log('info','leader','service-state-version up', 'start');
    //origin
    const result = await this._checkServicesHealth();
    if (!result.isServiceHealth) {
      this.logger.log('info','leader','service-state-version up', "can't start state version up: service unhealthy");
      return;
    }

    this.versionUpLog = {
      start: this._now(),
      end: "",
      version: this.stateVersion,
      services: result.services,
      "alive-services": result.healthyScv,
      "etcd-snapshot-size": "",
      "service-state-size": "",
      storage: this.storageAuth,
      subject: this.scvID,
    };

    const FOLLOWING = TIME.follwing * 1000;
    this.logger.log('info','leader','service-state-version up', "waiting for followers to be up-to-date");
    this.loopingInstance = setInterval(
      this._checkFollowerStates,
      FOLLOWING,
      this
    );
  }

  /**
   * @action_versionUP
   * @protected
   */
  async _checkServicesHealth(retryCnt = 0) {
    let memberList;

    try {
      memberList = await this.etcdClient.cluster.memberList({
        linearizable: true,
      });
    } catch (e) {
      this.logger.log('error','leader','service-state-version up',`..etcd connection error..retry ${retryCnt}`);
      this._wait();
      if (retryCnt == 5) {
        return {
          isServiceHealth: false,
        };
      } else {
        return this._checkServicesHealth(++retryCnt);
      }
    }

    let serviceIDs = [];
    let healthyMember = [];
    const members = memberList.members;
    const quorum = parseInt(members.length / 2 + 1);

    for (let member of members) {
      try {
        serviceIDs.push(member.clientURLs);
        const ce = new Etcd3({ hosts: member.clientURLs });
        await ce.maintenance.status();
        healthyMember.push(member.clientURLs);
        this.logger.log('info','leader','service-state-version up','healthy follower: ' + member.ID);
      } catch (e) {
        this.logger.log('info','leader','service-state-version up','unhealthy follower: ' + member.ID);
      }
    }

    return {
      services: serviceIDs,
      healthyScv: healthyMember,
      isServiceHealth: healthyMember.length >= quorum,
    };
  }

  /**
   * @action_versionUP
   * @protected
   */
  async _checkFollowerStates(self) {
    const states = await self.etcdClient.getAll().prefix(ETCD_KEY.lpi);
    for(let scv in states) {
      const stateIndex = Number(states[scv]);
      if (stateIndex != self.versionUpSize) {
        self.logger.log('info','leader','service-state-version up','any follower are not up to date..');
        return;
      }
    }
    self.logger.log('info','leader','service-state-version up','all followers are up-to-date!');
    clearInterval(self.loopingInstance);
    self.loopingInstance = null;
    self._startBackupState();
  }

  /**
   * @action_versionUP
   * @protected
   */
  async _startBackupState() {
    this.logger.log('info','leader','service-state-version up','start to backup state,snapshot in storage');

    this._disConnectUpdateLSEvent();
    await this._updateSSI(ETCD_VALUE.startVersionUp);

    const keys = await this.backupManager.putBackupKey();
    this.snapshotStream = await this.etcdClient.maintenance.snapshot();
    await this.backupManager.putSnapshot(keys.snapshot, this.snapshotStream);
    await this.backupManager.putStates(keys.states, this.statePath);

    const FOLLOWING = TIME.follwing * 1000;

    this.loopingInstance = setInterval(
      this._checkCompletionBackup,
      FOLLOWING,
      {
        self: this,
        keys: keys,
      }
    );
  }

  /**
   * @action_versionUP
   * @protected
   */
  async _checkCompletionBackup(info) {
    const self = info.self;
    const keys = info.keys;
    const isBackupEnd = self.backupManager.isBackupEnd();
    if (isBackupEnd) {
      self.logger.log('info','leader','service-state-version up','completion to backup state,snapshot in storage');
      clearInterval(self.loopingInstance);
      self.snapshotStream = null;
      const sizes = self.backupManager.getLatestBackupSizes();
      self.versionUpLog["etcd-snapshot-size"] = sizes.snapshot;
      self.versionUpLog["service-state-size"] = sizes.states;
      self.versionUpLog.storage["backup-access-key"] = keys.main;
      self._reInitETCD();
    }
  }

  /**
   * @action_versionUP
   * @protected
   */
  async _reInitETCD() {
    try {
      this.logger.log('info','leader','service-state-version up','start re-Init ETCD');
      await this.etcdClient.delete().prefix(ETCD_KEY.res);
      await this.etcdClient.delete().range(new Range('1', STATE_DEFAULT.maxSize)); //fixs
      const states = await this.etcdClient.getAll().prefix(ETCD_KEY.lpi);
      for(let scvLPIKey in states) {
        await this.etcdClient.put(scvLPIKey).value(0);
      }
      const newVersion = this.myStateVersion+1;
      await this.etcdClient.put(ETCD_KEY.stateVersion).value(newVersion);
      await this.etcdClient.put(this.myStateVersionKey).value(newVersion);
      await this.etcdClient.put(ETCD_KEY.logSize).value(0);
    } catch (e) {
      console.log(e);
      this.logger.log('info','leader','service-state-version up','reInitETCD...retry');
      this._reInitETCD();
    }
    await this._completionVersionUp();
  }

  /**
   * @action_versionUP
   * @protected
   */
  async _completionVersionUp() {
    this.versionUpLog.end = this._now();
    await this.serviceRegistry.backupLog(this.versionUpLog); //fix
    this.logger.log('info','leader','service-state-version up','completion to backupLog in service registry');
    this.lpi=0;
    this.ssi=0;
    this.logSize=0;
    ++this.myStateVersion;
    ++this.stateVersion;
    await this.etcdClient.put(ETCD_KEY.ssi).value(ETCD_VALUE.completionVersionUp);
    this.logger.log('info','leader','service-state-version up','completion');
    await this._connectUpdateLSEvent();
  }

  /**
   * @protected
   */
  async _startLeaderRole() {
    this.logger.log('info','leader','transition role','start');
    this.curRole = ROLE.leader;
    await this._connectUpdateLSEvent();
  }

  /**
   * @protected
   * @override
   * @param {object} currentRole
   */
  async _transition(currentRole) {
    await this._clear();

    if (this._isRunnigAction()) {
      this.logger.log('info','leader','transition','waiting for action in previous role to finish');
      this.isWaitTransition = true;
      setTimeout(
        (self) => {
          if (self.isWaitTransition == true) {
            self._transition(currentRole); /*retry...*/
          }
        },
        TIME.retryTransition,
        this
      );
    } else {
      this.root.roleObj = new Follower(currentRole, null);
    }
  }

  /**
   * @protected
   * */
  async _connectUpdateLSEvent() {
    const self = this;
    this.curWatchEvent = await this.watchETCDClient
      .watch()
      .prefix(ETCD_KEY.logSize)
      .create();
    this.logger.log('info','leader','watch update-LogSize-event','start');
    this.curWatchEvent.on("put", (res) => {
      self.processQ.push(this._processRequest, {
        index: res.value.toString(),
        self: this,
      });
    });
  }

  /**
   * @protected
   * */
  _disConnectUpdateLSEvent() {
    if (this.curWatchEvent.cancel != null) {
      this.curWatchEvent.cancel();
    }
  }

  /**
   * @action_register
   * @protected
   */
  async _prepareService() {
    this._lockAction();

    const logInfo = ['info','leader','action: prepare service'];
    const logError = ['error','leader','action: prepare service'];

    /*1. get Log size in ETCD*/
    this.logger.log(...logInfo,'start');
    await this._getLogSize();

    while (this.logSize > this.lpi) {
      const index = (this.lpi + 1).toString();
      const curRESKey = ETCD_KEY.res + index;
      
      this.logger.log(...logInfo,`current req-${index}`);
      /*2. get RES(current index)*/
      const curRES = await this._getRES(curRESKey);
      if (curRES == OPREATION.maxRetryOver) {
        this._wait();
        await this._prepareService();
        return;
      }
      const reqType = curRES[0];
      const reqState = curRES[1];

      /*3.1-NULL_STATE or INPROCESS*/
      if (this._isIgnoreState(reqState)) {
        let state = reqType + RES_STATE.ignore;
        if (reqState == RES_STATE.inProcess) state = state + curRES[2];
        const result = await this._updateRES('register',curRESKey, state,index);

        if (this._isNotCurLeader(result)) {
          this._unlockAction();
          return;
        } else if (this._isFailedEtcdTXN(result)) {
          await this._prepareService();
          return;
        }
      }

      /*3.2-Replication, SUCCESS*/
      if (this._isFollowingRequest(reqType, reqState)) {
        const req = await this._getRequest(index);
        if (this._isFailedOperaion(req)) {
          this.logger.log(...logError,`failed to get request:${index}`);
          this._wait();
          this._prepareService();
          return;
        }
        if (this._isRollbackMode()) {
          await this._storedState(req);
        }

        const pResult = await this._startProcessing(
          ['leader',action],
          req,
          emptyRes,
          reqType,
          index
        );
        if (this._isFailedOperaion(pResult)) {
          await this._registerRecoveryState();
          return;
        }
      }
      await this._updateLPI(index);
      await this._updateSSI(index);
      this.logger.log(...logInfo,`update service state:${index}`);
    }
    /* bakcup entry */
    this._checkVersionUp();
    this._unlockAction();
  }

  /**
   * @protected
   * @override
   */
  async _clear() {
    this._disConnectUpdateLSEvent();

    if (this.loopingInstance != null) {
      clearInterval(this.loopingInstance);
      this.loopingInstance = null;
    }
    this.storeQ.removeAllObjects();
    this.processQ.removeAllObjects();

    this.reqPool.clear();
    this.resPool.clear();
  }

  /**
   * @util
   * @protected
   * @param {string} index: request entry index
   */
  _delPoolsInstance(index) {
    this.reqPool.delete(index);
    this.resPool.delete(index);
  }

  /**
   * @util
   * @protected
   * @param {number} reqState
   */
  _isIgnoreState(reqState) {
    return reqState == RES_STATE.null || reqState == RES_STATE.inProcess;
  }

  /**
   * @util
   * @protected
   * @param {string} method: http method
   * @param {string} path: RESTful API path
   * @returns {string} replication, non-replication, exception
   */
  _getReqType(method, path) {
    if (path == RES_TYPE.excetion_TXN_PATH) return RES_TYPE.excetion_TXN;

    const key = method + path;

    const rp = this.routers.replication.get(key);
    if (rp != undefined) return RES_TYPE.replication;

    const nrp = this.routers.nonReplication.get(key);
    if (nrp != undefined) return RES_TYPE.nonReplication;

    return EXCEPTION.notFoundReqType;
  }

  /**
   * @util
   * @protected
   * @param {number} result [ETCD_TXN_RESULT.failed,ETCD_TXN_EXCEPTION]
   * @returns {boolean}
   */
  _isNotCurLeader(result) {
    return result == ETCD_TXN_RESULT.failed;
  }

  /**
   * @util
   * @protected
   * @param {number} [ETCD_TXN_RESULT.exception,ETCD_TXN_SUCCESS,ETCD_TXN_FAILED]
   * @returns {boolean}
   */
  _isFailedEtcdTXN(result) {
    return result == ETCD_TXN_RESULT.exception;
  }

  /**
   * @util
   * @protected
   * @param {string} role
   * @param {string} key: key of res
   * @param {string} value: value of res
   * @param {string} index: index of request entry
   * @returns {number} [ETCD_TXN_RESULT.exception,ETCD_TXN_SUCCESS,ETCD_TXN_FAILED]
   * */
  async _updateRES(role, key, value, index) {
    const result = await this._etcdIFtxn(key, value);

    if (this._isNotCurLeader(result)) {
      this.logger.log('info',role,'update RES',`[failed to update RES-change role- ${index}`);
    }
    if (this._isFailedEtcdTXN(result)) {
      this.logger.log('error',role,'update RES',`[failed to update RES-exception- ${index}`);
      this._wait();
    }
    return result;
  }

  /**
   * @util
   * @protected
   * @param {string} key: key of RES
   * @param {string} value: value of RES
   * */
  async _commitRES(key, value, repeatCnt = 1) {
    const result = await this._etcdIFtxn(key, value);

    if (this._isNotCurLeader(result)) {
      this.logger.log('info','leader','commit RES',`[failed to commit RES-change role-`);
      return;
    }

    if (this._isFailedEtcdTXN(result)) {
      this._wait();
      this.logger.log('error','leader','update RES',`[failed to update RES-exception`);
      await this._commitRES(key, value, ++repeatCnt);
    }
  }

  /**
   * @util
   * @protected
   * @param {string} index: index of request entry
   * */
  async _updateSSI(index) {
    let result = await this._etcdIFtxn(ETCD_KEY.ssi, index);

    if (this._isNotCurLeader(result)) {
      this.logger.log('info','leader','update SSI',`[failed to update SSI: change role`);
      return; /* end-point */
    }
    if (this._isFailedEtcdTXN(result)) {
      this.logger.log('error','leader','update SSI',`[failed to update SSI: exception`);
      do {
        this._wait();
        result = await this._updateSSI(index);
      } while (this._isFailedEtcdTXN(result));
    }
  }

  /**
   * @util
   * @protected
   * @param {string} _key: etcd key
   * @param {string} _value: etcd value
   * @return {number} [ETCD_TXN_RESULT.exception,ETCD_TXN_SUCCESS,ETCD_TXN_FAILED]
   * */
  async _etcdIFtxn(_key, _value) {
    try {
      const result = await this.etcdClient
        .if(ETCD_KEY.curLeader, "Value", "==", this.scvID)
        .then(this.etcdClient.put(_key).value(_value))
        .commit();
      if (!result.succeeded) return ETCD_TXN_RESULT.failed;
      return ETCD_TXN_RESULT.success;
    } catch (e) {
      return ETCD_TXN_RESULT.exception;
    }
  }
}

module.exports = Leader;
