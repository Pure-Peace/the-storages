/* eslint-disable no-unused-vars */
class Storage {
  create (type, options) {
    const types = {
      localStorage,
      sessionStorage
    }
    if (!types[type]) {
      throw new TypeError(`type must be localStorage or sessionStorage, not ${type}`)
    }
    return this._init(types[type], type, options)
  }

  _init (storage, type, options = {
    patchOrigin: true
  }) {
    // funcs
    const _typeCheck = this._typeCheck
    const _stringify = this._stringify
    const _parse = this._parse
    const _notNull = this._notNull
    const _wrapper = function (funcName) {
      return (...args) => Promise.resolve().then(() => {
        return storage[funcName](...args)
      })
    }

    // original functions
    const getItem = storage.getItem
    const setItem = storage.setItem
    const clearStorage = storage.clear
    const removeItem = storage.removeItem

    // patch the origin storage object? (default: true)
    if (!options.patchOrigin) storage = Object.assign({}, storage)

    // deep copy prototype of storage
    const _storage = Object.create(Object.getPrototypeOf(storage))
    _storage._type = type
    _storage._isStorage = true

    // active event
    _storage._event = function (type, data) {
      if (typeof (this.active[type.split('_')[1]]) === 'function') {
        window.dispatchEvent(Object.assign(
          new Event(type), { ...data, storageArea: storage, url: window.location.href }
        ))
      }
    }

    // rewrite functions of prototype
    _storage.getItem = function (key, parse = true) {
      _typeCheck(key)
      const originVal = getItem.call(this, key)
      const value = parse ? _parse(originVal) : originVal
      this._event(`${type}_get`, {
        key, newValue: value, oldValue: value
      })
      return value
    }

    _storage.setItem = function (key, value) {
      _typeCheck(key)
      const oldValue = _parse(getItem.call(this, key))
      setItem.call(this, key, _stringify(value))
      this._event(`${type}_set`, {
        key, newValue: value, oldValue
      })
      return value
    }

    _storage.removeItem = function (key) {
      _typeCheck(key)
      const oldValue = getItem.call(this, key)
      removeItem.call(this, key)
      this._event(`${type}_remove`, {
        key, newValue: null, oldValue
      })
    }

    _storage.clear = function () {
      clearStorage.call(this)
      this._event(`${type}_clear`, {
        key: null, newValue: null, oldValue: null
      })
    }

    _storage.pop = function (key, parse = true) {
      _typeCheck(key)
      const originVal = getItem.call(this, key)
      const oldValue = parse ? _parse(originVal) : originVal
      removeItem.call(this, key)
      this._event(`${type}_pop`, {
        key, newValue: null, oldValue
      })
      return oldValue
    }

    _storage.setChain = function (keyChain, value) {
      _typeCheck(keyChain, ['string'])

      const keys = keyChain.trim().split('.')
      const first = keys.shift()
      const last = keys.slice(-1)[0]

      let obj = _parse(getItem.call(this, first))
      if (!obj || typeof obj !== 'object') obj = {}

      // generate object with recursion
      const _generateObj = (object, keys) => {
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
      return this.set(first, _generateObj(obj, keys))
    }

    _storage.getChain = function (keyChain) {
      _typeCheck(keyChain, ['string'])
      const keys = keyChain.trim().split('.')
      const first = keys.shift()
      const last = keys.slice(-1)[0]
      let obj = _parse(getItem.call(this, first))
      keys.forEach(key => {
        if (key !== last) obj = obj[key]
      })
      return obj[last]
    }

    // add function shorthands
    _storage.get = _storage.getItem
    _storage.set = _storage.setItem
    _storage.remove = _storage.removeItem

    // async functions
    _storage.setAsync = _wrapper('set')
    _storage.getAsync = _wrapper('get')
    _storage.removeAsync = _wrapper('remove')
    _storage.clearAsync = _wrapper('clear')
    _storage.popAsync = _wrapper('pop')

    // valid events
    _storage._activeEvents = Object.freeze(['get', 'set', 'remove', 'pop', 'clear'])
    _storage._passiveEvents = Object.freeze(['set', 'remove', 'clear'])

    // triggers
    _storage.active = Object.seal(this._createObject(_storage._activeEvents))
    _storage.passive = Object.seal(this._createObject(_storage._passiveEvents))

    // watch
    _storage.watch = function (triggerType, eventType, handler) {
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

      _storage[triggerType][eventType] = handler
    }

    // unwatch
    _storage.unwatch = function (triggerType, eventType) {
      this[triggerType][eventType] = null
    }

    // watch / unwatch shorthands
    _storage.watchActive = (eventType, handler) => _storage.watch('active', eventType, handler)
    _storage.watchPassive = (eventType, handler) => _storage.watch('passive', eventType, handler)
    _storage.unwatchActive = eventType => _storage.unwatch('active', eventType)
    _storage.unwatchPassive = eventType => _storage.unwatch('passive', eventType)

    // add ACTIVE (only valid for the current page) listeners & handlers
    for (const [eventType, handler] of Object.entries({
      GetItem: e => _storage.active.get && _storage.active.get(e),
      SetItem: e => _storage.active.set && _storage.active.set(e),
      PopItem: e => _storage.active.pop && _storage.active.pop(e),
      Clear: e => _storage.active.clear && _storage.active.clear(e),
      RemoveItem: e => _storage.active.remove && _storage.active.remove(e)
    })) {
      window.removeEventListener(`${type}${eventType}`, handler)
      window.addEventListener(`${type}${eventType}`, handler)
    }

    // add PASSIVE (only triggered by other pages) listeners & handlers
    // only localStorage can trigger storage event, because the sessionStorage is separate
    if (type === 'localStorage') {
      const storageEventHandler = (e) => {
        const parse = (storageEvent, ...props) => props.forEach(
          prop => Object.defineProperty(
            storageEvent, prop, { value: _parse(storageEvent[prop]) }
          ))

        if ([e.key, e.newValue, e.oldValue].every(i => i === null)) {
          // on clear
          _storage.passive.clear && _storage.passive.clear(e)
        } else if (e.key !== null && e.newValue !== null) {
          // on set
          parse(e, 'newValue', 'oldValue')
          _storage.passive.set && _storage.passive.set(e)
        } else if (e.key !== null && e.newValue === null) {
          // on remove
          parse(e, 'newValue', 'oldValue')
          _storage.passive.remove && _storage.passive.remove(e)
        }
      }

      window.removeEventListener('storage', storageEventHandler)
      window.addEventListener('storage', storageEventHandler)
    }

    // bind storage
    Object.keys(_storage).forEach(key => {
      const property = _storage[key]
      if (typeof property === 'function') _storage[key] = property.bind(storage)
    })

    // set prototype of storage
    Object.setPrototypeOf(storage, _storage)

    const chainObject = (obj, _key, keyChain = '') => {
      if (_key) keyChain += `${keyChain && '.'}${_key}`
      const bind = Object.defineProperty(obj && typeof obj !== 'object' ? { _value: obj } : obj, '_key', { value: keyChain })

      return new Proxy(bind, {
        get: (target, key) => {
          // get val
          const value = target[key]

          // constants
          const IS_STR = typeof value === 'string'
          const KEY_EXISTS = _notNull(value)
          const IS_STORAGE = Object.keys(target).includes(key)

          // switch handle
          if (KEY_EXISTS && IS_STR && IS_STORAGE) {
            return chainObject(target.get(key), key, keyChain)
          } else if (KEY_EXISTS && !IS_STR) {
            return chainObject(value, key, keyChain)
          } else if (!KEY_EXISTS) {
            return chainObject({}, key, keyChain)
          }
        },
        set: (target, key, value) => {
          storage.setChain(`${target._key}.${key}`, value)
        }
      })
    }

    return new Proxy(storage, {
      get: (target, key) => {
        // get val
        const value = target[key]

        // constants
        const IS_STR = typeof value === 'string'
        const KEY_EXISTS = _notNull(value)
        const IS_STORAGE = Object.keys(target).includes(key)

        // switch handle
        if (KEY_EXISTS && IS_STR && IS_STORAGE) {
          return chainObject(target.get(key), key)
        } else if (KEY_EXISTS && !IS_STR) {
          return value
        } else if (!KEY_EXISTS) {
          return chainObject({}, key)
        }
      },
      set: (target, key, value) => {
        console.log(key, value)
        target.set(key, value)
      }
    })
  }

  _notNull (val) {
    return ![undefined, null, NaN].includes(val)
  }

  _createObject (list) {
    return list.reduce((acc, key) => {
      acc[key] = null
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
