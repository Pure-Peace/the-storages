# the-storages
### Enhanced, Support data binding localStorage and sessionStorage.

provide various api (async/sync methods) and storage event listeners.

In addition to supporting general use, support for vue data binding and even multi-page data binding and sync.


### Description
- Multi-page data binding and sync.

- Provide storage change event listeners.

- Various calling methods.

- Automatic JSON parsing.

- Mainly written using es6 and proxy. 


## Simple Demos:

You can open multiple pages at the same time and experience data binding between multiple pages

- #### [the-storages in Vue.js 3](http://miya.ink/the-storages/index.html)

- #### [the-storages in Vue.js 2](http://miya.ink/the-storages/vue2.html)

- #### [the-storages in Vue.js 2 zh](http://miya.ink/the-storages/vue2_zh.html)


## Usage:

### Import:
```javascript
// npm i the-storages
import { createLocal, createSession } from 'the-storages'

const mirror = createLocal() // create localStorage; createSession is sessionStorage
const storage = mirror._prx 

console.log(storage, mirror)
storage.set('hello', 'world')
console.log(storage, mirror)

```

### Vue-Cli: vue-the-storages (in progress...)

### Vue (common):

See [index.html](https://github.com/Pure-Peace/the-storages/blob/master/index.html) for details (vue3).
[vue2.html](https://github.com/Pure-Peace/the-storages/blob/master/vue2.html),
[vue2_zh.html](https://github.com/Pure-Peace/the-storages/blob/master/vue2_zh.html)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <!-- storages test page for vue2 -->
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="ie=edge">
  <title>the-storages | vue2</title>
  <script src="https://unpkg.com/vue"></script>
</head>

<body>
  <div id="app">
    <h1>the-storage | vue2</h1>
    <div>storageData (storage mirror object): {{ storageData }}</div>
    <div>storageProxyObj (storage proxy object): {{ storageProxyObj }}</div>
    <div>
      <button @click="test">click me, set a message</button>
    </div>
  </div>
  
  <script>
  import { createLocal, createSession, createStorage } from 'the-storages'

  // create storage mirror object (localStorage)
  // mirror object used for data binding, get data
  const mirror = createLocal() 

  // storage proxy object (enhanced storage)
  // used to operate storage
  const storage = mirror._prx 

  new Vue({
    el: '#app',
    data() {
      return {
        // the mirror object can make the data update automatically
        // so it's more suitable for obtaining storage data
        storageData: mirror,

        // the storage proxy object has all the methods and features 
        // (but it is not recommended to put it directly into the view)
        // so it's more suitable for storage operation
        storage: storage
      }
    },
    created() {
      // ensure that the storage data on the view can be updated automatically
      this.storage.bindVm(this)
    
      console.log(this.storageData)
      this.storage.set('hello', 'firstData')
      console.log(this.storageData)
    },
    methods: {
      test () {
        this.storage.set('foo', { bar: 1 })
      }
    }
  })

  </script>
</body>

</html>
```

### Samples:
```javascript
// set data to localStorage
storage.set('test', { message: 'im an object' }) // set a object
storage.setItem('test2', 'hello2') // set a string
storage.test3 = { hello111: 'im an object too' } // set a object

// set multiple data to localStorage
storage.set(['a','b','c'], [1,2,'g']) // parameter [keys ... ]:[values... ]
storage.set({a: 1, b: 2, c: 'g'}) // { key1: value1, key2: value2 ... }

// set data to localStorage, recursive creation
storage.a.b.c.d.e = 'test' 
storage.setChain('aa.bb.cc.dd', 'testChain')

// each sync method has a sync copy method
storage.setAsync('async foo', 'bar').then(res => { console.log('set async complete') })
storage.setChainAsync('gg.ee.rr', 'haha').then(res => { console.log('set asyncChain complete') })


// get data from localStorage
storage.get('test') // will get object

console.log(storage.test) // the same
storage.getItem('test') // the same
localStorage.getItem('test') // the same

storage.get('test', false) // will get json string

// get multiple results
storage.get(['test', 'test2', 'test3']) // will get object { key1: value1, key2: value2 ... }

// recursive acquisition
storage.getChain('a.b.c.d.e')
storage.a.b.c.d.e

// each sync method has a sync copy method
storage.getAsync('test').then(res => { console.log(res) })

// remove key from localStorage
storage.remove('test') // none return
storage.remove('test', true) // will return test's value
storage.pop('test') // the same

// watchers
// active: events triggered by the current page
storage.watchActive('get', e => { console.log(e) })

// passive: events triggered by the other page
storage.watchPassive('set', e => { console.log(e) })

// valid events
console.log(storage._activeEvents) // active events
console.log(storage._passiveEvents) // passive events

// unwatch
storage.unwatchActive('get')
storage.unwatchPassive('get')
```

## Docs:

    Some docs here...

```javascript
import { createLocal, createSession, Storage } from 'the-storages'

const mirror = createLocal() // create localStorage; createSession is sessionStorage
const storage = mirror._prx  // storage proxy
```

- ### createLocal
    > create enhanced localStorage <br>
    > only localstorage supports multi-page data binding
    ```javascript
    createLocal(options)
    ```
    ##### options: Object
    > Default options
    ```javascript
    {
        vueModule: null,
        strict: true,
        mirrorOperation: false,
        updateMirror: true
    }
    ```

- ### createSession
    > create enhanced sessionStorage
    > Since the session of each page is independent, multi-page data binding is not supported
    ```javascript
    createSession(options)
    ```
    ##### options: Object
    > Default options: same


## storage (proxy) object methods

- ### getItem
    > get item from storage
    ```javascript
    storage.getItem(key, parse = true)
    ```
    ##### key: String, Array
    > if key is an Array, get multiple, return object.
    ##### parse: Boolean
    > if parse, try to return JSON.parse(result)


- ### get
    > Shorthand method name for getItem
    ```javascript
    storage.get(key, parse = true)
    ```


- ### getAsync
    > Asynchronous method of getItem
    ```javascript
    storage.getAsync(...args).then(res => {})
    ```


- ### setItem
    > set item from storage
    ```javascript
    storage.setItem(key, value)
    ```
    ##### key: String, Array, Object
    > If both key and value are array types, set multiple. [...keys] -> [...values] <br>
    > If key is an Object, set multiple. { key1: value1, key2: value2 }
    ##### value: Any
    > The value will fix with JSON.stringify


- ### set
    > Shorthand method name for setItem
    ```javascript
    storage.set(key, value)
    ```

- ### setAsync
    > Asynchronous method of setItem
    ```javascript
    storage.setAsync(...args).then(res => {})
    ```


- ### removeItem
    > remove item from storage
    ```javascript
    storage.removeItem(key, pop = false)
    ```
    ##### key: String, Array
    > If key is an Array, remove multiple keys.
    ##### pop: Boolean
    > If pop, removeItem will return the deleted value


- ### remove
    > Shorthand method name for removeItem
    ```javascript
    storage.remove(key, pop = false)
    ```

- ### removeAsync
    > Asynchronous method of removeItem
    ```javascript
    storage.removeAsync(...args).then(res => {})
    ```


- ### clear
    > clear the storage
    ```javascript
    storage.clear()
    ```

- ### clearAsync
    > Asynchronous method of clear
    ```javascript
    storage.clearAsync().then(res => {})
    ```


- ### setChain
    > Set storage data recursively, try not to overwrite the attributes on the chain.
    ```javascript
    storage.setChain(keyChain, value)
    ```
    ##### keyChain: String
    > sample: storage.setChain('a.b.c.d.e', 1) == (storage.a.b.c.d.e = 1)
    ##### value: Any
    > Value will be set on the last object of keyChain


- ### setChainAsync
    > Asynchronous method of setChain
    ```javascript
    storage.setChainAsync(...args).then(res => {})
    ```


- ### getChain
    > Get storage data recursively, will get the value of the last object on keyChain.
    ```javascript
    storage.setChain(keyChain, value)
    ```
    ##### key: String
    > sample: storage.getChain('a.b.c.d.e') == storage.a.b.c.d.e

    - ### setChainAsync
    > Asynchronous method of getChain
    ```javascript
    storage.getChainAsync(...args).then(res => {})
    ```


- ### watch
    > Add a listener for the specified type of storage change event
    ```javascript
    storage.watch(triggerType, eventType, handler)
    ```
    ##### triggerType: String
    > Must be 'active' or 'passive'. <br>
    > active: events triggered by the current page <br>
    > passive: events triggered by the other page
    ##### eventType: String
    > Add handler function for specified event. <br>
    > active: must in ["get", "set", "remove", "pop", "clear"] <br>
    > passive: must in ["set", "remove", "clear"]
    ##### handler: Function
    > Handler will receives a parameter: event


- ### watchActive
    > Asynchronous method of watch, triggerType is 'active'
    ```javascript
    storage.watchActive(eventType, handler)
    ```

- ### watchPassive
    > Asynchronous method of watch, triggerType is 'passive'
    ```javascript
    storage.watchPassive(eventType, handler)
    ```


- ### unwatch
    > Remove listener for the specified type of storage change event
    ```javascript
    storage.unwatch(triggerType, eventType)
    ```
    ##### triggerType: String
    > Must be 'active' or 'passive'. <br>
    > active: events triggered by the current page <br>
    > passive: events triggered by the other page
    ##### eventType: String
    > Remove listener for specified event. <br>
    > active: must in ["get", "set", "remove", "pop", "clear"] <br>
    > passive: must in ["set", "remove", "clear"]


- ### unwatchActive
    > Asynchronous method of unwatch, triggerType is 'active'
    ```javascript
    storage.unwatchActive(eventType)
    ```


- ### watchPassive
    > Asynchronous method of unwatch, triggerType is 'passive'
    ```javascript
    storage.unwatchPassive(eventType)
    ```


- ### bindVm
    > Binding the Vue module (instance) object to ensure that the Vue view can be updated.
    ```javascript
    storage.bindVm(vueModule)
    ```
    ##### vueModule: Vue instance
    > Equivalent to "this" in the vue instance. <br>
    > Please call this function to bind "this" when the page is initialized.



- ### toString
    > return storage data as JSON string
    ```javascript
    storage.toString()
    ```


- ### _data
    > return storage data as Object
    ```javascript
    storage._data()
    ```


## Storage constructor methods
```javascript
const _Storage = new Storage()
```

- ### create
    > create and return an enhanced storage mirror object. <br>
    ```javascript
    _Storage.create(type, options)
    ```
    ##### type: String
    > must be 'localStorage' or 'sessionStorage'.
    ##### options: Object
    > Please see the default options of createLocal


- ### _asyncWrapper
    > Convert sync functions to async functions and return
    ```javascript
    _Storage._asyncWrapper(func)
    ```
    ##### func: Function
    > sync functions


- ### _createObject
    > Create Object through Array
    ```javascript
    _Storage._asyncWrapper(list, defaultValue = null))
    ```
    ##### list: Array
    > keys Array
    ##### defaultValue: any
    > every key's value


- ### _notNull
    > is val === null || undefined || nan ?
    ```javascript
    _Storage._notNull(val)
    ```
    ##### val: any


- ### _parse
    > Try to parse the JSON string (return the original value if it fails)
    ```javascript
    _Storage._parse(value)
    ```
    ##### value: any


- ### _stringify
    > Try to stringify the value (return the original value if it fails)
    ```javascript
    _Storage._stringify(value)
    ```
    ##### value: any


- ### _zip
    > Compress two Arrays into an object corresponding to a key value
    ```javascript
    _Storage._zip(array1, array2)
    ```
    ##### array1: Array
    > keys Array
    ##### array2: Array
    > values Array

## Development / test

You are willing to help me improve this project. Or you need to do some testing.

#### 1. Clone this repository
```
git clone https://github.com/Pure-Peace/the-storages
```

#### 2. Installation dependencies
```
npm i
```

#### 3. Start
```
npm run dev
```

#### 4. Open the test page (Default port is 8080)

I provide two sample pages: vue.js 3 and vue.js 2 (CDN unpkg.com)

You can open two pages to experience multi-page data binding and data synchronization.

##### vue.js 3
```
http://localhost:8080
```

##### vue.js 2
```
http://localhost:8080/vue2
```

##### vue.js 2 中文版页面
```
http://localhost:8080/vue2_zh
```


### Snowpack
It is recommended to use snowpack to run or build (instead of webpack with babel, beacuse snowpack natively supports es6, and faster)


## MIT
