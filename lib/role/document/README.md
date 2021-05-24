# Role class

BR2K 서비스의 모든 역할(role)에 대한 부모 클래스

# Leader class

# Follower class

## member variable

| member             |                 type                 | desc                                                                                                             |
| :----------------- | :----------------------------------: | :--------------------------------------------------------------------------------------------------------------- |
| ssi                |                number                | BR2K 기법에서 service state index                                                                                |
| lpi                |                number                | BR2K 기법에서 latest processed index                                                                             |
| logSize            |                number                | BR2K 기법에서 Log Size                                                                                           |
| scvID              |                string                | BR2K 기법에서 각 서비스 아이디 (연결된 ETCD의 name에 의하여 결정됨)                                              |
| myLPIkey           |                string                | BR2K 기법에서 각 서비스가 ETCD에 저장된 자신의 LPI의 값을 업데이트하기 위한 키 값 (latest_processed_index/scvID) |
| reqPool            |                 Map                  | 리더가 사용자 요청을 복제하기 전에 보류 중인 사용자 요청들의 풀                                                  |
| resPool            |                 Map                  | 리더가 사용자 요청을 복제하기 전에 보류 중인 사용자 요청의 응답들의 풀                                           |
| storeQ             |      function-queue(npm-module)      | 사용자 요청들을 순차적으로 ETCD에서 복제하기 위한 함수 큐                                                        |
| processQ           |      function-queue(npm-module)      | ETCD에서 복제된 사용자 요청들을 순차적으로 처리하기 위한 큐                                                      |
| putETCDClient      |          etcd3(npm-module)           | 사용자 요청을 ETCD에 저장할때 사용하는 ETCD 클라이언트                                                           |
| etcdClient         |          etcd3(npm-module)           | ETCD에 저장된 사용자 요청을 처리할때 사용하는 ETCD 클라이언트                                                    |
| backupManager      |     object(/lib/backup_manager)      | BR2K 서비스에서 클린업 작업에서 상태와 ETCD의 스냅샷을 백업 지정된 스토리지에 백업할 때 사용하는 클라이언트 모듈 |
| loopingLatestState | number (return value of setInterval) | 리더가 클린업 작업 조건이 성립하는지 주기적으로 체크하는 인스턴스의 아이디 값                                    |

## Documentation

First, require the package

```lua
local class = require 'class'
```

Note that `class` does not clutter the global namespace.

Class metatables are then created with `class(name)` or equivalently `class.new(name)`.

```lua
local A = class('A')
local B = class('B', 'A') -- B inherit from A
```

You then have to fill-up the returned metatable with methods.

```lua
function A:myMethod()
  -- do something
end
```

There are two special methods: `new()`, which already exists when the class is created and _should not be overrided_
and `__init()` which is called by `new()` at the creation of the class.

```lua
function A:__init(args)
  -- do something with args
  -- note that self exists
end
```

Creation of an instance is then achieved with the `new()` function or (equivalently) using the Lua `__call` metamethod:

```lua
local a = A('blah blah') -- an instance of A
local aa = A.new('blah blah') -- equivalent of the above
```

### `class.new(name[, parentname])`

Creates a new class called `name`, which might optionally inherit from `parentname`.
Returns a table, in which methods should be defined.

Note that the returned table is not the metatable, but a _constructor_ table (with a `__call`
function defined). In that respect, one can use the following shorthand:

```lua
local A = class.new('A')
local a = A.new() -- instance.
local aa = A()    -- another instance (shorthand).
```

There is also a shorthand`class.new()`, which is `class()`.

### `class.factory(name)`

Return a new (empty) instance of the class `name`. No `__init` method will be called.

### `class.metatable(name)`

Return the metatable (i.e. the table containing all methods) related to class `name`.

### `class.type(obj)`

Return the type of the object `obj` (if this is a known class), or the type
returned by the standard lua `type()` function (if it is not known).

### `class.istype(obj, name)`

Check is `obj` is an instance (or a child) of class `name`. Returns a boolean.
