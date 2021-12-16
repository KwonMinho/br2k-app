const axios = require('axios');
const endpoint = 'http://127.0.0.1:7123/admin'
const kb = 'http://192.168.0.62:7123/admin'


async function makeGetRequest() {
	try{
		let res = await axios.get(endpoint);
		res.data.size=39805
		console.log(res.data);
	}catch(e){
		console.log("error!")
		console.log(e)
	}
}


makeGetRequest();


