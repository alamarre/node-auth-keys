'use strict';

const assert = require('assert');
const sinon = require('sinon');
const xtend = require('xtend');

const CoreKeyGenerator = require('../src/core-key-generator');
const ecKeygen = require('../src/ec-key-generator');
const rsaKeygen = require('../src/rsa-key-generator');

const DummyPublicKeyStore = require('./dummy-public-key-store');

const EXPIRY_CLOCK_SKEW = 5 * 60;
const TEST_SIGNING_KEY_AGE = 60 * 60;
const TEST_SIGNING_KEY_OVERLAP = 5 * 60;

const
	dummyPublicKeyStore = new DummyPublicKeyStore();

describe('CoreKeyGenerator', () => {
	let sandbox, clock;

	beforeEach(() => {
		clock = sinon.useFakeTimers(),
		sandbox = sinon.sandbox.create();
	});

	afterEach(() => {
		clock.restore();
		sandbox.restore();
	});

	function createKeyGenerator(opts) {
		return new CoreKeyGenerator(xtend({
			publicKeyStore: dummyPublicKeyStore,
			signingKeyAge: TEST_SIGNING_KEY_AGE,
			signingKeyOverlap: TEST_SIGNING_KEY_OVERLAP,
			signingKeyType: 'EC',
			ec: {
				crv: 'P-256'
			},
			rsa: {
				signingKeySize: 2048
			}
		}, opts));
	}

	describe('constructor(...)', () => {
		beforeEach(() => sandbox.stub(CoreKeyGenerator.prototype, 'generateNewKeys'));

		it('should throw if options is not an object', () => {
			for (const val of [undefined, 'hi!', function() {}, 1000]) {
				assert.throws(
					() => new CoreKeyGenerator(val),
					TypeError,
					/opts.+Object/
				);
			}
		});

		it('should throw if publicKeyStore is not an AbstractPublicKeyStore', () => {
			assert.throws(
				() => createKeyGenerator({ publicKeyStore: {} }),
				TypeError,
				/publicKeyStore.+AbstractPublicKeyStore/
			);
		});

		it('should throw if signingKeyAge is not an integer', () => {
			for (const val of ['3600', {}, function() {}, 3600.5]) {
				assert.throws(
					() => createKeyGenerator({ signingKeyAge: val }),
					TypeError,
					/signingKeyAge.+integer/
				);
			}
		});

		it('should throw if signingKeyAge is negative', () => {
			assert.throws(
				() => createKeyGenerator({ signingKeyAge: -1 }),
				Error,
				/signingKeyAge/
			);
		});

		it('should throw if signingKeyAge is zero', () => {
			assert.throws(
				() => createKeyGenerator({ signingKeyAge: 0 }),
				Error,
				/signingKeyAge/
			);
		});

		it('should throw is signingKeyAge is too large', () => {
			assert.throws(
				() => createKeyGenerator({ signingKeyAge: 24 * 60 * 60 + 1 }),
				Error,
				/signingKeyAge/
			);
		});

		it('should throw if signingKeyOverlap is not an integer', () => {
			for (const val of ['3000', {}, function() {}, 3000.5]) {
				assert.throws(
					() => createKeyGenerator({ signingKeyOverlap: val }),
					TypeError,
					/signingKeyOverlap.+integer/
				);
			}
		});

		it('should throw if signingKeyOverlap is negative', () => {
			assert.throws(
				() => createKeyGenerator({ signingKeyOverlap: -1 }),
				Error,
				/signingKeyOverlap/
			);
		});

		it('should throw if signingKeyOverlap is zero', () => {
			assert.throws(
				() => createKeyGenerator({ signingKeyOverlap: 0 }),
				Error,
				/signingKeyOverlap/
			);
		});

		it('should throw is signingKeyOverlap is greater than signingKeyAge', () => {
			createKeyGenerator({ signingKeyAge: 4000, signingKeyOverlap: 4000 });
			assert.throws(
				() => createKeyGenerator({ signingKeyAge: 4000, signingKeyOverlap: 4001 }),
				Error,
				/signingKeyOverlap.+signingKeyAge/
			);
		});

		it('should throw if signingKeyType is invalid', () => {
			for (const alg of ['dsa', 'rsa', 'rSA', 'eCDSA', 'foo', 1]) {
				assert.throws(
					() => createKeyGenerator({ signingKeyType: alg }),
					Error,
					/signingKeyType/
				);
			}
		});

		describe('RSA', /* @this */ function() {
			this.timeout(5000);

			it('should check options with rsaKeygen.normalize and succeed', () => {
				sandbox.spy(rsaKeygen, 'normalize');
				assert.strictEqual(0, rsaKeygen.normalize.callCount);
				createKeyGenerator({ signingKeyType: 'RSA', rsa: { singingKeySize: 2048 } });
				assert.strictEqual(1, rsaKeygen.normalize.callCount);
			});
		});

		describe('EC', () => {
			it('should check options with ecKeygen.normalize and succeed', () => {
				sandbox.spy(ecKeygen, 'normalize');
				assert.strictEqual(0, ecKeygen.normalize.callCount);
				createKeyGenerator({ signingKeyType: 'EC', ec: { crv: 'P-256' } });
				assert.strictEqual(1, ecKeygen.normalize.callCount);
			});
		});

		it('should not call generateNewKeys', () => {
			createKeyGenerator();
			assert.strictEqual(0, CoreKeyGenerator.prototype.generateNewKeys.callCount);
		});
	});

	describe('generateNewKeys(...)', () => {
		beforeEach(() => sandbox.stub(dummyPublicKeyStore, 'storePublicKey').resolves());

		describe('RSA', /* @this */ function() {
			this.timeout(5000);

			it('calls storePublicKey with public rsa jwk and proper expiry', () => {
				const CURRENT_TIME_MS = 25000;
				clock.tick(CURRENT_TIME_MS);

				const keygen = createKeyGenerator({ signingKeyType: 'RSA' });
				// generateNewKeys is called immediately by the contrusctor, so reset the stub
				dummyPublicKeyStore.storePublicKey.resetHistory();
				assert.strictEqual(0, dummyPublicKeyStore.storePublicKey.callCount);

				return keygen
					.generateNewKeys()
					.then(
						() => {
							sinon.assert.calledWith(
								dummyPublicKeyStore.storePublicKey,
								sinon.match({
									kty: 'RSA',
									alg: 'RS256',
									exp: Math.round(CURRENT_TIME_MS / 1000)
										+ TEST_SIGNING_KEY_AGE
										+ TEST_SIGNING_KEY_OVERLAP
										+ EXPIRY_CLOCK_SKEW
								})
							);
						},
						() => assert(false)
					);
			});
		});

		describe('EC', () => {
			it('calls storePublicKey with public ec jwk and proper expiry', () => {
				const CURRENT_TIME_MS = 25000;
				clock.tick(CURRENT_TIME_MS);

				const keygen = createKeyGenerator({ signingKeyType: 'EC' });
				// generateNewKeys is called immediately by the contrusctor, so reset the stub
				dummyPublicKeyStore.storePublicKey.resetHistory();
				assert.strictEqual(0, dummyPublicKeyStore.storePublicKey.callCount);

				return keygen
					.generateNewKeys()
					.then(
						() => {
							sinon.assert.calledWith(
								dummyPublicKeyStore.storePublicKey,
								sinon.match({
									kty: 'EC',
									alg: sinon.match(/^ES\d\d\d$/),
									exp: Math.round(CURRENT_TIME_MS / 1000)
										+ TEST_SIGNING_KEY_AGE
										+ TEST_SIGNING_KEY_OVERLAP
										+ EXPIRY_CLOCK_SKEW
								})
							);
						},
						() => assert(false)
					);
			});
		});
	});
});