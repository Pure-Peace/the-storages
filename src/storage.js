import stringify from 'fast-json-stable-stringify'

class Storage {
  create (type, options) {
    const types = {
      localStorage,
      sessionStorage
    }
    if (!types[type]) {
      throw new TypeError(`type must be localStorage or sessionStorage, not ${type}`)
    }
    return this._init(types[type], type,
      Object.assign({
        vueModule: null,
        strict: true,
        mirrorOperation: false,
        updateMirror: true
      },
      options || this._options || {})
    )
  }

  _init (storage, type, options) {
    // funcs
    const {
      _typeCheck,
      _stringify,
      _parse,
      _notNull,
      _recursionObject,
      _asyncWrapper,
      _createObject,
      _zip
    } = this

    // original functions
    const {
      getItem,
      setItem,
      clear,
      removeItem
    } = storage

    // deep copy prototype of storage
    const _storage = Object.create(Object.getPrototypeOf(storage))

    // set some props
    _storage._options = options
    _storage._type = type
    _storage._isStorage = true

    // storage object data
    const _data = () => Object.keys(storage).reduce((acc, key) => {
      acc[key] = _parse(storage[key])
      return acc
    }, {})

    // mirror object of storage
    const mirror = _data()

    // update the view
    const _update = (key, value) => {
      if (_storage._options.updateMirror === false) return

      const keyIsNull = !_notNull(key)
      const valueIsNull = !_notNull(value)
      const keyIsObject = key && key.constructor === Object

      const vueUpdate = () => {
        const vm = _storage._options.vueModule
        if (vm && vm.$forceUpdate) vm.$forceUpdate()
      }
      // update mirror
      if (keyIsNull) {
        // do clear
        Object.keys(mirror).forEach(_key => { delete mirror[_key] })
        // if new key and vm.$forceUpdate is valid, do update
      } else if (keyIsObject) {
        // do multiple set
        Object.keys(key).forEach(_key => { mirror[_key] = key[_key] })
      } else if (valueIsNull) {
        if (key.constructor === Array) {
          // do multiple remove
          key.forEach(_key => { delete mirror[_key] })
        } else {
          // do remove
          delete mirror[key]
        }
      } else {
        // do set
        mirror[key] = value
        // if new key and vm.$forceUpdate is valid, do update
      }
      vueUpdate()
    }

    // create proxy
    const _createProxy = (storageObject) => {
      // chain call (Recursive method)
      // the effective position is [after the first] recursive call of the storage: storage.b.[c.d.e.f]
      const chainObject = (obj, _key, keyChain = '') => {
        if (typeof _key === 'symbol') return // for vue3

        if (_key) keyChain += `${keyChain && '.'}${_key}`
        return new Proxy(obj && typeof obj === 'object' ? obj : { _value: obj }, {
          get: (target, key) => {
            // prototypes
            const prototypes = {
              __v_isRef: false,
              __v_isReadonly: false,
              _value: obj,
              _key: keyChain,
              _type: 'proxy'
            }
            if (key in prototypes) return prototypes[key]

            // get val
            const value = target[key]
            // constants
            const REAL_RESULT = ['string', 'number'].includes(typeof value)
            const KEY_EXISTS = _notNull(value)
            // switch handle
            if (KEY_EXISTS && REAL_RESULT) {
              return _storage._options.strict ? _parse(value) : chainObject(value, key, keyChain)
            } else if (KEY_EXISTS && !REAL_RESULT) {
              return chainObject(value, key, keyChain)
            } else if (!KEY_EXISTS) {
            // value is null
              return chainObject({}, key, keyChain)
            }
          },
          set: (target, key, value) => {
            storageObject.setChain(`${keyChain}.${key}`, value)
            return value
          }
        })
      }

      // storage entrance proxy
      // // the effective position is [the first] recursive call of the storage: storage.[b].c.d.e.f
      return new Proxy(storageObject, {
        get: (target, key) => {
          if (typeof key === 'symbol') return // for vue3
          // prototypes
          const prototypes = {
            __v_isRef: false,
            __v_isReadonly: false,
            _type: 'proxy',
            _: storageObject,
            _mirror: mirror,
            _interfaces: Object.keys(_storage)
          }
          if (key in prototypes) return prototypes[key]

          // get val
          const value = target[key]
          // constants
          const isResult = ['string', 'number'].includes(typeof value)
          const keyExists = _notNull(value)
          // switch handle
          if (!keyExists) {
            // value is null
            return chainObject({}, key)
          } else if (isResult) {
            // value not null and value is a string
            return _storage._options.strict ? _parse(value) : chainObject(target.get(key), key)
          } else if (!isResult) {
            // value not null and value not a result
            return _parse(value)
          }
        },
        set: (target, key, value) => {
          target.set(key, value)
          return value
        }
      })
    }

    // prototype methods
    const methods = {
      // rewrite functions of prototype ---------------------------------
      getItem (key, parse = true) {
        if (!key) return

        const getValue = (_key) => {
          const originVal = getItem.call(this, _key)
          return parse ? _parse(originVal) : originVal
        }
        const getEvent = (value) => this._event(`${type}_get`, {
          key, newValue: value, oldValue: value
        })
        // multple key handle
        if (key && key.constructor === Array) {
          const value = key.reduce((acc, _key) => {
            acc[_key] = getValue(_key)
            return acc
          }, {})
          getEvent(value)
          return value
        // single key handle
        } else if (_typeCheck(key)) {
          const value = getValue(key)
          getEvent(value)
          return value
        }
      },

      setItem (key, value, parse = false) {
        const keyIsObject = key && key.constructor === Object
        if (parse) value = _parse(value)
        if (!key || (!value && !keyIsObject)) return

        const getValue = (_key) => _parse(getItem.call(this, _key))
        const setValue = (_key, _value) => setItem.call(this, _key, _stringify(_value))
        const setEvent = (newValue, oldValue) => {
          _update(key, value)
          this._event(`${type}_set`, { key, newValue, oldValue })
        }
        const objectHandle = (object) => {
          const oldValue = Object.keys(object).reduce((acc, _key) => {
            acc[_key] = getValue(_key)
            setValue(_key, object[_key])
            return acc
          }, {})
          setEvent(object, oldValue)
          return object
        }
        // key is an object
        if (keyIsObject) {
          return objectHandle(key)
        } else if ((key && key.constructor === Array) && (value && value.constructor === Array)) {
          // key is a list, value must be a list too
          key = _zip(key, value)
          return objectHandle(key)
        } else if (_typeCheck(key)) {
          // single key and value
          const oldValue = _parse(getItem.call(this, key))
          setValue(key, value)
          setEvent(value, oldValue)
          return value
        }
      },

      removeItem  (key, pop = false) {
        if (!key) return

        const getValue = (_key) => _parse(getItem.call(this, _key))
        const remove = (_key) => removeItem.call(this, _key)
        const removeEvent = (oldValue) => {
          _update(key)
          this._event(`${type}_${pop ? 'pop' : 'remove'}`, { key, newValue: null, oldValue })
        }
        // multple key handle
        if (key && key.constructor === Array) {
          const oldValue = key.reduce((acc, _key) => {
            acc[_key] = getValue(_key)
            remove(_key)
            return acc
          }, {})
          removeEvent(oldValue)
          if (pop) return oldValue
        // single key handle
        } else if (_typeCheck(key)) {
          const oldValue = getValue(key)
          remove(key)
          removeEvent(oldValue)
          if (pop) return oldValue
        }
      },

      clear () {
        clear.call(this)
        _update()
        this._event(`${type}_clear`, {
          key: null, newValue: null, oldValue: null
        })
      },

      // extra methods ---------------------------------
      setChain (keyChain, value) {
        _typeCheck(keyChain, ['string'])
        const keys = keyChain.trim().split('.')
        const first = keys.shift()
        const last = keys.slice(-1)[0]

        let obj = _parse(getItem.call(this, first))
        if (!obj || typeof obj !== 'object') obj = {}

        return this.set(first, _recursionObject(obj, keys, last, value))
      },

      getChain  (keyChain) {
        _typeCheck(keyChain, ['string'])
        const keys = keyChain.trim().split('.')
        const first = keys.shift()
        const last = keys.slice(-1)[0]
        let obj = _parse(getItem.call(this, first))
        keys.forEach(key => {
          if (key !== last) obj = obj[key]
        })
        return obj[last]
      },

      // add event watcher
      watch (triggerType, eventType, handler) {
        const allowEvents = {
          active: this._activeEvents,
          passive: this._passiveEvents
        }
        if (!['active', 'passive'].includes(triggerType)) {
          throw new Error(`watch trigger type must be active or passive, not ${triggerType}`)
        }
        if (!allowEvents[triggerType].includes(eventType)) {
          throw new Error(`${triggerType} trigger allows the following events: ${allowEvents[triggerType]}, not ${eventType}`)
        }
        if (typeof handler !== 'function') {
          throw new TypeError(`watch handler must be a function, not ${typeof handler}`)
        }
        this[`_${triggerType}`][eventType] = handler
      },

      // remove event watcher
      unwatch (triggerType, eventType) {
        this[`_${triggerType}`][eventType] = null
      },

      // dispatch ACTIVE (current page trigger) event
      _event (type, data) {
        if (typeof this._active[type.split('_')[1]] === 'function') {
          window.dispatchEvent(
            Object.assign(new Event(type), { ...data, storageArea: storage, url: window.location.href })
          )
        }
      },

      // rewrite origin toString
      toString () {
        return _stringify(this)
      },

      // storage bind vueModule
      bindVm (vueModule) {
        if (vueModule && vueModule.$forceUpdate) {
          _storage._options.vueModule = vueModule
          return
        }
        console.error('[storage error] bindVm: The provided parameter is not a vue module')
      },

      // storage object data
      get _data () {
        return _data()
      }
    }

    // method shorthands
    const shorthands = {
      get: methods.getItem,
      set: methods.setItem,
      remove: methods.removeItem,
      getItems: (...keys) => storage.getItem(keys),
      pop: (key) => storage.removeItem(key, true),
      watchActive: (eventType, handler) => storage.watch('active', eventType, handler),
      watchPassive: (eventType, handler) => storage.watch('passive', eventType, handler),
      unwatchActive: eventType => storage.unwatch('active', eventType),
      unwatchPassive: eventType => storage.unwatch('passive', eventType)
    }

    // valid watcher event
    const vaildEvents = {
      _activeEvents: Object.freeze(['get', 'set', 'remove', 'pop', 'clear']),
      _passiveEvents: Object.freeze(['set', 'remove', 'clear'])
    }

    // watcher triggers
    const triggers = {
      _active: Object.seal(_createObject(vaildEvents._activeEvents)),
      _passive: Object.seal(_createObject(vaildEvents._passiveEvents))
    }

    // set methods to storage prototype
    Object.assign(_storage, methods, shorthands, vaildEvents, triggers)

    // some storage functions should: sync to async
    const asyncPrefix = ''
    const asyncSuffix = 'Async'
    const asyncFuncs = ['set', 'get', 'remove', 'clear', 'pop', 'getChain', 'setChain']
    asyncFuncs.forEach(funcKey => {
      _storage[`${asyncPrefix}${funcKey}${asyncSuffix}`] = _asyncWrapper(_storage[funcKey].bind(storage))
    })

    // ACTIVE event handle
    const _handle = (e, eventKey) => {
      const method = _storage._active[eventKey]
      return typeof method === 'function' ? method(e) : method
    }

    // ACTIVE event handlers
    const activeEventHandlers = {
      GetItem: e => _handle(e, 'get'),
      SetItem: e => _handle(e, 'set'),
      PopItem: e => _handle(e, 'pop'),
      Clear: e => _handle(e, 'clear'),
      RemoveItem: e => _handle(e, 'remove')
    }

    // add ACTIVE (only valid for the current page) listeners & handlers
    for (const [eventType, handler] of Object.entries(activeEventHandlers)) {
      window.removeEventListener(`${type}${eventType}`, handler)
      window.addEventListener(`${type}${eventType}`, handler)
    }

    // add PASSIVE (only triggered by other pages) listeners & handlers
    // only localStorage can trigger storage event, because the sessionStorage is separate
    if (type === 'localStorage') {
      const storageEventHandler = (e) => {
        // parse event data (newValue, oldValue)
        const parseEvent = (storageEvent, ...props) => props.forEach(
          prop => Object.defineProperty(storageEvent, prop, { value: _parse(storageEvent[prop]) })
        )
        if ([e.key, e.newValue, e.oldValue].every(i => i === null)) {
          // on clear ------
          _update()
          // watcher handle
          _storage._passive.clear && _storage._passive.clear(e)
        } else if (e.key !== null && e.newValue !== null) {
          // on set ------
          parseEvent(e, 'newValue', 'oldValue')
          // watcher handle
          _update(e.key, e.newValue)
          _storage._passive.set && _storage._passive.set(e)
        } else if (e.key !== null && e.newValue === null) {
          // on remove ------
          parseEvent(e, 'newValue', 'oldValue')
          // watcher handle
          _update(e.key)
          _storage._passive.remove && _storage._passive.remove(e)
        }
      }
      window.removeEventListener('storage', storageEventHandler)
      window.addEventListener('storage', storageEventHandler)
    }

    // bind all functions to storage object
    Object.keys(_storage).forEach(key => {
      const property = _storage[key]
      if (typeof property === 'function') _storage[key] = property.bind(storage)
    })

    // set prototype to storage
    Object.setPrototypeOf(storage, _storage)
    const proxyStorage = _createProxy(storage)

    // done
    return new Proxy(mirror, {
      get (target, key) {
        // prototypes
        const prototypes = {
          _storage: storage,
          _prx: proxyStorage,
          _interfaces: Object.keys(_storage)
        }
        if (key in prototypes) return prototypes[key]
        if (key in _storage) return proxyStorage[key]
        return target[key]
      },
      set (target, key, value) {
        if (!_storage._options.mirrorOperation) {
          // Not allowed to directly modify the mirror
          // because it must always be consistent with storage
          throw new Error('[storage] The mirror object should be read-only, you can use it for data binding, but should not be modified directly')
        }
        _storage.set(key, value)
      }
    })
  }

