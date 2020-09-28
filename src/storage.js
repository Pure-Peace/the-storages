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
        patchOrigin: true,
        strict: false
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
      _createObject
    } = this

    // original functions
    const {
      getItem,
      setItem,
      clear,
      removeItem
    } = storage

    // patch the origin storage object? (default: true)
    if (!options.patchOrigin) storage = Object.assign({}, storage)

    // deep copy prototype of storage
    const _storage = Object.create(Object.getPrototypeOf(storage))

    // set some props
    _storage._options = options
    _storage._type = type
    _storage._isStorage = true

    // prototype methods
    const methods = {
      // dispatch ACTIVE event
      _event (type, data) {
        if (typeof (this._active[type.split('_')[1]]) === 'function') {
          window.dispatchEvent(Object.assign(
            new Event(type), { ...data, storageArea: storage, url: window.location.href }
          ))
        }
      },

      // rewrite functions of prototype
      getItem (key, parse = true) {
        _typeCheck(key)
        const originVal = getItem.call(this, key)
        const value = parse ? _parse(originVal) : originVal
        this._event(`${type}_get`, {
          key, newValue: value, oldValue: value
        })
        return value
      },

      setItem (key, value) {
        _typeCheck(key)
        const oldValue = _parse(getItem.call(this, key))
        setItem.call(this, key, _stringify(value))
        this._event(`${type}_set`, {
          key, newValue: value, oldValue
        })
        return value
      },

      removeItem  (key) {
        _typeCheck(key)
        const oldValue = getItem.call(this, key)
        removeItem.call(this, key)
        this._event(`${type}_remove`, {
          key, newValue: null, oldValue
        })
      },

      clear () {
        clear.call(this)
        this._event(`${type}_clear`, {
          key: null, newValue: null, oldValue: null
        })
      },

      pop  (key, parse = true) {
        _typeCheck(key)
        const originVal = getItem.call(this, key)
        const oldValue = parse ? _parse(originVal) : originVal
        removeItem.call(this, key)
        this._event(`${type}_pop`, {
          key, newValue: null, oldValue
        })
        return oldValue
      },

      setChain (keyChain, value) {
        _typeCheck(keyChain, ['string'])
        const keys = keyChain.trim().split('.')
        const first = keys.shift()

        let obj = _parse(getItem.call(this, first))
        if (!obj || typeof obj !== 'object') obj = {}

        return this.set(first, _recursionObject(obj, keys))
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
        this[triggerType][eventType] = handler
      },

      // remove event watcher
      unwatch (triggerType, eventType) {
        this[triggerType][eventType] = null
      }

    }

    // function shorthands
    const shorthands = {
      get: methods.getItem,
      set: methods.setItem,
      remove: methods.removeItem,
      watchActive: (eventType, handler) => methods.watch('active', eventType, handler),
      watchPassive: (eventType, handler) => methods.watch('passive', eventType, handler),
      unwatchActive: eventType => methods.unwatch('active', eventType),
      unwatchPassive: eventType => methods.unwatch('passive', eventType)
    }

    const vaildEvents = {
      _activeEvents: Object.freeze(['get', 'set', 'remove', 'pop', 'clear']),
      _passiveEvents: Object.freeze(['set', 'remove', 'clear'])
    }

    const triggers = {
      active: Object.seal(_createObject(vaildEvents._activeEvents)),
      passive: Object.seal(_createObject(vaildEvents._passiveEvents))
    }

    // set methods
    Object.assign(_storage, methods, shorthands, vaildEvents, vaildEvents, triggers)

    // functions sync to async
    const asyncPrefix = ''
    const asyncSuffix = 'Async'
    const asyncFuncs = ['set', 'get', 'remove', 'clear', 'pop', 'getChain', 'setChain']
    asyncFuncs.forEach(funcKey => {
      _storage[`${asyncPrefix}${funcKey}${asyncSuffix}`] = _asyncWrapper(_storage[funcKey].bind(storage))
    })

    // ACTIVE event handlers
    const _handle = (e, eventKey) => {
      const method = _storage._active[eventKey]
      return typeof method === 'function' ? method(e) : method
    }
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
        const parse = (storageEvent, ...props) => props.forEach(
          prop => Object.defineProperty(storageEvent, prop, { value: _parse(storageEvent[prop]) })
        )

        if ([e.key, e.newValue, e.oldValue].every(i => i === null)) {
          // on clear

          _storage._passive.clear && _storage._passive.clear(e)
        } else if (e.key !== null && e.newValue !== null) {
          // on set

          parse(e, 'newValue', 'oldValue')
          _storage._passive.set && _storage._passive.set(e)
        } else if (e.key !== null && e.newValue === null) {
          // on remove

          parse(e, 'newValue', 'oldValue')
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

    // chain call (Recursive method)
    // the effective position is [after the first] recursive call of the storage: storage.b.[c.d.e.f]
    const chainObject = (obj, _key, keyChain = '') => {
      if (_key) keyChain += `${keyChain && '.'}${_key}`
      return new Proxy(typeof obj === 'object' ? obj : { _value: obj }, {
        get: (target, key) => {
          // prototypes
          const prototypes = {
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
            return _storage._options.strict ? value : chainObject(value, key, keyChain)
          } else if (KEY_EXISTS && !REAL_RESULT) {
            return chainObject(value, key, keyChain)
          } else if (!KEY_EXISTS) {
            // value is null
            return chainObject({}, key, keyChain)
          }
        },
        set: (target, key, value) => {
          storage.setChain(`${keyChain}.${key}`, value)
        }
      })
    }

    // storage entrance proxy
    // // the effective position is [the first] recursive call of the storage: storage.[b].c.d.e.f
    return new Proxy(storage, {
      get: (target, key) => {
        // get val
        const value = target[key]
        // constants
        const REAL_RESULT = ['string', 'number'].includes(typeof value)
        const KEY_EXISTS = _notNull(value)
        // switch handle
        if (KEY_EXISTS && REAL_RESULT) {
          // value not null and value is a string
          return chainObject(target.get(key), key)
        } else if (KEY_EXISTS && !REAL_RESULT) {
          // value not null and value not a string
          return value
        } else if (!KEY_EXISTS) {
          // value is null
          return chainObject({}, key)
        }
      },
      set: (target, key, value) => {
        target.set(key, value)
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

  // Array to object
  _createObject (list, value = null) {
    return list.reduce((acc, key) => {
      acc[key] = value
      return acc
    }, {})
  }

  _typeCheck (key, types = ['number', 'string']) {
    if (key && !types.includes(typeof key)) {
      throw new Error('key type must be number or string')
    }
  }

  _stringify (value) {
    if (typeof value === 'string') { return value }
    try {
      return JSON.stringify(value)
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
