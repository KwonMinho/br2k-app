<br>

<img src=./assets/br2k-was-logo.png>
Replication-framework for replicating a blockchain web application service server.


# :turtle: About

**`br2k-was`** is a framework for easily applying <a href='https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART002639420'> BR2K technique </a> that ensure the robustness of blockchain application services.

The _BR2K_ technique supports blockchain application services to continuously provide services to users through a recovery method that supports replication of services and quick restart for service failures.

<br>

<img src=./assets/br2k-service.png width=50% height=50%>
<h5> [BR2K-service: Blockchain web application server replicated using BR2K-was] </h5>

<br>

# :turtle: Features

- Robustness
- Fast replication for high availability
- Focus on strong consistency (using ETCD)
- Support lite version

<br>

# :turtle: Quick start

```bash
npm install -g br2k-cli
cd YOUR_SERVER_PROJECT
br2k init
vim server.js
```

### Server.js

```js
const port = 3000;
const app = require("br2k-was")(RUNTIME_CONFIG); //RUNTIME_CONFIG는 아래 참조

app.replicate("POST", "/user", (req, res) => {
  // Handling of user requests that need to be replicated
  // If it fails, return -1.
});

app.onlyOnce("GET", "/user", (req, res) => {
  // Handling of user requests that must be executed only once.
  // If it fails, return -1.
});

app.listen(port, () => {
  console.log(`Example br2k server listening at ${port}`);
});
```

### Lite-version-server.js

```js
const port = 3000;
const app = require("br2k-was")(RUNTIME_CONFIG); //RUNTIME_CONFIG는 아래 참조

app
  .replicate("POST", "/user", (req, res) => {
    // Handling of user requests that need to be replicated
    // If it fails, return -1.
  })
  .backupState((req) => {
    // Define the state required for rollback operation about processing the request.
    return state;
  })
  .rollback((state) => {
    // Define the rollback operation
  });

app.onlyOnce("GET", "/user", (req, res) => {
  // Handling of user requests that must be executed only once.
  // If it fails, return -1.
});
```

<br>

# :turtle: Implementations related to the br2k technique

- <a href=https://github.com/KwonMinho/br2k-was>br2k-was</a>
- <a href=https://github.com/KwonMinho/br2k-cli>br2k-cli</a>
- <a href=https://github.com/KwonMinho/service-registry>service-Registry</a>
- <a href=https://github.com/KwonMinho/br2k-watch>br2k-watch</a>

<br>

# :turtle: Runtime Configuration

```js
{
  "service-registry"(obj), "webpack-config"(obj), "state-config"(obj);
}
```

<br>

### service-registry

```js
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

<br>

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

# :turtle: Backup Storage-Mysql

## backup-log format in service registry

```js
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

<br>

## Mysql Setting

<br>

### 1. Run mysql db in docker

```docker
/*-- simple example --*/
docker run --name mysql-db -v /tmp/myown/mysql:/var/lib/mysql -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=backup -e MYSQL_USER=minho -e MYSQL_PASSWORD=pslab --restart=always -p 3306:3306 -p 8080:8080 -d mysql
```

### 2. create tables

```bash
mysql ---password=ROOT_PASSWORD
```

```bash
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

```bash
mysql> use mysql;

mysql> alter user 'userName'@'%' identified with mysql_native_password by 'userPassword';

mysql> FLUSH PRIVILEGES;
```

<br>

# :turtle: Detail

## 1. State folder permission

<br>
The permission of all files in state folder must be 766

```
chmod -R 766 PROJECT_ROOT_PATH/state
```

## 2. Multiple Type Request

```js
// ex) replication reqeust + onlyOnce request
app.replicate('POST','/user', (req,res)=>{
if(app.isLeader(req){
//here!!: replicate request area
}else{
//here!!: onlyOnce request area
}
//process request
//return -1 (IF.failed)
});
```

## 3. br2k meta info included in user request

```js
app.replicate("POST", "/user", (req, res) => {
  const subjectID = req.br2k.subject.id;
  const subjectIndex = req.br2k.subject.index;
  const entryIndex = req.br2k.entryIndex;
});
```

<br>

# :turtle: Dependencies

nodejs: v14.15.3

npm: 7.10.0

etcd: v3.2

core npm modules:

- express: 4.17.1
- web3: 1.3.6 //ethereum client
- caver-js: 1.5.0 //klaytn client
- etcd3: 1.0.1
