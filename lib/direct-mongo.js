'use strict'
// const joi = require('joi')
const config = require('../config')
const MongoClient = require('mongodb').MongoClient
const dbAuthUrl = config('DB_AUTH_URL')
const dbAuthName = config('DB_AUTH_NAME')
// var Promise = require('promise')

// Database Collection
const dbAuthCollectionName = config('DB_AUTH_COLLECTION')

function AuthIOK (authSettings) {
  console.log('authentication function is running...')
}

AuthIOK.prototype.reviewClient = async function (data, reject) {
  var self = this
  var error

  self.findClient(data, function (result) {
    console.log(result)
    let checkResult =
      result &&
      result.adapter &&
      result.secret &&
      result.secret.type &&
      result.secret.pwdhash &&
      result.name &&
      result.topics
    if (!checkResult) {
      error = {
        error: 'Request scheme is undifined.',
        code: '503'
      }
      console.log('Request scheme is undifined.')
      return reject(error)
    }

    if ('error' in result) {
      console.log('Error: ' + result.error)
      return reject(error)
    }

    if (result.adapter.indexOf('http') < 0 && result.adapter.indexOf('*') < 0) {
      console.log('HTTP is not permitted')
      error = {
        error: 'http is not permitted',
        code: '503'
      }
      return reject(error)
    }

    var hashedpassword
    if (result.secret.type.toString() === 'openid') {
      console.log('Passoword is OpenID')
      hashedpassword = data.token
    }

    if (result.name === data.name && result.secret.pwdhash === hashedpassword) {
      result.paraffinAuth = true
      console.log('Auth is Ok!')
      return reject(result)
    } else {
      error = {
        error: 'Name or Password is wrong.',
        code: '503'
      }
      console.log('Name or Password is wrong.')
      return reject(error)
    }
  })
}

/*
  Used when the device is sending credentials.
  mqtt.username must correspond to the device username in the Auth connection
  if mqtt.username is JWT, mqtt.password is hte JWT itself
  mqtt.password must correspond to the device password
*/
AuthIOK.prototype.authenticateMQTT = function () {
  var self = this
  console.log('authenticate with Credentials request!')
  return function (client, username, password, callback) {
    var data = {
      id: client.id, // {client-name}
      name: username,
      token: password.toString(),
      type: 'mqtt',
      grant_type: 'password',
      scope: 'openid profile'
    }

    self.findClient(data, function (result) {
      let checkResult =
        result &&
        result.adapter &&
        result.secret &&
        result.secret.type &&
        result.secret.pwdhash &&
        result.name &&
        result.topics
      if (!checkResult) {
        console.log('Request scheme is undifined.')
        return callback(null, false)
      }

      if ('error' in result) {
        console.log('Error: ' + result.error)
        return callback(result, false)
      }

      if (
        result.adapter.indexOf('mqtt') < 0 &&
        result.adapter.indexOf('*') < 0
      ) {
        console.log('MQTT is not permitted')
        var error = {
          error: 'mqtt is not permitted',
          code: '503'
        }
        return callback(error, false)
      }

      var hashedpassword
      if (result.secret.type.toString() === 'openid') {
        hashedpassword = password.toString()
      }

      if (result.name === 'JWT') {
        self.authenticationJWT(client, callback)
      } else if (
        result.name === username &&
        result.secret.pwdhash === hashedpassword
      ) {
        client.deviceProfile = result // profile attached to the client object
        console.log(client.deviceProfile)
        return callback(null, true)
      } else {
        console.log('Name or Password is wrong.')
        return callback(null, false)
      }
    })
  }
}

AuthIOK.prototype.authorizePublishMQTT = function () {
  return function (client, topic, payload, callback) {
    // var isOwner = topic.indexOf(client.deviceProfile.name) == 0 || topic.indexOf(client.deviceProfile.clientId) == 0
    var isValid =
      client.deviceProfile &&
      client.deviceProfile.topics &&
      client.deviceProfile.topics.indexOf(topic) > -1
    if (!isValid) console.log('Publish MQTT is not authorized')
    callback(null, isValid)
  }
}

AuthIOK.prototype.authorizeSubscribeMQTT = function () {
  return function (client, topic, callback) {
    // var isOwner = topic.indexOf(client.deviceProfile.name) == 0 || topic.indexOf(client.deviceProfile.clientId) == 0
    var isValid =
      client.deviceProfile &&
      client.deviceProfile.topics &&
      client.deviceProfile.topics.indexOf(topic) > -1
    if (!isValid) console.log('Subscribe MQTT is not authorized')
    callback(null, isValid)
  }
}

