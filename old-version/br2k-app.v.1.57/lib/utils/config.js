/* state */
const STATE_MODE = {
  default: "default",
  rollback: "rollback",
};
const STATE_LOCATION = __dirname + "/state.json";

const STATE_DEFAULT = {
  maxStateVersion: 10,
  versionUpSize: 50000,
  maxSize: '999999999999999999999999999',
};

/* role */
const ROLE = {
  init: "init-state",
  register: "register",
  learner: "learner",
  leader: "leader",
  follower: "follower",
};

/* request */
const RES_STATE = {
  null: "0",
  ignore: "9",
  success: "1",
  failed: "2",
  inProcess: "3",
};

const RES_TYPE = {
  replication: "R",
  nonReplication: "N",
  excetion_TXN: "T",
};

/* etcd  */
const ETCD_KEY = {
  logSize: "log_size",
  res: "res/",
  lpi: "lpi/",
  ssi: "ssi",
  curLeader: "cur_leader",
  stateVersion: "state_version@",
};

const ETCD_VALUE = {
  startVersionUp: -1,
  completionVersionUp: 0,
};
const ETCD_TXN_RESULT = {
  success: 1,
  failed: -1,
  exception: -2,
};

/* msg */
const SCV_MSG = {
  notProvideScv: "It does not provide in here",
  notFoundReqType: "No service could be found for request",
  failedPutReq: "request failed...try again..",
  successPutExtenalTxn: "Success stored external_TXN log",
  versionUpping: "Currently adjusting the service",
};

/* etc */
const ETCD_CFG = {
  instanceOption: { hosts: "localhost:2379" },
};
const FIX_PATH = {
  external_success_txn: "EX_TXN_PATH",
};
const ACTION_LOCK_KEY = "action";
const EXCEPTION = {
  notFoundReqType: "E",
};
const OPREATION = {
  success: 1,
  failed: -1,
  maxRetryOver: -1,
};
const TIME = {
  follwing: 1,
  retryTransition: 10000,
  retryOperation: 2,
};


module.exports = {
  TIME,
  OPREATION,
  EXCEPTION,
  ACTION_LOCK_KEY,
  FIX_PATH,
  ETCD_CFG,
  SCV_MSG,
  ETCD_TXN_RESULT,
  ETCD_VALUE,
  ETCD_KEY,
  RES_TYPE,
  RES_STATE,
  ROLE,
  STATE_LOCATION,
  STATE_MODE,
  STATE_DEFAULT,
};
