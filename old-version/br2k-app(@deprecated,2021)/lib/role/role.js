const {
  TIME,
  OPREATION,
  ACTION_LOCK_KEY,
  ETCD_CFG,
  SCV_MSG,
  ETCD_KEY,
  RES_TYPE,
  RES_STATE,
  ROLE,
  STATE_LOCATION,
  STATE_MODE,
  STATE_DEFAULT,
} = require("../utils/config");
const { parse } = require("flatted");
const { Etcd3 } = require("etcd3");
const getServiceRegistry = require("../service_registry/main");
const getBackupManager = require("../backup_manager/main");
const watcher = require("obj-watcher");
const sleep = require("sleep");
const wait = sleep.sleep;
const fs = require("fs");
const { clearInterval } = require("timers");
const Logger = require('../utils/logger');

module.exports = class Role {
  constructor(beforeRole, rcfg) {
    /*service var-states*/
    this.ssi = 0;
    this.lpi = 0;
    this.logSize = 0;
    this.stateVersion = 0;
    this.myStateVersion = 0;
    this.curRole = "";
    this.scvID = "";
    this.scvIndex = "";
    this.myLPIKey = "";
    this.myStateVersionKey = "";
    /*clients*/
    this.etcdClient = {};
    this.watchETCDClient = {};
    this.backupManager = {};
    this.serviceRegistry = {};
    /*config-var*/
    this.storageType = "";
    this.storageAuth = {};
    this.statePath = "";
    this.stateMode = "";
    this.maxStateVersion = 0;
    this.versionUpSize = 0;
    this.routers = {
      replication: new Map(),
      nonReplication: new Map(),
      rollback: new Map(),
      state: new Map(),
    };

    /*looping instance*/
    this.loopingInstance= {};
    this.checkRoleIntance= {};

    /*transtion-lock*/
    this.curTransition = false;

    /*action-lock*/
    this.isWaitTransition = false;
    this.actionManger = watcher;

    /*root*/
    this.root = {};

    /*looger*/
    this.logger = {};

    /* copy before-role var*/
    if (beforeRole) {
      Object.keys(beforeRole).forEach((key) => {
        if (this[key] != null) {
          this[key] = beforeRole[key];
        }
      });
    }
    if (rcfg) this.__init(rcfg);
  }

  /**
   * @action
   * @protected
   * @subject_of_use [register, follower]
   */
  async _completionCheck() {
    const checkIndex = this.lpi + 1;
    const res = await this._getRES(checkIndex);
    if(res == null) return true;
    if (res.length == 3 && oldLeader == this.scvID) {
      if(res[2] == this.scvID){
        return false;
      }
    }
    return true;
  }

  /**
   * @action_common
   * @protected
   * @subject_of_use [leader, register, follower]
   * */
  async _checkRole(self) {
    const isTransition = await self.__isTransition();
    if (isTransition) {
      self._transition(self);
    }
  }

  /**
   * @public
   * @subject_of_use [service]
   * @param {object} req
   * @param {object} res
   */
  replicateRequest(req, res) {
    //IF this.curRole == FOLLOWER
    res.send(SCV_MSG.notProvideScv);
  }

  /**
   * @public
   * @subject_of_use [service]
   * @param {boolean} isReplicate
   * @param {object} requestInfo
   */
  setRouting(isReplicate, requestInfo) {
    if (isReplicate) {
      this.routers.replication.set(requestInfo.path, requestInfo.cb);
    } else {
      this.routers.nonReplication.set(requestInfo.path, requestInfo.cb);
    }
  }
  /**
   * @public
   * @subject_of_use [service]
   * @param {object} requestInfo
   */
  setRollbacks(requestInfo) {
    this.routers.rollback.set(requestInfo.path, requestInfo.cb);
  }

  /**
   * @public
   * @subject_of_use [service]
   * @param {object} requestInfo
   * */
  setBackUpState(requestInfo) {
    this.routers.state.set(requestInfo.path, requestInfo.cb);
  }

  /**
   * @deprecated
   * @util
   * @public
   * @subject_of_use [service]
   * @returns {boolean}
   */
  isLeader() {
    return this.curRole == ROLE.leader;
  }

  /**
   * @util
   * @public
   * @subject_of_use [service]
   * @returns {boolean}
   */
  _isOverMaxReq() {
    return this.logSize >= this.versionUpSize;
  }

  /**
   * @protected
   * @param {array} subjectInfo: arr[0]: role, arr[1]: action of br2k service
   * @param {object} req: user request obj
   * @param {object} res: user response obj
   * @param {string} reqType: replication, non-replication, External_txn
   * @param {string} index: index of request log entry
   * @return {number} [OPREATION.success or OPREATION.failed]
   */
  async _startProcessing(subjectInfo, req, res, reqType, index) {
    try {
      this.logger.log('info',subjectInfo[0],subjectInfo[1],`start to processing request: ${index}`);
      const process = this.__findReqProcess(req, reqType);
      const result = await process(req, res);
      this.logger.log('info',subjectInfo[0],subjectInfo[1],`successful end processing: ${index}`);
      return result == OPREATION.failed ? OPREATION.failed : OPREATION.success;
    } catch (e) {
      console.log(e);
      return OPREATION.failed;
    }
  }

  /**
   * @protected
   * @subject_of_use [leader, register, follower]
   * @param {object} req: user request
   */
  async _storedState(req) {
    const results = this.__findStateProcess(req);
    const process = results.cb;
    const routingKey = results.key;

    const state = await process(req);
    const objString = JSON.stringify({
      key: routingKey,
      state: state,
    });
    fs.writeFileSync(STATE_LOCATION, objString);
  }

  /**
   * @protected
   * @subject_of_use [follower]
   * @returns {boolean}
   */
  async _isValidStateVer() {
    try {
      const curStateVer = await this.etcdClient.get(ETCD_KEY.stateVersion);
      const curMyVer = await this.etcdClient.get(this.myStateVersionKey);
      this.stateVersion = Number(curStateVer)
      this.myStateVersion = Number(curMyVer);

      if (this.stateVersion == this.myStateVersion) return true;
      else return false;
    } catch (e) {
      this._wait();
      return this._isValidStateVer();
    }
  }

  /**
   * @protected
   * @subject_of_use [follower]
   */
  async _loadLatestScvState() {

    this.logger.log('info','','load latest state', 'successful get log of latest state');
    const logObj = await this.serviceRegistry.getLatestBackupLog();

    await this.backupManager.loadBackupState(
      this.backupManager.getBackupLogStorageAuth(logObj),
      this.backupManager.getBackupLogAccessKey(logObj),
      this.statePath
    );
  }

  /**
   * @protected
   * @subject_of_use [register, follower]
   * @param {function} defaultCallback: IF. state mode is default,..
   */
  async _recoveryState(defaultCallback) {
    switch (this.stateMode) {
      case STATE_MODE.default:
        await this._loadLatestScvState();
        defaultCallback();
        break;
      case STATE_MODE.rollback:
        /*rollback mode */
        const backupObj = JSON.parse(
          fs.readFileSync(STATE_LOCATION, { encoding: "utf8" })
        );
        const routingKey = backupObj.key;
        const state = backupObj.state;
        const rollbackProcess = this.__findRollbackProcess(routingKey);
        await rollbackProcess(state);
        await this._retryStartRole();
    }
  }

  /**
   * @util
   * @protected
   * @subject_of_use [register, follower]
   * @param {string} type
   * @param {string} state
   * @returns {boolean}
   * */
  _isFollowingRequest(type, state) {
    return state === RES_STATE.success && type === RES_TYPE.replication;
  }

  /**
   * @util
   * @protected
   * @subject_of_use [leader, register, follower]
   */
  _wait() {
    wait(TIME.retryOperation);
  }

  /**
   * @util
   * @protected
   * @subject_of_use [leader, register, follower]
   */
  _isRollbackMode() {
    return this.stateMode == STATE_MODE.rollback;
  }

  /**
   * @util
   * @protected
   * @subject_of_use [register]
   * @param {string} key
   * @param {number} cnt
   * @return {object or -1}
   */
  async _getRES(key, cnt = 0) {
    try {
      if (cnt == 10) return OPREATION.maxRetryOver;
      const res = await this.etcdClient.get(key);
      return res;
    } catch(e) {
      console.log(e)
      this.logger.log('error','','get RES',"failed to get RES..retry count: " + (cnt + 1));
      this._wait();
      const res = await this._getRES(key, ++cnt);
      return res;
    }
  }

  /**
   * @util
   * @subject_of_use [register]
   * @protected
   */
  async _getLogSize() {
    try {
      this.logSize = Number(await this.etcdClient.get(ETCD_KEY.logSize));
    } catch (e) {
      console.log(e);
      this.logger.log('error','','prepare service',"failed to get log size");
      this._wait();
      await this._getLogSize();
      return;
    }
  }

  /**
   * @util
   * @protected
   * @subject_of_use [leader,follower,register]
   * @param {number} result
   * @returns {boolean}
   */
  _isFailedOperaion(result) {
    return result == OPREATION.failed;
  }

  /**
   * @util
   * @protected
   * @subject_of_use [leader,follower,register]
   * @param {string} index
   * @return {object or IF failed -> number}
   * */
  async _getRequest(index) {
    try {
      const re = await this.etcdClient.get(index);
      const request = await parse(re);
      return request;
    } catch (e) {
      return OPREATION.failed;
    }
  }

  /**
   * @util
   * @protected
   * @subject_of_use [leader,register]
   * @param {string} value
   * @param {boolean} isFirst
   */
  async _updateLPI(value, isFirst = true) {
    try {
      if (!isFirst) this._wait();
      this.logger.log('info','','update LPI',value);

      this.lpi = Number(value);
      await this.etcdClient.put(this.myLPIKey).value(value);
    } catch (e) {
      console.log(e);
      await this._updateLPI(value, false);
      return;
    }
  }

  /**
   * @util
   * @protected
   * @subject_of_use [leader, register, follower]
   */
  _lockAction() {
    this.actionManger.set(ACTION_LOCK_KEY, { run: true });
  }

  /**
   * @util
   * @protected
   * @subject_of_use [leader, register, follower]
   */
  _unlockAction() {
    this.actionManger.set(ACTION_LOCK_KEY, { run: false });
  }

  /**
   * @util
   * @protected
   * @subject_of_use [leader, register, follower]
   */
  _isRunnigAction() {
    return this.actionManger.get(ACTION_LOCK_KEY).run;
  }

  /**
   * @util
   * @protected
   */
  _now() {
    let _date = new Date();
    let year = _date.getFullYear(); // 년도
    let month = _date.getMonth() + 1; // 월
    let date = _date.getDate(); // 날짜
    let hours = _date.getHours(); //
    let minutes = _date.getMinutes();
    let sec = _date.getSeconds();
    let milliSec = _date.getUTCMilliseconds();
    return `${year}-${month}-${date} ${hours}:${minutes}:${sec}:${milliSec}`;
  }

  /**
   * @protected
   * @subject_of_use [leader, follower]
   * @not_implemented
   */
  async _retryStartRole() {}

  /**
   * @protected
   * @subject_of_use [leader, follower]
   * @not_implemented
   * @param {object} currentRole
   */
  async _transition(currentRole) {}

  /**
   * @protected
   * @subject_of_use [leader, follower]
   * @not_implemented
   */
  async _clear() {}

  /**
   * @private
   * @param {object} rcfg: runtime config in BR2K service
   */
  __init(rcfg) {
    this.logger = new Logger();
    this.etcdClient = new Etcd3(ETCD_CFG.instanceOption);
    this.watchETCDClient = new Etcd3(ETCD_CFG.instanceOption);
    this.curRole = ROLE.init;
    this.serviceRegistry = getServiceRegistry(rcfg["service-registry"]);
    const self = this;
    this.actionManger.watch(ACTION_LOCK_KEY, { run: false });
    this.actionManger.onChange(ACTION_LOCK_KEY, (old, newObj) => {
      if (self.isWaitTransition == true && newObj.run == false) {
        self._transition();
        self.isWaitTransition = false;
      }
    });

    const stateCfg = rcfg["state-config"];
    const verUpSize = stateCfg["version-up-size"];
    const statePath = stateCfg["state-path"];
    const stateMode = stateCfg["state-mode"];
    const maxStateVer = stateCfg["max-state-version"];
    const stgType = stateCfg["backup-storage-type"];
    const stgAuth = stateCfg["backup-storage-auth"];

    if (stgType == null || stgAuth == null) {
      console.log("please..setting storage-type,auth in state config");
      process.exit(1);
    }
    if (statePath == null) {
      console.log("please..setting state-path in state config");
      process.exit(1);
    }
    if (!fs.existsSync(statePath)) {
      console.log("state-path not exist..!");
      process.exit(1);
    }

    if (stateMode != STATE_MODE.rollback && stateMode != STATE_MODE.default) {
      console.log("state-mode not exist..!");
      process.exit(1);
    }

    this.storageType = stgType;
    this.storageAuth = stgAuth;
    this.statePath = statePath;
    this.stateMode = stateMode;

    this.backupManager = getBackupManager({
      type: stgType,
      auth: stgAuth,
    });

    if (maxStateVer != null) this.maxStateVersion = maxStateVer;
    else this.maxStateVersion = STATE_DEFAULT.maxStateVersion;

    if (verUpSize != null) this.versionUpSize = verUpSize;
    else this.versionUpSize = STATE_DEFAULT.versionUpSize;
  }

  /**
   * @util
   * @private
   * @param {object} req: user request
   * @returns {object} {callback function, routing-key}
   */
  __findStateProcess(req) {
    const routingKey = this.__getRoutingKey(req);
    const process = this.routers.state.get(routingKey);
    return {
      cb: process,
      key: routingKey,
    };
  }

  /**
   * @util
   * @private
   * @param {object} req: user request
   */
  __getRoutingKey(req){
    const method = req.method.toLowerCase();
    const path = req.originalUrl;
    const routingKey = method+path;
    return routingKey;
  }

  /**
   * @private
   * @returns {boolean} isTransition
   */
  async __isTransition() {
    if(this.curTransition) return;
    this.curTransition = true;
    const etcdStatus = await this.watchETCDClient.maintenance.status();
    const curEtcdLeader = etcdStatus.header.member_id === etcdStatus.leader;
    const isLeaderStart = curEtcdLeader && this.curRole == ROLE.follower;
    const isFollowerStart =
      !curEtcdLeader &&
      (this.curRole == ROLE.leader || this.curRole == ROLE.register);

    //follower-test
    //return false; //fix

    if (isLeaderStart) {
      clearInterval(this.checkRoleIntance);
      this.logger.log('info','follower','check role',"transition etcd state: LEADER");
      this.curTransition = false;
      return true;
    }

    if (isFollowerStart) {
      clearInterval(this.checkRoleIntance)
      this.logger.log('info','follower','check role',"transition etcd state: FOLLOWER");
      this.curTransition = false;
      return true;
    }
    this.curTransition = false;
    return false;
  }

  /**
   * @util
   * @private
   * @param {object} req: user request
   * @param {string} reqType: replication, non-replication, External_TXN
   * @returns {function} function to handle request
   * */
  __findReqProcess(req, reqType) {
    const routingKey = this.__getRoutingKey(req);

    if (reqType == RES_TYPE.replication)
      return this.routers.replication.get(routingKey);
    if (reqType == RES_TYPE.nonReplication)
      return this.routers.nonReplication.get(routingKey);
  }

  /**
   * @util
   * @private
   * @param {object} req: user request
   * @returns {function} user request rollback function
   */
  __findRollbackProcess(req) {
    const routingKey = this.__getRoutingKey(req);
    const process = this.routers.rollback.get(routingKey);
    return process;
  }
};
