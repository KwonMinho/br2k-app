const Role = require("./role");
const Leader = require("./leader");

const { TIME, ETCD_VALUE, ETCD_KEY, ROLE} = require("../utils/config");
const emptyRes = require("../utils/empty_res");


module.exports =class Follower extends Role {
  constructor(beforeRole, rcfg) {
    super(beforeRole, rcfg);

    this.curRole;

    this._init();
    if(rcfg==null){
      this._startRole();
    }
  }

  /**
   * @action
   * @protected
   * @param {object} self
   * */
  async _following(self) {
    let reqType, reqState, curRESKey, index;
    const action = "following";
    const logInfo = ['info','follower','action: following'];
    const logError = ['error','follower','action: following'];
    if (self._isRunnigAction()) return;

    try {
      self._lockAction();
      self.ssi = Number(await self.etcdClient.get(ETCD_KEY.ssi));
    } catch (e) {
      self.logger.log(...logError, 'failed to get service state index in etcd');
      self._unlockAction();
      return;
    }

    //follower-backup
    if (self.ssi == ETCD_VALUE.startVersionUp) {
      self._waitVersionupWork();
      self._unlockAction();
      return;
    }

    while (self.ssi > self.lpi) {
      if (self.curRole != ROLE.follower) break;

      index = (self.lpi + 1).toString();
      curRESKey = ETCD_KEY.res + index;
      self.logger.log(...logInfo,`processing reqeust index:${index}`);

      try {
        const state = await self.etcdClient.get(curRESKey);
        reqType = state[0];
        reqState = state[1];
      } catch (e) {
        self.logger.log(...logError,`get current RES :${index}`);
        break;
      }

      if (self._isFollowingRequest(reqType, reqState)) {
        if (self._isRollbackMode()) {
          await self._storedState(req);
        }
        
        const req = await self._getRequest(index);
        if (self._isFailedOperaion(req)) {
          self.logger.log(...logError,`get current request ${index}`);
          return;
        }
        const pResult = await self._startProcessing(
          ['follower', action],
          req,
          emptyRes,
          reqType,
          index
        );
        //Exception_BR2K_replication_algo
        if (self._isFailedOperaion(pResult)) {
          await self._followerRecoveryState();
          self._unlockAction();
          return;
        }
      }
      await self._updateLPI(index);
    }
    self._unlockAction();
  }


  /**
   * @public
   */
  async initEtcdData() {
    try {
      const ec = this.etcdClient;

      const lpi = await ec.get(this.myLPIKey);
      if (lpi == null) await ec.put(this.myLPIKey).value(0);
      else this.lpi = Number(lpi);

      const myStateVersion = await ec.get(this.myStateVersionKey);
      if (myStateVersion == null) await ec.put(this.myStateVersionKey).value(1);

      const stateVersion = await ec.get(ETCD_KEY.stateVersion);
      if (stateVersion == null) await ec.put(ETCD_KEY.stateVersion).value(1);

      const size = await ec.get(ETCD_KEY.logSize);
      if (size == null) await ec.put(ETCD_KEY.logSize).value(0);

      const ssi = await ec.get(ETCD_KEY.ssi);
      if (ssi == null) await ec.put(ETCD_KEY.ssi).value(0);

      const sv = await ec.get(ETCD_KEY.stateVersion);
      if (sv == null) await ec.put(ETCD_KEY.stateVersion).value(1);

      const curLeader = await ec.get(ETCD_KEY.curLeader);
      if (curLeader == null) await ec.put(ETCD_KEY.curLeader).value(999);

      this.logger.log('info','follower','check stored data in ETCD', 'successful');
    } catch (e) {
      console.log(e);
      this.logger.log('error','follower','check stored data in ETCD', 'failed');
      this._wait();
      this.initEtcddata();
    }
  }

  /**
   * @public
   * @param {object} self: this
   * @param {object} root: object of service class 
   */
  async startService(self, root) {
    if (self.backupManager.isLoadNewState()) {
      self.logger.log('info','follower','load latest state', '...loading....');
      setTimeout(self.startService, TIME.follwing * 1000, self, root);
    } else {
      self.myStateVersion = self.stateVersion;
      await self.etcdClient.put(self.myStateVersionKey).value(self.myStateVersion);
      self.logger.log('info','follower','load latest state', 'successful!!');
      self.logger.log('info','follower','start role', 'successful');
      self.root = root;
      self._startRole();
      self.checkRoleIntance = setInterval(self._checkRole, TIME.follwing_INTERVAL, self);
    }
  }

  /**
   * @public
   */
  async checkScvRegConnection() {
    try {
      await this.serviceRegistry.checkConnection();
      this.logger.log('info','follower','check service registry', 'successful');
      return;
    } catch (e) {
      console.log(e);
      this.logger.log('error','follower','check service registry', 'failed checking connection of service-registry client');
      this._wait();
      this.logger.log('info','follower','check service registry', 'retrying checking connection of service-registry client');
      await this.checkScvRegConnection();
      return;
    }
  }

  /**
   * @public
   */
  async checkStateVersion() {
    const isValidStateVersion = await this._isValidStateVer();
    if (!isValidStateVersion) {
      this.logger.log('info','follower','check state version', 'The version in the current service state is not the latest version');
      await this._loadLatestScvState();
    }else{
      this.logger.log('info','follower','check state version', 'successful');
    }
  }

  /**
   * @public
   */
  async checkMyEtcd() {
    try {
      const status = await this.watchETCDClient.maintenance.status();  
      this.scvID = status.header.member_id;
      this.myLPIKey = ETCD_KEY.lpi + this.scvID;
      this.myStateVersionKey = ETCD_KEY.stateVersion+this.scvID ;

      const memberList = await this.watchETCDClient.cluster.memberList({linearizable: true});
      const members = memberList.members;
      for(let member of members){
        if(member.ID == this.scvID){
          this.scvIndex = Number(member.name.replace('etcd',''));
        }
      }
      this.logger.set(this.statePath, this.scvID);
      this.logger.log('info','follower','check etcd & init scv-id', 'successful');
    } catch (e) {
      console.log(e)
      this.logger.log('error','follower','check etcd & init scv-id', 'failed');
      this._wait();
      this.checkMyEtcd();
    }
  }

  /**
   * @protected
   */
  _init() {
    this.curRole = ROLE.follower;
  }

  /**
   * @protected
   * */
  async _startRole() {
    this.logger.log('info','follower','transition role','start');
    const isUncompletion = await this._completionCheck();
    this.logger.log('info','follower','action: completion of processed request','check');
    if (!isUncompletion) {
      this.logger.log('info','follower','action: completion of processed request','service state consistency may be broken in BR2K service');
      await this._followerRecoveryState();
    } else {
      this.logger.log('info','follower','following action','start');
      await this._loopingFollowingState();
    }
  }

  /**
   * @protected
   * @override
   */
  async _transition() {
    await this._clear();

    if (this._isRunnigAction()) {
      this.logger.log('info','follower->register(leader)','transition role','waiting for action in previous role to finish');
      this.isWaitTransition = true;
      setTimeout(
        (self) => {
          if (self.isWaitTransition == true) {
            self._transition(); /*retry...*/
          }
        },
        TIME.retryTransition,
        this
      );
    } else {
      this.root.roleObj = new Leader(this, null, Follower);
    }
  }

  /**
   * @protected
   * @override
   */
  async _clear() {
    if (this.loopingInstance != null) {
      clearInterval(this.loopingInstance);
      this.loopingInstance = null;
    }
  }

  /**
   * @protected
   */
  async _loopingFollowingState() {
    const FOLLOWING = TIME.follwing * 1000;
    this.loopingInstance = setInterval(this._following, FOLLOWING, this);
  }

  /**
   * @protected
   */
  async _followerRecoveryState() {
    await this._clear();
    const self = this;
    const FOLLOWING = TIME.follwing * 1000;

    const defaultModeCallBackFunc = () => {
      const looping = setInterval(
        (self) => {
          if (!self.backupManager.isLoadNewState()) {
            clearInterval(looping);
            self._retryStartRole();
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
   * @override
   */
  async _retryStartRole() {
    this._loopingFollowingState();
  }

  /**
   * @protected
   */
  async _waitVersionupWork() {
    this.logger.log('info','follower','state version up','the leader is upgrading the version of service state in BR2k service');
    clearInterval(this.loopingInstance);
    this.loopingInstance = null;

    const self = this;
    const eventWatch = await this.watchETCDClient
      .watch()
      .prefix(ETCD_KEY.ssi)
      .create();
    eventWatch.on("put", async (res) => {
      const stateIndex = Number(res.value.toString());
      if (stateIndex == ETCD_VALUE.completionVersionUp) {
        self.lpi = 0;
        const newVersion = ++self.myStateVersion;
        await self.etcdClient.put(self.myStateVersionKey).value(newVersion);
        self.logger.log('info','follower','state version up','end...');
        eventWatch.cancel();
        self._loopingFollowingState();
      }
    });
  }
}