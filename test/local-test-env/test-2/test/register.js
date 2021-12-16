const axios = require('axios');
const Chance = require('chance');
const chance = new Chance();
const didChance = new Chance();

var sleep = require('sleep');


const endpoint = 'http://203.250.77.152:7123/register'

const kb = 'http://192.168.0.63:7123/register'

let newAccount;
let data;

async function getText(){
	newAccount = didChance.string({ length: 15 })+chance.string()
	data  = {
		auth: {
			did: `did:pv:${newAccount}`,
			signature: '0x952cc6fdac39fea2b49ff8f771b',
			pubKeyID: `did:pv:${newAccount}#key-1`
		},
		info: {
			cn: chance.first(),
			sn: chance.last(),
			didGender: chance.gender(),
			didBirth: chance.birthday(),
			didCountry: chance.country(),
			didPhoneNumber: chance.phone(),
			didEmail: chance.email(),
			didJob: chance.profession(),
			didAddress: chance.address(),
			desc:  chance.string()
		}
	};
}

async function makeGetRequest() {
	try{
		for(let i=0; i<10000; i++){
			await getText()
			let res = await axios.post(endpoint, data);
			console.log(res.data)
		}
	}catch(e){
		console.log("request")
		console.log(e)
	}
}



makeGetRequest();


