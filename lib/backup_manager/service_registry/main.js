const {verifyCfg} = require('./utils/check_config');
const EtherRegistry = require('./types/ethereum.js');
const TestRegistry = require('./types/test');
const KlaytnRegistry = require('./types/klaytn'); /*not imp*/


function getServiceRegistry(config){
    verifyCfg(config);

    switch(config.type){
        case "ethereum":
            return new EtherRegistry(config.id, config['access-perm']);
        case "klaytn":
            return new KlaytnRegistry(config.id, config['access-perm']);
        case "test":
            return new TestRegistry();
    }
}

module.exports = getServiceRegistry;


