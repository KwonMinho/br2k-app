const util_path = `${__dirname}/utils/`;
const cors = require('cors');
const sleep = require('sleep');
const wait = sleep.sleep;
const LDAPClient = require(util_path+'ldap_client');
const ldapClient = new LDAPClient();
const DIDClient = require(util_path+'did_client/index');
const DIDCfg = require(util_path+'did_cfg');
const didCfg = new DIDCfg();
const didClient = new DIDClient({
    network: didCfg.getNetwork(),
    regABI: didCfg.getDidABI(),
    regAddr: didCfg.getDidAddr()
});


const config = require('../runtime-config');
const app = require('br2k-app')(config);
app.use(cors());



app.defineRLE('POST','/service',(req)=>{
    const rle = {
        did: req.body.did,
        scvType: req.body.scvType,
    };
    return rle;
}).replicate(async(rle, res)=>{
	const {did, scvType} = {
        did: rle.did,
        scvType: rle.scvType,
    };
    // const auth = await didClient.didAuth(did, pubKeyID, signature, sigData);
    // const isValid = auth[0];
    // const resultMsg = auth[1];
    const isValid = true;
    if(!isValid) res.send(resultMsg);
    else{
        ldapClient.addService({did: did, ou: scvType});
        //console.log('wait..5');
        //wait(5);
        res.send("Success Enroll to service");
    }
});


app.defineRLE('POST','/user',(req)=>{
    const rle = {
        uDID: req.body.did,
        sn: req.body.sn,
        cn: req.body.cn,
        privilege: req.body.privilege,
        sDID: req.body.sDid
    };
    return rle;
}).replicate(async(rle,res)=>{
	const {uDID, sn ,cn, privilege, sDID} = {
        uDID: rle.uDID,
        sn: rle.sn,
        cn: rle.cn,
        privilege: rle.privilege,
        sDID: rle.sDID
    };

    // 1. ldap에 해당 서비스와 유저가 있는지 확인
    const event = ldapClient.searchUser(sDID, uDID);

    event.on('search', async (results)=>{
        try{
            //2. 서비스가 있어야하고 유저가 없어야함.
            const storageInfo  = results[0];
            const userInfo = results[1];
            const storageDN = storageInfo.dn;


            //3. 서비스가 없다면 return or 유저가 있다면 리턴
            if(storageInfo == null || userInfo != null) {
                res.send('Not exist service! or Already user!');
                return;
            }

            //4. 해당 유저 did auth를 통한 신원검증
            // const auth = await didClient.didAuth(did, pubKeyID, signature, sigData);
            // const isValid = auth[0];
            // const resultMsg = auth[1];
        
            const isValid = true;
            if(!isValid){
                res.send(resultMsg);
            }else{
             //저장
                ldapClient.addUser({did: uDID, sn: sn, cn: cn, privilege: privilege}, storageDN);
               // console.log('wait..5');  
       	// wait(5);
		res.send("Success Enroll");
            }
        }catch(e){
            return -1;
        }
    });
});

app.listen(3000);
