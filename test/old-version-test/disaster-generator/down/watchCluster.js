const shell = require('shelljs')

let me = function(){
	setInterval(async ()=>{
		console.log("###")
		shell.exec('etcdctl cluster-health')
		console.log("@@@")
	},1000)
}
me()
