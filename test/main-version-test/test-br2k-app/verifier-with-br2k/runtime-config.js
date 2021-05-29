const project = __dirname;

module.exports = {
    'service-registry': {
          'type': 'ethereum',
          'id': 'main-verifier',
          'access-perm': {
              'endpoint': 'ws://203.250.77.150:8546',
              'account': '0x3f243FdacE01Cfd9719f7359c94BA11361f32471',
              'password': '1234',
              'private-key': '0x107be946709e41b7895eea9f2dacf998a0a9124acbb786f0fd1a826101581a07',
              'contract': {
              	'json-interface-path': `${__dirname}/abi-service-registry.json`,
              	'address': '0x88FAb7923AB49c83ad35ae519b3074823E96708f'
              }
          }
     },
    'state-config': {
        'version-up-size': 10000,
        'state-path': `${__dirname}/state`,
        'max-state-version': 20,
        'state-mode': 'default',
        'backup-storage-type': 'mysql',
        'backup-storage-auth': {
          'host': '203.250.77.152',
          'user': 'minho',
          'password': 'pslab',
          'database': 'backup'
        },
    },
    'webpack-config': ''
}
