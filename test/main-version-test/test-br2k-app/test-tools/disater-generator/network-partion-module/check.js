const isPortReach = require('is-port-reachable')

let isOne = true
let isTwo = true
let isThree = true
let isFour = true
let isFive = true
let isSix = true

let dieNode = 0

let check =async ()=>{
	let one = await isPortReach(2379,{host:'192.168.205.10'})
        let two =await isPortReach(2379,{host:'192.168.205.11'})
        let three =await isPortReach(2379,{host:'192.168.205.12'})
        let four =await isPortReach(2379,{host:'192.168.205.13'})
        let five =await isPortReach(2379,{host:'192.168.205.14'})
        let six =await isPortReach(2379,{host:'192.168.205.15'})

	if(!one && dieNode!=1){ console.log("node-1 Die"); dieNode=1 }
        if(!two && dieNode!=2){ console.log("node-2 Die"); dieNode=2}
        if(!three && dieNode!=3){ console.log("node-3 Die"); dieNode=3 }
        if(!four && dieNode!=4){ console.log("node-4 Die"); dieNode=4 }
        if(!five && dieNode!=5){ console.log("node-5 Die"); dieNode=5 }
        if(!six && dieNode!=6){ console.log("node-6 Die"); dieNode=6 }

}

setInterval(check,100)
