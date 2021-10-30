module.exports = {
    /*check Service Registry config */
    //return: isTestMode(true or false)
    verifyCfg: function(cfg){
        if(cfg == null) 
          throw new TypeError('Config "service-registry" is empty');
       
        const type = cfg.type;
        const id = cfg.id;
        const accessPerm = cfg['access-perm'];

        if(type == null)
          throw new TypeError('Config "service-registry.type" is empty');
        if(id == null) 
          throw new TypeError('Config "service-registry.id" is empty');
        if(accessPerm == null) 
          throw new TypeError('Config "service-registry.access-perm" is empty');
        if(!typeCheck(type)) 
          throw new TypeError('Config "service-registry.type" is not correctly, support for ethereum or klaytn');
        
        switch(type){
          case "ethereum": 
            checkAcessPermEtheruem(accessPerm);
            break;
          case "klaytn":
            checkAccessPermKlaytn();
            break;
        }
    }
}

function checkAcessPermEtheruem(accessPerm){
  if(accessPerm.endpoint == null){
    throw new TypeError('Not found service-registry.access-perm.endpoint in config');
  }
  if(accessPerm.password == null){
    throw new TypeError('Not found service-registry.access-perm.password in config');
  }  
  if(accessPerm.account == null){
    throw new TypeError('Not found service-registry.access-perm.account in config');
  }
  if(accessPerm.contract == null){
    throw new TypeError('Not found service-registry.access-perm.contract in config');
  }else{
    const contractCfg = accessPerm.contract;
    if(contractCfg['json-interface-path']==null)
      throw new TypeError('Not found service-registry.access-perm.contract[json-interface-path] in config');
    if(contractCfg['address']==null)
      throw new TypeError('Not found service-registry.access-perm.contract[address] in config');
  }  
}

function checkAccessPermKlaytn(accessPerm){
  // not ready!
}


function typeCheck(type){
  return (type == 'ethereum' || type == 'klaytn' || type =='test');
}