/**
 * @param {Object} req The incoming message @link https://github.com/mcollina/node-coap#incoming
 * @param {Function} callback The callback function. Has the following structure: callback(error, authenticated, subject)
 */
AuthIOK.prototype.authenticateHTTP = function () {
  var self = this

  return function (req, callback) {
    var url = req.url
    var tenantId = url.split('/')[2]
    // console.log('Tenant Id: ' + tenantId)

    var checkReq = req && req.url && req.headers && req.headers.authorization
    if (!checkReq) {
      console.log('Request scheme is undifined.')
      return callback(null, false)
    }

    if (req.headers.authorization.startsWith('Basic')) {
      console.log('HTTP Request is in Basic Authentication')

      // grab the encoded value
      var encoded = req.headers.authorization.split(' ')[1]
      // decode it using base64
      var decoded = Buffer.from(encoded, 'base64').toString()
      var name = decoded.split(':')[0]
      var password = decoded.split(':')[1]
      // console.log(name + ' and ' + password)
      // check if the passed username and password match with the values in database.
      // this is dummy validation.

      var data = {
        id: tenantId, // {client-name}
        name: name,
        token: password,
        type: 'http',
        grant_type: 'password',
        scope: 'openid profile'
      }

      console.log('$$$$$$$$$$$ data::')
      console.log(data)

      var result = self.reviewClient(data)
      console.log('########## result :::')
      console.log(result)

      if (result && result.paraffinAuth) {
        console.log('+++Passed to GET HTTP')
        req.deviceProfile = result // profile attached to the client object
        return callback(null, true, req)
      } else {
        console.log('Name or Password is wrong.')
        return callback(null, false)
      }
    }
  }
}

// Examples:
//   Error:             callback(error)
//   Authenticated:     callback(null, true, { username: 'someone' })
//   Not authenticated: callback(null, false)

/**
 * @param {Object} subject The subject returned by the authenticate function
 * @param {string} topic The topic
 * @param {Function} callback The callback function. Has the following structure: callback(error, authorized)
 */

AuthIOK.prototype.authorizeGetHTTP = function () {
  return function (subject, topic, callback) {
    console.log('*************************')
    console.log(subject)
    // var isOwner = topic.indexOf(subject.deviceProfile.name) == 0 || topic.indexOf(subject.deviceProfile.clientId) == 0
    var isValid =
      subject.deviceProfile &&
      subject.deviceProfile.topics &&
      subject.deviceProfile.topics.indexOf(topic) > -1
    if (!isValid) console.log('Get request is not permitted')
    callback(null, isValid)
  }
  // Examples:
  //   Error:          callback(error)
  //   Authorized:     callback(null, true)
  //   Not authorized: callback(null, false)
}
/**
 * @param {Object} subject The subject returned by the authenticate function
 * @param {string} topic The topic
 * @param {Buffer} payload The payload
 * @param {Function} callback The callback function. Has the following structure: callback(error, authorized)
 */
AuthIOK.prototype.authorizePutHTTP = function () {
  return function (subject, topic, payload, callback) {
    // var isOwner = topic.indexOf(subject.deviceProfile.name) == 0 || topic.indexOf(subject.deviceProfile.clientId) == 0
    var isValid =
      subject.deviceProfile &&
      subject.deviceProfile.topics &&
      subject.deviceProfile.topics.indexOf(topic) > -1
    if (!isValid) console.log('PUT request is not permitted')
    callback(null, isValid)
  }
  // Examples:
  //   Error:          callback(error)
  //   Authorized:     callback(null, true)
  //   Not authorized: callback(null, false)
}

AuthIOK.prototype.findClient = function (data, callback) {
  const findDocument = function (db, cb) {
    // Get the documents collection
    const collection = db.collection(dbAuthCollectionName)
    // Find some documents
    collection.findOne(
      {
        // clientId: data.id
        name: data.name
      },
      function (err, doc) {
        if (err) {
          console.log('Mongodb error: ' + err)
          var error = {
            error: err,
            code: '503'
          }
          return cb(error)
        }
        cb(doc)
      }
    )
  }
  // Use connect method to connect to the server
  MongoClient.connect(
    dbAuthUrl,
    function (err, client) {
      if (err) {
        console.log('Mongodb error: ' + err)
        var error = {
          error: err,
          code: '503'
        }
        return callback(error)
      }
      const db = client.db(dbAuthName)
      findDocument(db, function (cb) {
        client.close()
        return callback(cb)
      })
    }
  )
}

module.exports = AuthIOK
