const ldap = require('ldapjs');
const cfg = require('../config/ldap.config');
const EventEmitter = require('events');

module.exports = class LDAPClient{

    constructor() {
        this.client = ldap.createClient({
            url: cfg.URL
        });
        this.client.bind(cfg.ADMIN_DN, cfg.PASSWORD, (err)=>{
        });
    }


     /**
      * @param {object} didInfo {did, ou}
     */
     addService(didInfo){
        const rootDN = 'dc=verifier,dc=com';

        const entry ={
	        did: didInfo.did,
	        createdTime: new Date(),
	        isPaused: 'TRUE',
	        ou: didInfo.ou,
	        objectclass: ['top','didObject', 'organizationalUnit']
        };

        this.client.add(`did=${didInfo.did},${rootDN}`, entry, function(err){
            if(err != null)
	            console.log(err);
        });    
    }


    /**
     * @param {object} Info {did, sn, cn, privilege} 
     * @param {*} serviceDN 
     */
    addUser(info, serviceDN){
        const entry ={
            cn: info.cn,
            sn: info.sn,
	        did: info.did,
	        createdTime: new Date(),
	        isPaused: 'TRUE',
	        privilege: info.privilege,
	        objectclass: ['top','didObject', 'person']
        };

       // console.log(`did=${did},${serviceDN}`);
        this.client.add(`did=${info.did},${serviceDN}`, entry, function(err){
            if(err != null)
	            console.log(err);
        });
    }

    searchService(sDid){
        const event = new EventEmitter();
        const results = new Array();
        const opts ={
            scope: 'sub',
            filter: `(|(did=${sDid})(did=222))`,
            attributes: ['did', 'privilege']
        };
        this.client.search(cfg.ROOT_DN, opts, (err, res)=>{
            res.on('searchEntry', function(entry) {
                results.push(entry.object)
            });
            res.on('end', function() {
                event.emit('search', results);
            });
        })
        return event;
    }


    searchUser(sDid, uDid){        
        const event = new EventEmitter();
        const results = new Array();
        const opts ={
            scope: 'sub',
            filter: `(|(did=${sDid})(did=${uDid}))`,
            attributes: ['did', 'privilege']
        };

        this.client.search(cfg.ROOT_DN, opts, (err, res)=>{
            res.on('searchEntry', function(entry) {
                results.push(entry.object)
            });
            res.on('end', function() {
                event.emit('search', results);
            });
        })
        return event;
    }
}
