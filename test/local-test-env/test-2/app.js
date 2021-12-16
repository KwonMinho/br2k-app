
const cors = require('cors');
const config = require('./config/runtime-config');
///home/pslabmh/current-project/about-br2k/br2k-was/index
const app = require('/home/pslabmh/current-project/about-br2k/br2k-was/index')(config);
app.use(cors);

const fs = require('fs')
app.replicate('POST','/register', async (req, res)=>{
    try{
        const did = req.body.auth.did.toLowerCase()
        const info = req.body.info
        let cur = fs.readFileSync(__dirname+'/state/users.json',{encoding:'utf-8'});
        cur = JSON.parse(cur);
        cur[did] = info;
        fs.writeFileSync(__dirname+'/state/users.json',JSON.stringify(cur,null,2));
        res.send("success")
    }catch(e){
        console.log(e)
        res.send(e)
    }
});

app.onlyOnce('GET',`/admin`,(req, res)=>{    
    // adminControllers.getAllUser(req,res);

    try{
        let cur = fs.readFileSync(__dirname+'/state/users.json',{encoding:'utf-8'});
        const list = JSON.parse(cur)
        res.send({
            'list': list,
            'size': Object.keys(list).length
        });
    }catch(e){
        console.log(e)
        res.send(e)
    } 
});

const wait  = require('sleep').sleep
app.onlyOnce('GET', `/log`, (req, res) => {
    wait(60);
    res.send("suceess")
});

app.listen(7000, ()=>{
    console.log('InfoDID service started on port 7788');
})