  // sync to async method
  _asyncWrapper (func) {
    return (...args) => Promise.resolve().then(() => {
      return func(...args)
    })
  }

  // generate object with recursion
  _recursionObject (object, keys, last, value) {
    const runner = (beforeObject, beforeKeys) => {
      if (beforeKeys.length === 0) return object
      const key = beforeKeys.shift()
      // last key will = value
      if (key === last) beforeObject[key] = value
      // not last key? only object
      else if (!beforeObject[key] || typeof beforeObject[key] !== 'object') beforeObject[key] = {}
      return runner(beforeObject[key], keys)
    }
    return runner(object, keys)
  }

  _notNull (val) {
    return ![undefined, null, NaN].includes(val)
  }

  _zip (array1, array2) {
    if ((array1 && array1.constructor !== Array) || (array1 && array2.constructor !== Array)) {
      throw new TypeError('all parameters must be array')
    } else if (array1.length !== array2.length) {
      throw new Error('the length of the two arrays must be equal')
    }

    return array1.reduce((acc, key, idx) => {
      acc[key] = array2[idx]
      return acc
    }, {})
  }

  // create default value object from an array
  _createObject (list, defaultValue = null) {
    return list.reduce((acc, key) => {
      acc[key] = defaultValue
      return acc
    }, {})
  }

  _typeCheck (key, types = ['number', 'string']) {
    if (key && !types.includes(typeof key)) {
      throw new TypeError(`key type must in ${types}`)
    }
    return true
  }

  _stringify (value) {
    if (typeof value === 'string') { return value }
    try {
      return stringify(value)
    } catch {
      return value
    }
  }

  _parse (value) {
    if (typeof value !== 'string') { return value }
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
}

export const createStorage = (type, options) => new Storage().create(type, options)
export const createSession = (options) => new Storage().create('sessionStorage', options)
export const createLocal = (options) => new Storage().create('localStorage', options)

export {
  Storage
}
