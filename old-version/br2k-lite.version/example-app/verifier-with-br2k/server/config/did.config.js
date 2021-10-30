module.exports = {
    NETWORK: "https://api.baobab.klaytn.net:8651/",
    DID: "did:kt:971dff7b7b9c57a24463a4fd0cb9b5ad6fcd2219",
    DID_ABI_PATH: `${__dirname}/../utils/did_client/registry-abi.json`,
    DID_REGISTRY: "0xbCd509F468Fbc017fE615dE0b9cEfAa1Fbf335A6",
    ACCOUNT_KEY_PATH: `${__dirname}/res/key-verfier-deployer.json`,
    VERIFIER_END_POINT: "pslab.me",
    PRIVATE_KEY_LIST: [
      {id: 'key-1',type: "EcdsaSecp256k1RecoveryMethod2020", value: '0xd4a7db5b054b7f44749ad0bc46bfdacdd6435353bf0397256799555092aabdaa' }
    ],
  };
  