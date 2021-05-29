const { Etcd3 } = require('etcd3')
const shell = require('shelljs')
const random = require('random')

let common = '192.168.205.1'
let host = 'vagrant'
let ec = new Object
let curPoint = 0
let killStart = 0

let killCnt = 0;

const time = 222222
const cycle = random.int(min=60, max=120)   //20+
let startTime

let beforeIndex = 0;

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


	let leaderIndex = random.int(min=0, max=4)

	//step.2 check
	if(beforeIndex == leaderIndex){
		if(leaderIndex == 4){
			leaderIndex == 1
		}else{
			++leaderIndex
		}
	}

	beforeIndex = leaderIndex;

	console.log("Exeing time:",(new Date()-startTime))
	console.log("Start Kill--> NODE ",leaderIndex+1)
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
		console.log("Execution time:",(new Date()-startTime))
	},time*1000)
}
main()
