'use strict'

const chai = require('chai')
const nock = require('nock')
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
const chaiAsPromised = require('chai-as-promised')

before(() => {
  chai.use(sinonChai)
  chai.use(chaiAsPromised)
})

beforeEach(function beforeEach () {
  this.sandbox = sinon.createSandbox()
  nock.cleanAll()
})

afterEach(function afterEach () {
  this.sandbox.restore()
})

// require('../config/components/mongo.test')
// require('../config/components/common.test')
// require('../config/components/logger.test')
require('../lib/http.test')
