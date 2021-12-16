
module.exports = {
    'service-registry': {
          'type': 'test',
          'id': 't1',
          'access-perm': {
              'endpoint': 'ws://203.250.77.150:8546',
              'account': '0x3f243FdacE01Cfd9719f7359c94BA11361f32471',
              'password': '1234',
              'private-key': '0x107be946709e41b7895eea9f2dacf998a0a9124acbb786f0fd1a826101581a07',
              'contract': {
              	'json-interface-path': `${__dirname}/../resource/abi-registry.json`,
              	'address': '0x6012df3B6ac7D377322AF716d6FdA435d7C95Fb4'
              }
          }
     },
    'state-config': {
        'version-up-size': 1000000,
        'state-path': `${__dirname}/../state`,
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
