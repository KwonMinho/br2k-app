const MysqlClient = require('./types/mysql');
const {verifyCfg} = require('./utils/check_config');

/**
* @param {object}:
*            type: 
*            auth: {}
*/
function getBackupManager(config){
    verifyCfg(config);

    switch(config.type){
        case "mysql":
            return new MysqlClient(config.auth);
    }
}


module.exports = getBackupManager;


