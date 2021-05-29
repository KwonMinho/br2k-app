const { Etcd3 } = require('etcd3')
const shell = require('shelljs')
const random = require('random')

let common = '192.168.205.1'
let host = 'vagrant'
let ec = new Object
let curPoint = 0
let killStart = 0

let killCnt = 0;

const time = 2147483
const cycle = random.int(min=120, max=300)   //20+
let startTime

let etcdSetting = async()=>{
	ec.nodes = new Array
	let i = 0;
	while(i<5){
		ec[i]= new Etcd3({hosts:common+i+':2379'})
		let v = await ec[i].maintenance.status()
		ec.nodes.push(v.header.member_id)
		i++
	}
}
let start = async function(){

	//step.1 Find
	let leaderIndex
	let cur_leader= (await ec[curPoint].maintenance.status()).leader;

	ec.nodes.forEach((v,i)=>{
		if(v == cur_leader){
			console.log("["+killStart+"]"+"Kill->LEADER NODE:",i+1)
			leaderIndex = i
		}
	})
	
	//step.2 check
	if(curPoint == leaderIndex){
		if(curPoint == 4){
			curPoint == 1
		}else{
			++curPoint
		}
	}
	//step.3 nodePoint
	console.log("Now Execing Time:",(new Date()-startTime)/1000)
	shell.exec('ssh vagrant@'+common+leaderIndex+' node /home/vagrant/share/down/main.js')
	++killCnt
	console.log('[victim num]:'+killCnt);
}

let main = async function(){
	await etcdSetting()
	console.log("setting")
	let timerId = setInterval(start,cycle*1000)
	startTime = new Date()
	setTimeout(()=>{
		clearInterval(timerId)
		console.log("Execution time:",(new Date()-startTime)/1000)
	},time*1000)
}
main()
