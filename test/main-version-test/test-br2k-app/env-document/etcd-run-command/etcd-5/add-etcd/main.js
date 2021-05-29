const { Etcd3 } = require('etcd3');
const option = {hosts: ['http://192.168.205.10:2379']};

const client = new Etcd3(option);

async function addMember(){
	try{
		const test = await client.cluster.memberAdd({
			isLearner: true,
			peerURLs: ['http://192.168.205.15:2380']
		});
		console.log(test);
	}catch(e){
		console.log(e);
	}
}

addMember();
