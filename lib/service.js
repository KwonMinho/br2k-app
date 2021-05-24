const Follower = require("./role/follower");
const { SCV_MSG } = require("./utils/config");


module.exports = class Service {
  /**
   * @param {object} rcfg: runtime config
   */
  constructor(rcfg) {
    this.roleObj = new Follower(null, rcfg);
    this._bootstrap(rcfg);
  }

  /**
   * @protected
   * @description start service(main function)
   * */
  async _bootstrap() {
    const follower = this.roleObj;
    await follower.checkMyEtcd();
    await follower.checkScvRegConnection();
    await follower.initEtcdData();
    await follower.checkStateVersion();
    await follower.startService(follower, this);
  }

  /**
   * @public
   * @param {object} req
   * @param {object} res
   * */
  putRequestMiddleWare(req, res) {
    if (!this.roleObj.isLeader()) {
      res.send({
        error: SCV_MSG.notProvideScv,
      });
      return;
    }
    if (this.roleObj.isOverMaxReq()) {
      res.send({
        error: SCV_MSG.versionUpping,
      });
      return;
    }
    this.roleObj.replicateRequest(req, res);
  }

  /**
   * @public
   * @param {boolean} isReplicate
   * @param {object} process
   * */
  setRouting(isReplicate, process) {
    this.roleObj.setRouting(isReplicate, process);
  }

  /**
   * @public
   * @param {object} process
   */
  setRollbacks(process) {
    this.roleObj.setRollbacks(process);
  }

  /**
   * @public
   * @param {object} process
   * */
  setBackUpState(process) {
    this.roleObj.setBackUpState(process);
  }
};
