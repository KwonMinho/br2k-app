# br2k-was: web server framework with br2k schema


# quick-start

```javascript
const app = require('br2k-app')(RUNTIME_CONFIG);

/*--default mode--*/
app.replicate('POST','/user', (req,res)=>{
  //process request
  //return -1 (IF.failed)
});
app.onlyOnce('GET','/user',(req,res)=>{
  //process request
});

/*--[special case] rollback mode--*/
app.replicate('POST', '/user', (req,res)=>{
  //process request
  //return -1 (IF.failed) 
}).backupState(req=>{
  //define state(object)
  return state
}).rollback(state=>{
  //define rollback process with state(object)
});

app.onlyOnce('GET','/user',(req,res)=>{
  //process request
  //return -1 (IF.failed) 
});
```

# runtime-configuration

```javascript
{
  service-registry (obj),
  webpack-config (obj),
  state-config (obj)
}
```

### service-registry

```javascript
{
  type: 'ethereum' or 'klaytn' or 'test'
  id: 'service-id',
  access-perm: object
}

//IF type: 'test', access-perm: {}
//IF type: 'klaytn', access-perm
{
  endpoint: 'klaytn test net access point'
  account: '0xaB3ffd...xdf',
  private-key: '???',
  password: '???',
  contract: {
    json-interface-path: , //json file-> content abi --> []
    addresss: 
  }
}

//IF type: 'ethereum', access-perm
{
  endpoint: 'etheruem access-point'
  account: '0xaB3ffd...xdf',
  private-key: '???',
  password: '???',
  contract: {
    json-interface-path: , //json file-> content abi --> []
    addresss: 
  }
}
```

### state-config

```javascript
{
  'version-up-size': (option, default=50000)
  'state-path': PROJECT_PATH/state, (option, default)
  'max-state-version': 10, (option, default)
  'state-mode': 'default' or 'rollback' (option),
  'backup-storage-type': 'mysql',
  'backup-storage-auth': {
    host: '',
    user: '',
    password: ''
    database: ''
  }
}
```

</br></br>

# backup storage: mysql

## backup-log format in service registry

```javascript
{
    "start": "",
    "end": "",
    "version": 5, //state-version
    "members": [],
    "alive-members": [],
    "etcd-snapshot-size": "",  //byte
    "service-state-size": "",  //byte
    "storage":{
        "host": "",
        "database": "",
        "user": "",
        "password": "",
        "backup-access-key": " "
    },
    "subject": "scv-id"
}

//example
{
  start: '2021-5-22 2:49:57:804',
  end: '2021-5-22 2:49:59:843',
  version: 3,
  services: '2',
  'alive-services': '2',
  'etcd-snapshot-size': 25890912,
  'service-state-size': 305,
  storage: {
    host: '203.250.77.152',
    user: 'minho',
    password: 'pslab',
    database: 'backup',
    'backup-access-key': '680f3bcce5444adb1b5c67297a031746'
  },
  subject: '13803658152347727308'
}
```

## Setting

### 1. Run mysql db in docker

```docker
/*-- simple example --*/
docker run --name mysql-db -v /tmp/myown/mysql:/var/lib/mysql -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=backup -e MYSQL_USER=minho -e MYSQL_PASSWORD=pslab --restart=always -p 3306:3306 -p 8080:8080 -d mysql
```

### 2. create tables
```
mysql ---password=ROOT_PASSWORD
```
```
mysql> use backup;

mysql>
-- router Table Create SQL
CREATE TABLE router
(
    `index`        INT            NOT NULL AUTO_INCREMENT COMMENT '인덱스',
    `id`           VARCHAR(45)    NOT NULL COMMENT '액세스 키',
    `state_id`     VARCHAR(45)    NOT NULL,
    `snapshot_id`  VARCHAR(45)    NOT NULL,
    PRIMARY KEY (`index`,`id`)
);

ALTER TABLE router COMMENT 'router';


-- router Table Create SQL
CREATE TABLE states
(
    `id`        VARCHAR(45)    NOT NULL    COMMENT 'id',
    `chunk_id`  INT            NOT NULL    COMMENT '청크 아이디',
    `data`      LONGBLOB       NOT NULL    COMMENT '청크 데이터'
);

ALTER TABLE states COMMENT 'states';

ALTER TABLE states
    ADD CONSTRAINT FK_states_id_router_state_id FOREIGN KEY (id)
        REFERENCES router (state_id) ON DELETE RESTRICT ON UPDATE RESTRICT;


-- router Table Create SQL
CREATE TABLE snapshot
(
    `id`        VARCHAR(45)    NOT NULL    COMMENT 'id',
    `chunk_id`  INT            NULL        COMMENT '청크 아이디',
    `data`      LONGBLOB       NULL        COMMENT '청크 데이터'
);

ALTER TABLE snapshot
    ADD CONSTRAINT FK_snapshot_id_router_snapshot_id FOREIGN KEY (id)
        REFERENCES router (snapshot_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
```

### Error: ER_NOT_SUPPORTED_AUTH_MODE

Node.js의 Express에서 mysql미들웨어를 이용해서 원격연결

```
mysql> use mysql;

mysql> alter user 'userName'@'%' identified with mysql_native_password by 'userPassword';

mysql> FLUSH PRIVILEGES;

```
# br2k request info

br2k request object 
- entryIndex:
- subject: {
    id, index
  }

```javascript
app.replicate('POST','/user', (req,res)=>{
  const subjectID = req.br2k.subject.id
  const subjectIndex = req.br2k.subject.index;
  const entryIndex = req.br2k.entryIndex;
});
```

# check list

## 1. State folder permission
<br>
The permission of all files in state folder must be 766

```
chmod -R 766 PROJECT_ROOT_PATH/state
```


# dev-env

nodejs: v14.15.3

npm: 7.10.0

etcd: v3.2

core npm modules:
- express: 4.17.1
- web3: 1.3.6 //ethereum client
- etcd3: 1.0.1
