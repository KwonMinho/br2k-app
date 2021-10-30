module.exports = {
    /**
    * @param {object}:
    *            type: 
    *            auth: {}
    */
    verifyCfg: function(cfg){
        if(cfg == null) 
          throw new TypeError('Config "recovery.storage-type or .storage-auth " is empty');
       
        const type = cfg.type;
        const auth = cfg.auth;

        if(type == null)
          throw new TypeError('Config "recovery.storage-type" is empty');
        if(auth == null) 
          throw new TypeError('Config "recovery.storage-auth" is empty');
        if(!typeCheck(type)) 
          throw new TypeError('Config "recovery.type" is not correctly, support for mysql');
        
        switch(type){
          case "mysql": 
            checkMysqlAuth(auth);
            break;
        }
    }
}

function checkMysqlAuth(auth){
  if(auth.host == null){
    throw new TypeError('Not found recovery.storage-auth.host[mysql] in config');
  }
  if(auth.user == null){
    throw new TypeError('Not found recovery.storage-auth.user[mysql] in config');
  }  
  if(auth.password == null){
    throw new TypeError('Not found recovery.storage-auth.password[mysql] in config');
  }
  if(auth.database == null){
    throw new TypeError('Not found recovery.storage-auth.database[mysql] in config');
  }  
}

function typeCheck(type){
  return (type == 'mysql');
}

