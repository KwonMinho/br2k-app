const shell = require('shelljs')

let start = function(){
	shell.exec('sudo ip link set down enp0s8')
	setTimeout(()=>{
		shell.exec('sudo ip link set up enp0s8')
	},23000)
}

start()
