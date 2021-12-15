module.exports = {
    'service-registry': {
          'type': 'ethereum',
          'id': 'test-app',
          'access-perm': {
              'endpoint': 'ws://203.250.77.150:8546',
              'account': '0x3f243FdacE01Cfd9719f7359c94BA11361f32471',
              'password': '1234',
              'private-key': '0x107be946709e41b7895eea9f2dacf998a0a9124acbb786f0fd1a826101581a07',
              'contract': {
              	'json-interface-path': '/home/pslabmh/br2kTest/abi-service-registry.json',
              	'address': '0xfa4F1b56653Ec1F16297F703Fae85221426DcE11'
              }
          }
     },
    'state-config': {
        'version-up-size': 10,
        'state-path': '/home/pslabmh/br2kTest/state',
        'max-state-version': 10,
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
