'use strict';

var path3 = require('path');
var fs2 = require('fs');
var noble = require('@noble/hashes/legacy.js');
var hmac_js = require('@noble/hashes/hmac.js');
var sha2_js = require('@noble/hashes/sha2.js');
var axios = require('axios');

var _documentCurrentScript = typeof document !== 'undefined' ? document.currentScript : null;
function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n.default = e;
  return Object.freeze(n);
}

var path3__namespace = /*#__PURE__*/_interopNamespace(path3);
var fs2__namespace = /*#__PURE__*/_interopNamespace(fs2);
var noble__namespace = /*#__PURE__*/_interopNamespace(noble);
var axios__default = /*#__PURE__*/_interopDefault(axios);

// src/client/rgb-lib-client.ts

// src/client/network-config.ts
var DEFAULT_TRANSPORT_ENDPOINTS = {
  mainnet: "rpcs://rgb-proxy-mainnet.utexo.com/json-rpc",
  testnet: "rpcs://rgb-proxy-testnet3.utexo.com/json-rpc",
  testnet4: "rpcs://proxy.iriswallet.com/0.2/json-rpc",
  signet: "rpcs://rgb-proxy-utexo.utexo.com/json-rpc",
  regtest: "rpcs://proxy.iriswallet.com/0.2/json-rpc"
};
var DEFAULT_INDEXER_URLS = {
  mainnet: "ssl://electrum.iriswallet.com:50003",
  testnet: "ssl://electrum.iriswallet.com:50013",
  testnet4: "ssl://electrum.iriswallet.com:50053",
  signet: "https://esplora-api.utexo.com",
  regtest: "tcp://regtest.thunderstack.org:50001"
};

// src/errors/index.ts
var SDKError = class _SDKError extends Error {
  constructor(message, code, statusCode, cause) {
    super(message);
    this.name = "SDKError";
    this.code = code;
    this.statusCode = statusCode;
    this.cause = cause;
    Object.setPrototypeOf(this, _SDKError.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, _SDKError);
    }
  }
  /**
   * Convert error to JSON for logging
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      cause: this.cause?.message,
      stack: this.stack
    };
  }
};
var NetworkError = class _NetworkError extends SDKError {
  constructor(message, statusCode, cause) {
    super(message, "NETWORK_ERROR", statusCode, cause);
    this.name = "NetworkError";
    Object.setPrototypeOf(this, _NetworkError.prototype);
  }
};
var ValidationError = class _ValidationError extends SDKError {
  constructor(message, field) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
    this.field = field;
    Object.setPrototypeOf(this, _ValidationError.prototype);
  }
};
var WalletError = class _WalletError extends SDKError {
  constructor(message, code, cause) {
    super(message, code || "WALLET_ERROR", void 0, cause);
    this.name = "WalletError";
    Object.setPrototypeOf(this, _WalletError.prototype);
  }
};
var CryptoError = class _CryptoError extends SDKError {
  constructor(message, cause) {
    super(message, "CRYPTO_ERROR", void 0, cause);
    this.name = "CryptoError";
    Object.setPrototypeOf(this, _CryptoError.prototype);
  }
};
var ConfigurationError = class _ConfigurationError extends SDKError {
  constructor(message, _field) {
    super(message, "CONFIGURATION_ERROR");
    this.name = "ConfigurationError";
    Object.setPrototypeOf(this, _ConfigurationError.prototype);
  }
};
var BadRequestError = class _BadRequestError extends SDKError {
  constructor(message, cause) {
    super(message, "BAD_REQUEST", 400, cause);
    this.name = "BadRequestError";
    Object.setPrototypeOf(this, _BadRequestError.prototype);
  }
};
var NotFoundError = class _NotFoundError extends SDKError {
  constructor(message, cause) {
    super(message, "NOT_FOUND", 404, cause);
    this.name = "NotFoundError";
    Object.setPrototypeOf(this, _NotFoundError.prototype);
  }
};
var ConflictError = class _ConflictError extends SDKError {
  constructor(message, cause) {
    super(message, "CONFLICT", 409, cause);
    this.name = "ConflictError";
    Object.setPrototypeOf(this, _ConflictError.prototype);
  }
};
var RgbNodeError = class _RgbNodeError extends SDKError {
  constructor(message, statusCode, cause) {
    super(message, "RGB_NODE_ERROR", statusCode, cause);
    this.name = "RgbNodeError";
    Object.setPrototypeOf(this, _RgbNodeError.prototype);
  }
};

// src/constants/derivation.ts
var DERIVATION_PURPOSE = 86;
var DERIVATION_ACCOUNT = 0;
var KEYCHAIN_RGB = 0;
var KEYCHAIN_BTC = 0;

// src/utexo/config/utexo-presets.ts
function withGetAssetById(config) {
  return {
    ...config,
    getAssetById(tokenId) {
      return config.assets.find((a) => a.tokenId === tokenId);
    }
  };
}
var testnetPreset = {
  networkMap: {
    mainnet: "testnet",
    utexo: "signet"
  },
  networkIdMap: {
    mainnet: withGetAssetById({
      networkName: "RGB",
      networkId: 36,
      assets: [
        {
          assetId: "rgb:WPRv95Nj-icdrgPp-zpQhIp_-2TyJ~Ge-k~FvuMZ-~vVnkA0",
          tokenName: "tUSD",
          longName: "USDT",
          precision: 6,
          tokenId: 4
        }
      ]
    }),
    mainnetLightning: withGetAssetById({
      networkName: "RGB Lightning",
      networkId: 94,
      assets: [
        {
          assetId: "rgb:WPRv95Nj-icdrgPp-zpQhIp_-2TyJ~Ge-k~FvuMZ-~vVnkA0",
          tokenName: "tUSD",
          longName: "USDT",
          precision: 6,
          tokenId: 4
        }
      ]
    }),
    utexo: withGetAssetById({
      networkName: "UTEXO",
      networkId: 96,
      assets: [
        {
          assetId: "rgb:yJW4k8si-~8JdNfl-nM91qFu-r5rH_HS-1hM7jpi-L~lBf90",
          tokenName: "tUSD",
          longName: "USDT",
          precision: 6,
          tokenId: 4
        }
      ]
    })
  }
};
var mainnetPreset = {
  networkMap: {
    mainnet: "mainnet",
    utexo: "signet"
  },
  networkIdMap: {
    mainnet: withGetAssetById({
      networkName: "RGB",
      networkId: 36,
      // TODO: Update to production network ID
      assets: [
        {
          assetId: "rgb:nkHbmy97-R4cjRCe-j~VvT~E-0UQ0OW8-jOCCW6O-EqeCq9M",
          // TODO: Update to production asset ID
          tokenName: "tUSD",
          longName: "USDT",
          precision: 6,
          tokenId: 3
        }
      ]
    }),
    mainnetLightning: withGetAssetById({
      networkName: "RGB Lightning",
      networkId: 94,
      // TODO: Update to production network ID
      assets: [
        {
          assetId: "rgb:nkHbmy97-R4cjRCe-j~VvT~E-0UQ0OW8-jOCCW6O-EqeCq9M",
          // TODO: Update to production asset ID
          tokenName: "tUSD",
          longName: "USDT",
          precision: 6,
          tokenId: 3
        }
      ]
    }),
    utexo: withGetAssetById({
      networkName: "UTEXO",
      networkId: 96,
      // TODO: Update to production network ID
      assets: [
        {
          assetId: "rgb:0yyfySrb-TArdWKB-6Y0yhUX-dbqMpN3-NnjsV2F-2fMhOI4",
          // TODO: Update to production asset ID
          tokenName: "tUSD",
          longName: "USDT",
          precision: 6,
          tokenId: 3
        }
      ]
    })
  }
};

// src/utexo/utils/network.ts
var NETWORK_PRESETS = {
  mainnet: mainnetPreset,
  testnet: testnetPreset
};
function getUtxoNetworkConfig(preset) {
  return NETWORK_PRESETS[preset];
}
var utexoNetworkMap = testnetPreset.networkMap;
var utexoNetworkIdMap = testnetPreset.networkIdMap;
function getDestinationAsset(senderNetwork, destinationNetwork, assetIdSender, networkIdMap) {
  const config = networkIdMap ?? utexoNetworkIdMap;
  const destinationConfig = config[destinationNetwork];
  if (assetIdSender == null) return destinationConfig.assets[0];
  const senderConfig = config[senderNetwork];
  const senderAsset = senderConfig.assets.find(
    (a) => a.assetId === assetIdSender
  );
  if (!senderAsset) return void 0;
  return destinationConfig.assets.find(
    (a) => a.tokenId === senderAsset.tokenId
  );
}

// src/constants/network.ts
var COIN_RGB_MAINNET = 827166;
var COIN_RGB_TESTNET = 827167;
var COIN_BITCOIN_MAINNET = 0;
var COIN_BITCOIN_TESTNET = 1;
var NETWORK_MAP = {
  "0": "mainnet",
  "1": "testnet",
  "2": "testnet",
  // Alternative testnet number (also maps to testnet)
  "3": "regtest",
  "signet": "signet",
  "mainnet": "mainnet",
  "testnet": "testnet",
  "testnet4": "testnet4",
  "regtest": "regtest"
};
var BIP32_VERSIONS = {
  mainnet: {
    public: 76067358,
    private: 76066276
  },
  testnet: {
    public: 70617039,
    private: 70615956
  },
  testnet4: {
    public: 70617039,
    private: 70615956
  },
  signet: {
    public: 70617039,
    private: 70615956
  },
  regtest: {
    public: 70617039,
    private: 70615956
  }
};

// src/constants/defaults.ts
var DEFAULT_NETWORK = "regtest";
var DEFAULT_API_TIMEOUT = 12e4;
var DEFAULT_MAX_RETRIES = 3;
var DEFAULT_LOG_LEVEL = 3;

// src/utils/validation.ts
var VALID_NETWORKS = [
  "mainnet",
  "testnet",
  "testnet4",
  "signet",
  "regtest"
];
function validateNetwork(network) {
  const key = String(network);
  const normalized = NETWORK_MAP[key];
  if (!normalized || !VALID_NETWORKS.includes(normalized)) {
    throw new ValidationError(
      `Invalid network: ${network}. Must be one of: ${VALID_NETWORKS.join(", ")}`,
      "network"
    );
  }
}
function normalizeNetwork(network) {
  validateNetwork(network);
  const key = String(network);
  return NETWORK_MAP[key];
}
function validateMnemonic(mnemonic, field = "mnemonic") {
  if (!mnemonic || typeof mnemonic !== "string" || mnemonic.trim().length === 0) {
    throw new ValidationError(`${field} must be a non-empty string`, field);
  }
  const words = mnemonic.trim().split(/\s+/);
  if (words.length !== 12 && words.length !== 24) {
    throw new ValidationError(
      `${field} must be 12 or 24 words, got ${words.length} words`,
      field
    );
  }
}
function validateBase64(base64, field = "data") {
  if (!base64 || typeof base64 !== "string" || base64.trim().length === 0) {
    throw new ValidationError(`${field} must be a non-empty string`, field);
  }
  const base64Regex = /^[A-Za-z0-9+/=]+$/;
  if (!base64Regex.test(base64.trim())) {
    throw new ValidationError(`Invalid base64 format for ${field}`, field);
  }
  try {
    Buffer.from(base64.trim(), "base64");
  } catch (error) {
    console.error(error);
    throw new ValidationError(`Invalid base64 encoding for ${field}`, field);
  }
}
function validatePsbt(psbt, field = "psbt") {
  validateBase64(psbt, field);
  const psbtString = String(psbt).trim();
  if (psbtString.length < 50) {
    throw new ValidationError(
      `${field} appears to be too short to be a valid PSBT`,
      field
    );
  }
}
function validateHex(hex, field = "data") {
  if (!hex || typeof hex !== "string" || hex.trim().length === 0) {
    throw new ValidationError(`${field} must be a non-empty string`, field);
  }
  const hexRegex = /^[0-9a-fA-F]+$/;
  if (!hexRegex.test(hex.trim())) {
    throw new ValidationError(`Invalid hex format for ${field}`, field);
  }
}
function validateRequired(value, field) {
  if (value === null || value === void 0) {
    throw new ValidationError(`${field} is required`, field);
  }
}
function validateString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${field} must be a non-empty string`, field);
  }
}

// src/utils/environment.ts
function isNode() {
  return typeof process !== "undefined" && process.versions != null && process.versions.node != null;
}
function isBare() {
  return typeof globalThis !== "undefined" && globalThis.Bare;
}
function isBrowser() {
  return typeof window !== "undefined" && typeof window.document !== "undefined";
}
function getEnvironment() {
  if (isNode()) return "node";
  if (isBrowser()) return "browser";
  return "unknown";
}

// src/client/rgb-lib-client.ts
var _rgblib = null;
async function ensureRgbLib() {
  if (_rgblib) return _rgblib;
  if (isBare()) {
    const mod = await import('@utexo/rgb-lib-bare');
    _rgblib = mod.default || mod;
  } else {
    const mod = await import('@utexo/rgb-lib');
    _rgblib = mod.default || mod;
  }
  return _rgblib;
}
var rgblib = new Proxy({}, {
  get(_target, prop) {
    if (!_rgblib) throw new Error("rgb-lib not loaded \u2014 call ensureRgbLib() first");
    return _rgblib[prop];
  }
});
function mapNetworkToRgbLib(network) {
  const networkMap = {
    mainnet: "Mainnet",
    testnet: "Testnet",
    testnet4: "Testnet4",
    signet: "Signet",
    regtest: "Regtest"
  };
  const networkStr = String(network).toLowerCase();
  return networkMap[networkStr] || "Regtest";
}
var restoreWallet = async (params) => {
  await ensureRgbLib();
  const { backupFilePath, password, dataDir } = params;
  if (!fs2__namespace.existsSync(backupFilePath)) {
    throw new ValidationError("Backup file not found", "backup");
  }
  if (!fs2__namespace.existsSync(dataDir)) {
    throw new ValidationError(
      `Restore directory does not exist: ${dataDir}`,
      "restoreDir"
    );
  }
  rgblib.restoreBackup(backupFilePath, password, dataDir);
  return {
    message: "Wallet restored successfully"
  };
};
var restoreFromVss = async (params) => {
  await ensureRgbLib();
  const anyLib = rgblib;
  if (typeof anyLib.restoreFromVss !== "function") {
    throw new WalletError(
      "VSS restore is not available in the current rgb-lib build."
    );
  }
  if (!params.targetDir) {
    throw new ValidationError("targetDir is required", "targetDir");
  }
  const { config, targetDir } = params;
  const mappedConfig = {
    server_url: config.serverUrl,
    store_id: config.storeId,
    signing_key: config.signingKey
  };
  const walletPath = anyLib.restoreFromVss(mappedConfig, targetDir);
  return {
    message: "Wallet restored from VSS successfully",
    walletPath
  };
};
var RGBLibClient = class _RGBLibClient {
  constructor(params) {
    this.online = null;
    this.xpubVan = params.xpubVan;
    this.xpubCol = params.xpubCol;
    this.masterFingerprint = params.masterFingerprint;
    this.originalNetwork = params.network;
    this.network = normalizeNetwork(this.originalNetwork);
    this.dataDir = params.dataDir;
    this.transportEndpoint = params.transportEndpoint || DEFAULT_TRANSPORT_ENDPOINTS[this.network] || DEFAULT_TRANSPORT_ENDPOINTS.signet;
    if (params.indexerUrl) {
      this.indexerUrl = params.indexerUrl;
    } else {
      this.indexerUrl = DEFAULT_INDEXER_URLS[this.network] || DEFAULT_INDEXER_URLS.signet;
    }
    if (!fs2__namespace.existsSync(this.dataDir)) {
      fs2__namespace.mkdirSync(this.dataDir, { recursive: true });
    }
    const walletData = {
      dataDir: this.dataDir,
      bitcoinNetwork: mapNetworkToRgbLib(this.originalNetwork),
      databaseType: rgblib.DatabaseType.Sqlite,
      accountXpubVanilla: this.xpubVan,
      accountXpubColored: this.xpubCol,
      masterFingerprint: this.masterFingerprint,
      maxAllocationsPerUtxo: "1",
      vanillaKeychain: "0",
      supportedSchemas: [
        rgblib.AssetSchema.Cfa,
        rgblib.AssetSchema.Nia,
        rgblib.AssetSchema.Uda
      ]
    };
    try {
      this.wallet = new rgblib.Wallet(new rgblib.WalletData(walletData));
    } catch (error) {
      console.log("error", error);
      throw new WalletError(
        "Failed to initialize rgb-lib wallet",
        void 0,
        error
      );
    }
  }
  /**
   * Async factory — loads rgb-lib (native addon in bare, SWIG in Node.js) before constructing
   */
  static async create(params) {
    await ensureRgbLib();
    return new _RGBLibClient(params);
  }
  /**
   * Ensure online connection is established
   */
  ensureOnline() {
    if (this.online) {
      return;
    }
    try {
      this.online = this.wallet.goOnline(false, this.indexerUrl);
    } catch (error) {
      throw new WalletError(
        "Failed to establish online connection",
        void 0,
        error
      );
    }
  }
  /**
   * Get online object, creating it if needed
   */
  getOnline() {
    this.ensureOnline();
    return this.online;
  }
  registerWallet() {
    const online = this.getOnline();
    const address = this.wallet.getAddress();
    const btcBalance = this.wallet.getBtcBalance(online, false);
    return {
      address,
      btcBalance
    };
  }
  getBtcBalance() {
    const online = this.getOnline();
    return this.wallet.getBtcBalance(online, false);
  }
  getAddress() {
    return this.wallet.getAddress();
  }
  listUnspents() {
    const online = this.getOnline();
    return this.wallet.listUnspents(online, false, false);
  }
  createUtxosBegin(params) {
    const online = this.getOnline();
    const upTo = params.upTo ?? false;
    const num = params.num !== void 0 ? String(params.num) : null;
    const size = params.size !== void 0 ? String(params.size) : null;
    const feeRate = params.feeRate ? String(params.feeRate) : "1";
    const skipSync = false;
    return this.wallet.createUtxosBegin(
      online,
      upTo,
      num,
      size,
      feeRate,
      skipSync
    );
  }
  createUtxosEnd(params) {
    const online = this.getOnline();
    const signedPsbt = params.signedPsbt;
    const skipSync = params.skipSync ?? false;
    return this.wallet.createUtxosEnd(online, signedPsbt, skipSync);
  }
  sendBegin(params) {
    const online = this.getOnline();
    const feeRate = String(params.feeRate ?? 1);
    const minConfirmations = String(params.minConfirmations ?? 1);
    const donation = params.donation ?? false;
    let assetId = params.assetId;
    let amount = params.amount;
    let recipientId;
    let transportEndpoints = [];
    let witnessData = null;
    if (params.witnessData && params.witnessData.amountSat) {
      witnessData = {
        amountSat: String(params.witnessData.amountSat),
        blinding: params.witnessData.blinding ? Number(params.witnessData.blinding) : null
      };
    }
    if (params.invoice) {
      const invoiceStr = params.invoice;
      const invoiceData = this.decodeRGBInvoice({ invoice: invoiceStr });
      recipientId = invoiceData.recipientId;
      transportEndpoints = invoiceData.transportEndpoints;
    }
    if (transportEndpoints.length === 0) {
      transportEndpoints = [this.transportEndpoint];
    }
    if (!assetId) {
      throw new ValidationError(
        "asset_id is required for send operation",
        "asset_id"
      );
    }
    if (!recipientId) {
      throw new ValidationError(
        "Could not extract recipient_id from invoice",
        "invoice"
      );
    }
    if (!amount) {
      throw new ValidationError(
        "amount is required for send operation",
        "amount"
      );
    }
    const assignment = { Fungible: amount };
    const recipientMap = {
      [assetId]: [
        {
          recipientId,
          witnessData,
          assignment,
          transportEndpoints
        }
      ]
    };
    const psbt = this.wallet.sendBegin(
      online,
      recipientMap,
      donation,
      feeRate,
      minConfirmations
    );
    return psbt;
  }
  /**
   * Batch send: accepts an already-built recipientMap and calls sendBegin.
   */
  sendBeginBatch(params) {
    const online = this.getOnline();
    const feeRate = String(params.feeRate ?? 1);
    const minConfirmations = String(params.minConfirmations ?? 1);
    const donation = params.donation ?? true;
    const { recipientMap } = params;
    if (!recipientMap || typeof recipientMap !== "object") {
      throw new ValidationError(
        "recipientMap is required and must be a non-empty object",
        "recipientMap"
      );
    }
    const assetIds = Object.keys(recipientMap);
    if (assetIds.length === 0) {
      throw new ValidationError(
        "recipientMap must contain at least one asset id",
        "recipientMap"
      );
    }
    for (const assetId of assetIds) {
      const recipients = recipientMap[assetId];
      if (!Array.isArray(recipients) || recipients.length === 0) {
        throw new ValidationError(
          `recipientMap["${assetId}"] must be a non-empty array of recipients`,
          "recipientMap"
        );
      }
    }
    const psbt = this.wallet.sendBegin(
      online,
      recipientMap,
      donation,
      feeRate,
      minConfirmations
    );
    return psbt;
  }
  sendEnd(params) {
    const online = this.getOnline();
    const signedPsbt = params.signedPsbt;
    const skipSync = params.skipSync ?? false;
    return this.wallet.sendEnd(online, signedPsbt, skipSync);
  }
  sendBtcBegin(params) {
    const online = this.getOnline();
    const address = params.address;
    const amount = String(params.amount);
    const feeRate = String(params.feeRate);
    const skipSync = params.skipSync ?? false;
    return this.wallet.sendBtcBegin(online, address, amount, feeRate, skipSync);
  }
  sendBtcEnd(params) {
    const online = this.getOnline();
    const signedPsbt = params.signedPsbt;
    const skipSync = params.skipSync ?? false;
    return this.wallet.sendBtcEnd(online, signedPsbt, skipSync);
  }
  getFeeEstimation(params) {
    const online = this.getOnline();
    const blocks = String(params.blocks);
    try {
      const result = this.wallet.getFeeEstimation(online, blocks);
      if (typeof result === "string") {
        try {
          return JSON.parse(result);
        } catch {
          return result;
        }
      }
      return result;
    } catch (_error) {
      console.warn(
        "rgb-lib estimation fee are not available, using default fee rate 2"
      );
      return 2;
    }
  }
  blindReceive(params) {
    const assetId = params.assetId || null;
    const assignment = `{"Fungible":${params.amount}}`;
    const durationSeconds = String(params.durationSeconds ?? 2e3);
    const transportEndpoints = [this.transportEndpoint];
    const minConfirmations = String(params.minConfirmations ?? 3);
    return this.wallet.blindReceive(
      assetId,
      assignment,
      durationSeconds,
      transportEndpoints,
      minConfirmations
    );
  }
  witnessReceive(params) {
    const assetId = params.assetId || null;
    const assignment = `{"Fungible":${params.amount}}`;
    const durationSeconds = String(params.durationSeconds ?? 2e3);
    const transportEndpoints = [this.transportEndpoint];
    const minConfirmations = String(params.minConfirmations ?? 3);
    return this.wallet.witnessReceive(
      assetId,
      assignment,
      durationSeconds,
      transportEndpoints,
      minConfirmations
    );
  }
  getAssetBalance(asset_id) {
    return this.wallet.getAssetBalance(asset_id);
  }
  issueAssetNia(params) {
    const ticker = params.ticker;
    const name = params.name;
    const precision = String(params.precision);
    const amounts = params.amounts.map((a) => String(a));
    return this.wallet.issueAssetNIA(ticker, name, precision, amounts);
  }
  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  issueAssetIfa(params) {
    throw new ValidationError(
      "issueAssetIfa is not fully supported in rgb-lib. Use RGB Node server for IFA assets.",
      "asset"
    );
  }
  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  inflateBegin(params) {
    throw new ValidationError(
      "inflateBegin is not fully supported in rgb-lib. Use RGB Node server for inflation operations.",
      "asset"
    );
  }
  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  inflateEnd(params) {
    throw new ValidationError(
      "inflateEnd is not fully supported in rgb-lib. Use RGB Node server for inflation operations.",
      "asset"
    );
  }
  listAssets() {
    const filterAssetSchemas = [];
    return this.wallet.listAssets(filterAssetSchemas);
  }
  decodeRGBInvoice(params) {
    const invoiceString = params.invoice;
    const invoice = new rgblib.Invoice(invoiceString);
    try {
      return invoice.invoiceData();
    } finally {
      invoice.drop();
    }
  }
  refreshWallet() {
    const online = this.getOnline();
    const assetId = null;
    const filter = [];
    const skipSync = false;
    const result = this.wallet.refresh(online, assetId, filter, skipSync);
    console.log("refresh state:", JSON.stringify(result, null, 2));
  }
  dropWallet() {
    if (this.online) {
      rgblib.dropOnline(this.online);
      this.online = null;
    }
    if (this.wallet) {
      this.wallet.drop();
      this.wallet = null;
    }
  }
  listTransactions() {
    const online = this.getOnline();
    const skipSync = false;
    return this.wallet.listTransactions(online, skipSync);
  }
  listTransfers(asset_id) {
    return this.wallet.listTransfers(asset_id ? asset_id : null);
  }
  failTransfers(params) {
    const online = this.getOnline();
    const batchTransferIdx = params.batchTransferIdx !== void 0 ? params.batchTransferIdx : null;
    const noAssetOnly = params.noAssetOnly ?? false;
    const skipSync = params.skipSync ?? false;
    return this.wallet.failTransfers(
      online,
      batchTransferIdx,
      noAssetOnly,
      skipSync
    );
  }
  deleteTransfers(params) {
    const batchTransferIdx = params.batchTransferIdx !== void 0 ? params.batchTransferIdx : null;
    const noAssetOnly = params.noAssetOnly ?? false;
    return this.wallet.deleteTransfers(batchTransferIdx, noAssetOnly);
  }
  syncWallet() {
    const online = this.getOnline();
    this.wallet.sync(online);
  }
  createBackup(params) {
    if (!params.backupPath) {
      throw new ValidationError("backupPath is required", "backupPath");
    }
    if (!params.password) {
      throw new ValidationError("password is required", "password");
    }
    if (!fs2__namespace.existsSync(params.backupPath)) {
      throw new ValidationError(
        `Backup directory does not exist: ${params.backupPath}`,
        "backupPath"
      );
    }
    const fullBackupPath = path3__namespace.join(
      params.backupPath,
      `${this.masterFingerprint}.backup`
    );
    this.wallet.backup(fullBackupPath, params.password);
    return {
      message: "Backup created successfully",
      backupPath: fullBackupPath
    };
  }
  /**
   * Ensure VSS backup support is available in the underlying rgb-lib bindings.
   * Returns the wallet instance and rgb-lib namespace as `any` for internal use.
   */
  getVssBindingsOrThrow(methodName) {
    const walletAny = this.wallet;
    const anyLib = rgblib;
    if (!walletAny || typeof anyLib.VssBackupClient !== "function" || typeof walletAny[methodName] !== "function") {
      throw new WalletError(
        "VSS backup is not available in the current rgb-lib build."
      );
    }
    return { walletAny, anyLib };
  }
  /**
   * Configure VSS cloud backup for this wallet.
   */
  configureVssBackup(config) {
    const walletAny = this.wallet;
    if (!walletAny || typeof walletAny.configureVssBackup !== "function") {
      throw new WalletError(
        "VSS backup is not available in the current rgb-lib build."
      );
    }
    const mappedConfig = {
      server_url: config.serverUrl,
      store_id: config.storeId,
      signing_key: config.signingKey
    };
    if (config.encryptionEnabled !== void 0) {
      mappedConfig.encryptionEnabled = config.encryptionEnabled;
    }
    if (config.autoBackup !== void 0) {
      mappedConfig.autoBackup = config.autoBackup;
    }
    if (config.backupMode !== void 0) {
      mappedConfig.backupMode = config.backupMode;
    }
    walletAny.configureVssBackup(mappedConfig);
  }
  /**
   * Disable automatic VSS backup for this wallet.
   */
  disableVssAutoBackup() {
    const walletAny = this.wallet;
    if (!walletAny || typeof walletAny.disableVssAutoBackup !== "function") {
      throw new WalletError(
        "VSS backup is not available in the current rgb-lib build."
      );
    }
    walletAny.disableVssAutoBackup();
  }
  /**
   * Trigger a VSS backup immediately using a one-off client created from config.
   * Returns the server version of the stored backup.
   */
  vssBackup(config) {
    const { walletAny, anyLib } = this.getVssBindingsOrThrow("vssBackup");
    const client = new anyLib.VssBackupClient({
      server_url: config.serverUrl,
      store_id: config.storeId,
      signing_key: config.signingKey
    });
    try {
      const version = walletAny.vssBackup(client);
      return version;
    } finally {
      if (typeof client.drop === "function") {
        client.drop();
      }
    }
  }
  /**
   * Get VSS backup status information for this wallet using a one-off client.
   */
  vssBackupInfo(config) {
    const { walletAny, anyLib } = this.getVssBindingsOrThrow("vssBackupInfo");
    const client = new anyLib.VssBackupClient({
      server_url: config.serverUrl,
      store_id: config.storeId,
      signing_key: config.signingKey
    });
    try {
      const info = walletAny.vssBackupInfo(client);
      return {
        backupExists: Boolean(info.backupExists ?? info.backup_exists),
        serverVersion: info.serverVersion ?? info.server_version ?? null,
        backupRequired: Boolean(info.backupRequired ?? info.backup_required)
      };
    } finally {
      if (typeof client.drop === "function") {
        client.drop();
      }
    }
  }
  /**
   * Cleanup resources
   */
  dispose() {
    this.dropWallet();
  }
};

// src/utils/crypto-helpers.ts
function convertToArrayBuffer(data) {
  if (!data) {
    throw new Error("convertToArrayBuffer: data is undefined or null");
  }
  if (data instanceof Uint8Array) {
    return data.buffer;
  }
  if (data && typeof data === "object" && "byteLength" in data && Object.prototype.toString.call(data) === "[object ArrayBuffer]") {
    return data;
  }
  if (data && typeof data === "object") {
    if ("buffer" in data && data.buffer) {
      const buffer = data.buffer;
      if (buffer instanceof ArrayBuffer) {
        return buffer;
      }
      const uint8 = new Uint8Array(data);
      return uint8.buffer;
    }
    try {
      const uint8 = new Uint8Array(data);
      return uint8.buffer;
    } catch (error) {
      throw new Error(
        `convertToArrayBuffer: Failed to convert data to ArrayBuffer: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  try {
    const uint8 = new Uint8Array(data);
    return uint8.buffer;
  } catch (error) {
    throw new Error(
      `convertToArrayBuffer: Failed to convert data to ArrayBuffer: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
async function sha256(data) {
  if (isNode() || isBare()) {
    const nodeCrypto2 = "node:crypto";
    const { createHash } = await import(nodeCrypto2);
    return createHash("sha256").update(data).digest();
  } else {
    if (!data) {
      throw new Error("sha256: data is undefined or null");
    }
    const arrayBuffer = convertToArrayBuffer(data);
    return new Uint8Array(await crypto.subtle.digest("SHA-256", arrayBuffer));
  }
}
async function ripemd1602(data) {
  if (isNode()) {
    const nodeCrypto2 = "node:crypto";
    const { createHash } = await import(nodeCrypto2);
    return createHash("ripemd160").update(data).digest();
  } else if (isBare()) {
    return new Uint8Array(await noble__namespace.ripemd160(data));
  } else {
    const ripemd160Module = await import('ripemd160');
    const RIPEMD160 = ripemd160Module.default || ripemd160Module;
    const BufferPolyfill = globalThis.Buffer || (await import('buffer')).Buffer;
    const hasher = new RIPEMD160();
    hasher.update(BufferPolyfill.from(data));
    return new Uint8Array(hasher.digest());
  }
}
var nodeCrypto = null;
async function getNodeCrypto() {
  if (!isNode()) {
    throw new Error("Node.js crypto is only available in Node.js environment");
  }
  if (!nodeCrypto) {
    const nodeCryptoPath = "node:crypto";
    nodeCrypto = await import(nodeCryptoPath);
  }
  return nodeCrypto;
}
async function sha256Sync(data) {
  if (!isNode()) {
    return sha256(data);
  }
  if (!data) {
    throw new Error("sha256Sync: data is undefined");
  }
  const crypto2 = await getNodeCrypto();
  if (!crypto2) {
    throw new Error("Node.js crypto is not available");
  }
  return crypto2.createHash("sha256").update(data).digest();
}
var ripemd160Sync = async (data) => {
  if (!isNode()) {
    return ripemd1602(data);
  }
  if (!data) {
    throw new Error("ripemd160Sync: data is undefined");
  }
  const crypto2 = await getNodeCrypto();
  if (!crypto2) {
    throw new Error("Node.js crypto is not available");
  }
  return crypto2.createHash("ripemd160").update(data).digest();
};

// src/utils/fingerprint.ts
async function calculateMasterFingerprint(node) {
  const pubkey = node.publicKey;
  if (!pubkey) {
    throw new CryptoError("Public key is undefined");
  }
  const pubkeyData = pubkey instanceof Uint8Array ? pubkey : new Uint8Array(pubkey);
  const sha = await sha256Sync(pubkeyData);
  const ripemd160Fn = ripemd160Sync;
  const ripe = await ripemd160Fn(sha);
  const fingerprintBytes = Array.from(ripe.subarray(0, 4));
  return fingerprintBytes.map((b) => {
    const hex = b.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join("");
}

// src/utils/bip32-helpers.ts
function getWifVersion(network) {
  return network === "mainnet" ? 128 : 239;
}
function getNetworkVersionsFromConstants(network) {
  const bip32Versions = BIP32_VERSIONS[network];
  return {
    bip32: bip32Versions,
    wif: getWifVersion(network)
  };
}
function normalizeSeedBuffer(seed) {
  if (!seed) {
    throw new CryptoError("Failed to generate seed - seed is undefined");
  }
  let seedBuffer;
  if (seed instanceof Uint8Array) {
    seedBuffer = seed;
  } else if (seed instanceof ArrayBuffer) {
    seedBuffer = new Uint8Array(seed);
  } else if (seed && typeof seed === "object") {
    if ("buffer" in seed && seed.buffer) {
      const bufferValue = seed.buffer;
      if (bufferValue instanceof ArrayBuffer) {
        if (isNode() && seed instanceof Buffer) {
          seedBuffer = seed;
        } else {
          const byteOffset = seed.byteOffset || 0;
          const byteLength = seed.byteLength || seed.length || bufferValue.byteLength;
          seedBuffer = new Uint8Array(bufferValue, byteOffset, byteLength);
        }
      } else {
        try {
          seedBuffer = new Uint8Array(seed);
        } catch (error) {
          throw new CryptoError(
            `Failed to convert seed to Uint8Array (buffer property invalid): ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    } else {
      try {
        seedBuffer = new Uint8Array(seed);
      } catch (error) {
        throw new CryptoError(
          `Failed to convert seed to Uint8Array: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  } else {
    throw new CryptoError(`Invalid seed type: ${typeof seed}`);
  }
  return seedBuffer;
}
function toNetworkName(bitcoinNetwork) {
  const n = String(bitcoinNetwork).toLowerCase();
  if (n.includes("main")) return "mainnet";
  if (n.includes("reg")) return "regtest";
  if (n.includes("sig")) return "signet";
  if (n.includes("testnet4")) return "testnet4";
  return "testnet";
}
function getNetworkVersions(bitcoinNetwork) {
  const net = toNetworkName(bitcoinNetwork);
  return getNetworkVersionsFromConstants(net);
}

// src/crypto/dependencies.ts
var baseDeps = null;
var basePromise = null;
async function loadBaseDependencies() {
  if (isNode()) {
    const nodeModule = "node:module";
    const { createRequire } = await import(nodeModule);
    const requireFromModule = createRequire((typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === 'SCRIPT' && _documentCurrentScript.src || new URL('index.cjs', document.baseURI).href)));
    const bip392 = requireFromModule("bip39");
    const eccModule2 = requireFromModule(
      "@bitcoinerlab/secp256k1"
    );
    const ecc2 = eccModule2 && typeof eccModule2 === "object" && "default" in eccModule2 ? eccModule2.default : eccModule2;
    const bip322 = requireFromModule("bip32");
    return {
      bip39: bip392,
      ecc: ecc2,
      factory: bip322.BIP32Factory
    };
  }
  const bip39Module = await import('bip39');
  const bip39 = bip39Module.default || bip39Module;
  const eccModule = await import('@bitcoinerlab/secp256k1');
  const ecc = eccModule.default || eccModule;
  const bip32 = await import('bip32');
  return {
    bip39,
    ecc,
    factory: bip32.BIP32Factory
  };
}
async function ensureBaseDependencies() {
  if (baseDeps) {
    return baseDeps;
  }
  if (!basePromise) {
    basePromise = loadBaseDependencies().then((deps) => {
      baseDeps = deps;
      basePromise = null;
      return deps;
    }).catch((error) => {
      basePromise = null;
      throw error;
    });
  }
  return basePromise;
}
var signerDeps = null;
var signerPromise = null;
async function loadSignerDependencies() {
  const base = await ensureBaseDependencies();
  if (isNode()) {
    const nodeModule = "node:module";
    const { createRequire } = await import(nodeModule);
    const requireFromModule = createRequire((typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === 'SCRIPT' && _documentCurrentScript.src || new URL('index.cjs', document.baseURI).href)));
    const bitcoinjs = requireFromModule("bitcoinjs-lib");
    bitcoinjs.initEccLib(base.ecc);
    const Psbt2 = bitcoinjs.Psbt;
    const payments2 = bitcoinjs.payments;
    const networks2 = bitcoinjs.networks;
    const bip3412 = requireFromModule(
      "bitcoinjs-lib/src/payments/bip341.js"
    );
    const toXOnly2 = bip3412.toXOnly || ((pubkey) => Buffer.from(pubkey.slice(1)));
    return {
      ...base,
      Psbt: Psbt2,
      payments: payments2,
      networks: networks2,
      toXOnly: toXOnly2
    };
  }
  const bitcoinModule = await import('bitcoinjs-lib');
  bitcoinModule.initEccLib(base.ecc);
  const Psbt = bitcoinModule.Psbt;
  const payments = bitcoinModule.payments;
  const networks = bitcoinModule.networks;
  const bip341 = await import('bitcoinjs-lib/src/payments/bip341.js');
  const toXOnly = bip341.toXOnly || ((pubkey) => Buffer.from(pubkey.slice(1)));
  return {
    ...base,
    Psbt,
    payments,
    networks,
    toXOnly
  };
}
async function ensureSignerDependencies() {
  if (signerDeps) {
    return signerDeps;
  }
  if (!signerPromise) {
    signerPromise = loadSignerDependencies().then((deps) => {
      signerDeps = deps;
      signerPromise = null;
      return deps;
    }).catch((error) => {
      signerPromise = null;
      throw error;
    });
  }
  return signerPromise;
}

// src/crypto/keys.ts
function normalizeSeedInput(seed, field = "seed") {
  if (typeof seed === "string") {
    const trimmed = seed.trim();
    if (!trimmed) {
      throw new ValidationError(
        `${field} must be a non-empty hex string`,
        field
      );
    }
    const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
    if (hex.length % 2 !== 0) {
      throw new ValidationError(
        `${field} hex string must have even length`,
        field
      );
    }
    if (hex.length !== 128) {
      throw new ValidationError(
        `${field} must be 64 bytes (128 hex characters)`,
        field
      );
    }
    if (!/^[0-9a-fA-F]+$/.test(hex)) {
      throw new ValidationError(`${field} must be a valid hex string`, field);
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      const byte = hex.slice(i * 2, i * 2 + 2);
      bytes[i] = parseInt(byte, 16);
    }
    return bytes;
  }
  if (seed instanceof Uint8Array) {
    if (seed.length === 0) {
      throw new ValidationError(`${field} must not be empty`, field);
    }
    return new Uint8Array(seed);
  }
  throw new ValidationError(
    `${field} must be a 64-byte hex string or Uint8Array`,
    field
  );
}
function getCoinType(bitcoinNetwork, rgb) {
  const net = toNetworkName(bitcoinNetwork);
  if (rgb) return net === "mainnet" ? COIN_RGB_MAINNET : COIN_RGB_TESTNET;
  return net === "mainnet" ? 0 : 1;
}
function accountDerivationPath(bitcoinNetwork, rgb) {
  const coinType = getCoinType(bitcoinNetwork, rgb);
  return `m/${DERIVATION_PURPOSE}'/${coinType}'/${DERIVATION_ACCOUNT}'`;
}
async function masterFingerprintFromNode(node) {
  return calculateMasterFingerprint(node);
}
async function mnemonicToRoot(mnemonic, bitcoinNetwork) {
  const { bip39, ecc, factory } = await ensureBaseDependencies();
  if (!bip39 || typeof bip39.mnemonicToSeedSync !== "function") {
    throw new CryptoError("bip39 module not loaded correctly");
  }
  const seedBuffer = normalizeSeedBuffer(bip39.mnemonicToSeedSync(mnemonic));
  const versions = getNetworkVersions(bitcoinNetwork);
  const bip32 = factory(ecc);
  try {
    return bip32.fromSeed(seedBuffer, versions);
  } catch (error) {
    throw new CryptoError(
      `Failed to create BIP32 root node from seed: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}
async function getAccountXpub(mnemonic, bitcoinNetwork, rgb) {
  const root = await mnemonicToRoot(mnemonic, bitcoinNetwork);
  const path5 = accountDerivationPath(bitcoinNetwork, rgb);
  const acct = root.derivePath(path5);
  return acct.neutered().toBase58();
}
async function getMasterXpriv(mnemonic, bitcoinNetwork) {
  const root = await mnemonicToRoot(mnemonic, bitcoinNetwork);
  return root.toBase58();
}
function deriveAccountXpubsFromRoot(root, network) {
  const vanillaPath = accountDerivationPath(network, false);
  const coloredPath = accountDerivationPath(network, true);
  return {
    account_xpub_vanilla: root.derivePath(vanillaPath).neutered().toBase58(),
    account_xpub_colored: root.derivePath(coloredPath).neutered().toBase58()
  };
}
async function buildGeneratedKeysFromRoot(root, network, mnemonic) {
  const xpub = root.neutered().toBase58();
  const xpriv = root.toBase58();
  const master_fingerprint = await masterFingerprintFromNode(root);
  const { account_xpub_vanilla, account_xpub_colored } = deriveAccountXpubsFromRoot(root, network);
  return {
    mnemonic,
    xpub,
    accountXpubVanilla: account_xpub_vanilla,
    accountXpubColored: account_xpub_colored,
    masterFingerprint: master_fingerprint,
    xpriv
  };
}
async function getXpubFromXprivInternal(xpriv, bitcoinNetwork) {
  const { ecc, factory } = await ensureBaseDependencies();
  try {
    const bip32 = factory(ecc);
    let node;
    if (bitcoinNetwork) {
      const versions = getNetworkVersions(bitcoinNetwork);
      node = bip32.fromBase58(xpriv, versions);
    } else {
      const inferredNetwork = xpriv.startsWith("xprv") ? "mainnet" : "testnet";
      const versions = getNetworkVersions(inferredNetwork);
      node = bip32.fromBase58(xpriv, versions);
    }
    return node.neutered().toBase58();
  } catch (error) {
    throw new CryptoError("Failed to derive xpub from xpriv", error);
  }
}
async function buildKeysOutput(mnemonic, bitcoinNetwork) {
  const normalizedNetwork = normalizeNetwork(bitcoinNetwork);
  const root = await mnemonicToRoot(mnemonic, normalizedNetwork);
  return buildGeneratedKeysFromRoot(root, normalizedNetwork, mnemonic);
}
async function buildKeysOutputFromSeed(seed, bitcoinNetwork) {
  const { ecc, factory } = await ensureBaseDependencies();
  const normalizedNetwork = normalizeNetwork(bitcoinNetwork);
  const seedBuffer = normalizeSeedBuffer(seed);
  const versions = getNetworkVersions(bitcoinNetwork);
  const bip32 = factory(ecc);
  let root;
  try {
    root = bip32.fromSeed(seedBuffer, versions);
  } catch (error) {
    throw new CryptoError(
      "Failed to create BIP32 root node from seed",
      error
    );
  }
  return buildGeneratedKeysFromRoot(root, normalizedNetwork, "");
}
async function buildKeysOutputFromXpriv(xpriv, bitcoinNetwork) {
  const { ecc, factory } = await ensureBaseDependencies();
  try {
    const bip32 = factory(ecc);
    const normalizedNetwork = normalizeNetwork(bitcoinNetwork);
    const versions = getNetworkVersions(bitcoinNetwork);
    const root = bip32.fromBase58(xpriv, versions);
    return buildGeneratedKeysFromRoot(root, normalizedNetwork, "");
  } catch (error) {
    throw new CryptoError("Failed to derive keys from xpriv", error);
  }
}
async function generateKeys2(bitcoinNetwork = "regtest") {
  try {
    const { bip39 } = await ensureBaseDependencies();
    if (!bip39 || typeof bip39.generateMnemonic !== "function") {
      throw new Error(
        "bip39 not loaded. Dependencies may not have initialized correctly."
      );
    }
    const mnemonic = bip39.generateMnemonic(128);
    return await buildKeysOutput(mnemonic, bitcoinNetwork);
  } catch (error) {
    if (error instanceof Error && error.message.includes("bip39 not loaded")) {
      throw new CryptoError("Failed to load dependencies", error);
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new CryptoError(
      `Failed to generate mnemonic: ${errorMessage}`,
      error
    );
  }
}
async function deriveKeysFromMnemonic(bitcoinNetwork = "regtest", mnemonic) {
  validateMnemonic(mnemonic, "mnemonic");
  const normalizedNetwork = normalizeNetwork(bitcoinNetwork);
  try {
    const { bip39 } = await ensureBaseDependencies();
    const trimmedMnemonic = mnemonic.trim();
    if (!bip39 || !bip39.validateMnemonic(trimmedMnemonic)) {
      throw new ValidationError(
        "Invalid mnemonic format - failed BIP39 validation",
        "mnemonic"
      );
    }
    return await buildKeysOutput(trimmedMnemonic, normalizedNetwork);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new CryptoError(
      "Failed to derive keys from mnemonic",
      error
    );
  }
}
async function deriveKeysFromSeed(bitcoinNetwork = "regtest", seed) {
  const normalizedNetwork = normalizeNetwork(bitcoinNetwork);
  try {
    const normalizedSeed = normalizeSeedInput(seed, "seed");
    return await buildKeysOutputFromSeed(normalizedSeed, normalizedNetwork);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new CryptoError("Failed to derive keys from seed", error);
  }
}
async function deriveKeysFromMnemonicOrSeed(bitcoinNetwork = "regtest", mnemonicOrSeed) {
  if (typeof mnemonicOrSeed === "string") {
    const trimmed = mnemonicOrSeed.trim();
    const words = trimmed.split(/\s+/);
    const isLikelyMnemonic = trimmed.includes(" ") && words.length >= 12 && words.length <= 24;
    if (isLikelyMnemonic) {
      try {
        return await deriveKeysFromMnemonic(bitcoinNetwork, trimmed);
      } catch (error) {
        if (error instanceof ValidationError) {
          return await deriveKeysFromSeed(bitcoinNetwork, trimmed);
        }
        throw error;
      }
    } else {
      return await deriveKeysFromSeed(bitcoinNetwork, trimmed);
    }
  } else {
    return await deriveKeysFromSeed(bitcoinNetwork, mnemonicOrSeed);
  }
}
async function restoreKeys(bitcoinNetwork = "regtest", mnemonic) {
  return deriveKeysFromMnemonic(bitcoinNetwork, mnemonic);
}
async function getXprivFromMnemonic(bitcoinNetwork = "regtest", mnemonic) {
  validateMnemonic(mnemonic, "mnemonic");
  const normalizedNetwork = normalizeNetwork(bitcoinNetwork);
  try {
    return await getMasterXpriv(mnemonic, normalizedNetwork);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new CryptoError(
      "Failed to derive xpriv from mnemonic",
      error
    );
  }
}
async function getXpubFromXpriv(xpriv, bitcoinNetwork) {
  if (!xpriv || typeof xpriv !== "string") {
    throw new ValidationError("xpriv must be a non-empty string", "xpriv");
  }
  try {
    return await getXpubFromXprivInternal(xpriv, bitcoinNetwork);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new CryptoError("Failed to derive xpub from xpriv", error);
  }
}
async function deriveKeysFromXpriv(bitcoinNetwork = "regtest", xpriv) {
  if (!xpriv || typeof xpriv !== "string") {
    throw new ValidationError("xpriv must be a non-empty string", "xpriv");
  }
  const normalizedNetwork = normalizeNetwork(bitcoinNetwork);
  try {
    return await buildKeysOutputFromXpriv(xpriv, normalizedNetwork);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new CryptoError("Failed to derive keys from xpriv", error);
  }
}
async function accountXpubsFromMnemonic(bitcoinNetwork = "regtest", mnemonic) {
  validateMnemonic(mnemonic, "mnemonic");
  try {
    const { bip39 } = await ensureBaseDependencies();
    if (!bip39 || !bip39.validateMnemonic(mnemonic)) {
      throw new ValidationError(
        "Invalid mnemonic format - failed BIP39 validation",
        "mnemonic"
      );
    }
    return {
      account_xpub_vanilla: await getAccountXpub(
        mnemonic,
        bitcoinNetwork,
        false
      ),
      account_xpub_colored: await getAccountXpub(
        mnemonic,
        bitcoinNetwork,
        true
      )
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new CryptoError(
      "Failed to derive account xpubs from mnemonic",
      error
    );
  }
}

// src/crypto/signer.ts
function normalizePath(path5) {
  if (typeof path5 === "string") {
    if (path5.startsWith("m/m/")) {
      return path5.replace(/^m\/m\//, "m/");
    }
    return path5;
  } else if (Array.isArray(path5)) {
    if (path5.length > 0 && path5[0] === 0 && path5.length > 1) {
      const second = path5[1];
      if (typeof second === "number" && second >= 2147483648) {
        return path5.slice(1);
      }
    }
    return path5;
  }
  return path5;
}
function pathToString(path5) {
  if (typeof path5 === "string") {
    return path5;
  } else if (Array.isArray(path5)) {
    return path5.map((p) => {
      if (typeof p === "number") {
        return p >= 2147483648 ? `${p & 2147483647}'` : `${p}`;
      }
      return String(p);
    }).join("/");
  }
  return "";
}
function preprocessPsbtForBDK(psbtBase64, rootNode, fp, network, deps) {
  const { Psbt, networks, payments, toXOnly } = deps;
  if (!Psbt || !networks || !payments || !toXOnly) {
    throw new CryptoError("BitcoinJS modules not loaded");
  }
  const psbt = Psbt.fromBase64(psbtBase64.trim());
  const bjsNet = network === "mainnet" ? networks.bitcoin : networks.testnet;
  for (let i = 0; i < psbt.inputCount; i++) {
    const input = psbt.data.inputs[i];
    if (input.tapBip32Derivation && input.tapBip32Derivation.length > 0) {
      input.tapBip32Derivation.forEach((deriv) => {
        const normalizedPath = normalizePath(deriv.path);
        deriv.path = pathToString(normalizedPath);
        let pathStr = pathToString(normalizedPath);
        if (!pathStr.startsWith("m/")) {
          pathStr = "m/" + pathStr;
        }
        try {
          const derivedNode = rootNode.derivePath(pathStr);
          const pubkey = derivedNode.publicKey;
          if (!pubkey) {
            return;
          }
          const pubkeyBuffer = pubkey instanceof Buffer ? pubkey : Buffer.from(pubkey);
          const xOnly = toXOnly(pubkeyBuffer);
          const p2tr = payments.p2tr({
            internalPubkey: xOnly,
            network: bjsNet
          });
          const expectedScript = p2tr.output;
          if (!expectedScript) {
            return;
          }
          if (input.witnessUtxo && expectedScript) {
            const currentScript = input.witnessUtxo.script;
            if (!currentScript.equals(expectedScript)) {
              input.witnessUtxo.script = expectedScript;
            }
          }
          if (xOnly) {
            if (!input.tapInternalKey || !input.tapInternalKey.equals(xOnly)) {
              input.tapInternalKey = xOnly;
            }
          }
          const fingerprintBuf = Buffer.from(fp, "hex");
          if (!deriv.masterFingerprint) {
            deriv.masterFingerprint = fingerprintBuf;
          } else {
            const currentFp = Buffer.from(deriv.masterFingerprint);
            if (!currentFp.equals(fingerprintBuf)) {
              deriv.masterFingerprint = fingerprintBuf;
            }
          }
          if (!deriv.pubkey || !deriv.pubkey.equals(xOnly)) {
            deriv.pubkey = xOnly;
          }
        } catch (_e) {
        }
      });
    }
    if (input.bip32Derivation && input.bip32Derivation.length > 0) {
      input.bip32Derivation.forEach((deriv) => {
        const normalizedPath = normalizePath(deriv.path);
        deriv.path = pathToString(normalizedPath);
      });
    }
  }
  return psbt.toBase64();
}
function detectPsbtType(psbtBase64, deps) {
  const { Psbt } = deps;
  if (!Psbt) {
    throw new CryptoError("BitcoinJS Psbt module not loaded");
  }
  try {
    const psbt = Psbt.fromBase64(psbtBase64.trim());
    for (let i = 0; i < psbt.inputCount; i++) {
      const input = psbt.data.inputs[i];
      if (input.tapBip32Derivation && input.tapBip32Derivation.length > 0) {
        for (const deriv of input.tapBip32Derivation) {
          const pathStr = pathToString(deriv.path);
          if (pathStr.includes("827167'") || pathStr.includes("827166'")) {
            return "send";
          }
        }
      }
    }
    return "create_utxo";
  } catch (_e) {
    return "create_utxo";
  }
}
function getNetworkVersions2(network) {
  return getNetworkVersions(network);
}
async function getMasterFingerprint(rootNode) {
  return calculateMasterFingerprint(rootNode);
}
function tapTweakHash(pubkey) {
  const nodeCrypto2 = globalThis.__nodeCrypto;
  if (!nodeCrypto2) {
    throw new CryptoError("Node.js crypto not initialized for tapTweakHash");
  }
  const tagBuf = Buffer.from("TapTweak", "utf8");
  const tagHash = nodeCrypto2.createHash("sha256").update(tagBuf).digest();
  return nodeCrypto2.createHash("sha256").update(Buffer.concat([tagHash, tagHash, pubkey])).digest();
}
function tweakPrivateKey(ecc, privKey, xOnlyPubkey) {
  const fullPub = ecc.pointFromScalar(privKey);
  if (!fullPub) throw new CryptoError("Invalid private key for taproot tweaking");
  let effectivePriv = privKey;
  if (fullPub.length === 33 && fullPub[0] === 3) {
    if (typeof ecc.privateNegate === "function") {
      effectivePriv = Buffer.from(ecc.privateNegate(privKey));
    }
  }
  const tweak = tapTweakHash(xOnlyPubkey);
  const tweaked = ecc.privateAdd(effectivePriv, tweak);
  if (!tweaked) throw new CryptoError("Tweaked private key is invalid (zero)");
  return Buffer.from(tweaked);
}
async function signPsbtFromSeedInternal(seed, psbtBase64, network, options = {}, deps) {
  validatePsbt(psbtBase64, "psbtBase64");
  const { ecc, factory, Psbt, networks, toXOnly } = deps;
  const bip32 = factory(ecc);
  const seedBuffer = normalizeSeedBuffer(seed);
  const versions = getNetworkVersions2(network);
  let rootNode;
  try {
    rootNode = bip32.fromSeed(seedBuffer, versions);
  } catch (error) {
    throw new CryptoError(
      "Failed to derive root node from seed",
      error
    );
  }
  if (!globalThis.__nodeCrypto) {
    try {
      const nodeCryptoPath = "node:crypto";
      globalThis.__nodeCrypto = await import(nodeCryptoPath);
    } catch {
    }
  }
  const fp = await getMasterFingerprint(rootNode);
  const psbtType = detectPsbtType(psbtBase64, deps);
  const needsPreprocessing = psbtType === "send";
  let processedPsbt = psbtBase64.trim();
  if (needsPreprocessing || options.preprocess) {
    try {
      processedPsbt = preprocessPsbtForBDK(
        psbtBase64,
        rootNode,
        fp,
        network,
        deps
      );
    } catch (error) {
      throw new CryptoError("Failed to preprocess PSBT", error);
    }
  }
  if (!Psbt || !networks) {
    throw new CryptoError("BitcoinJS modules not loaded");
  }
  const bjsNet = network === "mainnet" ? networks.bitcoin : networks.testnet;
  let psbt;
  try {
    psbt = Psbt.fromBase64(processedPsbt, { network: bjsNet });
  } catch (error) {
    throw new CryptoError("Failed to parse PSBT", error);
  }
  const fingerprintBuf = Buffer.from(fp, "hex");
  const auxRand = Buffer.alloc(32, 0);
  let signed = false;
  try {
    for (let i = 0; i < psbt.inputCount; i++) {
      const input = psbt.data.inputs[i];
      if (input.tapBip32Derivation && input.tapBip32Derivation.length > 0) {
        for (const deriv of input.tapBip32Derivation) {
          const derivFp = Buffer.from(deriv.masterFingerprint);
          if (!derivFp.equals(fingerprintBuf)) continue;
          let pathStr = pathToString(normalizePath(deriv.path));
          if (!pathStr.startsWith("m/")) pathStr = "m/" + pathStr;
          try {
            const derivedNode = rootNode.derivePath(pathStr);
            const privKey = derivedNode.privateKey;
            if (!privKey) continue;
            const privKeyBuf = privKey instanceof Buffer ? privKey : Buffer.from(privKey);
            const pubkeyBuf = derivedNode.publicKey instanceof Buffer ? derivedNode.publicKey : Buffer.from(derivedNode.publicKey);
            const xOnlyPubkey = toXOnly(pubkeyBuf);
            const tweakedPrivKey = tweakPrivateKey(ecc, privKeyBuf, xOnlyPubkey);
            const tweakedPub = ecc.pointFromScalar(tweakedPrivKey);
            const tweakedXOnly = tweakedPub.length === 33 ? Buffer.from(tweakedPub.slice(1)) : Buffer.from(tweakedPub);
            const signer = {
              publicKey: tweakedXOnly,
              signSchnorr: (hash) => {
                return Buffer.from(
                  ecc.signSchnorr(hash, tweakedPrivKey, auxRand)
                );
              }
            };
            psbt.signTaprootInput(i, signer);
            signed = true;
          } catch (_e) {
          }
          break;
        }
      }
    }
    if (!signed) {
      const alreadyFinalized = Array.from(
        { length: psbt.inputCount },
        (_, i) => psbt.data.inputs[i]
      ).some((inp) => inp.finalScriptWitness);
      if (alreadyFinalized) {
        return psbt.toBase64().trim();
      }
      throw new Error("No inputs were signed \u2014 derivation paths did not match");
    }
    psbt.finalizeAllInputs();
    for (let oi = 0; oi < psbt.data.outputs.length; oi++) {
      const output = psbt.data.outputs[oi];
      if (output.tapBip32Derivation) {
        delete output.tapBip32Derivation;
      }
      if (output.unknownKeyVals) {
        const txOutput = psbt.txOutputs[oi];
        const script = txOutput?.script;
        if (script && script[0] === 106 && script.length >= 34) {
          const opReturnData = script.subarray(2, 34);
          for (const kv of output.unknownKeyVals) {
            const keyHex = Buffer.from(kv.key).toString("hex");
            if (keyHex.startsWith("fc054f505245")) {
              kv.value = opReturnData;
            }
          }
        }
      }
    }
  } catch (error) {
    if (error instanceof CryptoError) throw error;
    throw new CryptoError("Failed to sign PSBT", error);
  }
  return psbt.toBase64().trim();
}
async function signPsbt(mnemonic, psbtBase64, network = "testnet", options = {}) {
  try {
    validateMnemonic(mnemonic, "mnemonic");
    const { bip39 } = await ensureBaseDependencies();
    if (!bip39 || typeof bip39.mnemonicToSeedSync !== "function") {
      throw new CryptoError("bip39 module not loaded correctly");
    }
    let seed;
    try {
      seed = bip39.mnemonicToSeedSync(mnemonic);
    } catch (_error) {
      throw new ValidationError("Invalid mnemonic format", "mnemonic");
    }
    const normalizedNetwork = normalizeNetwork(network);
    const deps = await ensureSignerDependencies();
    return await signPsbtFromSeedInternal(
      seed,
      psbtBase64,
      normalizedNetwork,
      options,
      deps
    );
  } catch (error) {
    if (error instanceof ValidationError || error instanceof CryptoError) {
      throw error;
    }
    throw new CryptoError(
      "Unexpected error during PSBT signing",
      error
    );
  }
}
async function signPsbtSync(mnemonic, psbtBase64, network = "testnet", options = {}) {
  return signPsbt(mnemonic, psbtBase64, network, options);
}
async function signPsbtFromSeed(seed, psbtBase64, network = "testnet", options = {}) {
  const normalizedSeed = normalizeSeedInput(seed);
  const normalizedNetwork = normalizeNetwork(network);
  const deps = await ensureSignerDependencies();
  return signPsbtFromSeedInternal(
    normalizedSeed,
    psbtBase64,
    normalizedNetwork,
    options,
    deps
  );
}
function ensureMessageInput(message) {
  if (typeof message === "string") {
    if (!message.length) {
      throw new ValidationError("message must not be empty", "message");
    }
    return Buffer.from(message, "utf8");
  }
  if (message instanceof Uint8Array) {
    if (!message.length) {
      throw new ValidationError("message must not be empty", "message");
    }
    return Buffer.from(message);
  }
  throw new ValidationError(
    "message must be a string or Uint8Array",
    "message"
  );
}
async function deriveRootFromSeedInput(seed, network) {
  const { ecc, factory } = await ensureBaseDependencies();
  const normalizedSeed = normalizeSeedInput(seed, "seed");
  const versions = getNetworkVersions2(network);
  const bip32 = factory(ecc);
  try {
    return bip32.fromSeed(normalizedSeed, versions);
  } catch (error) {
    throw new CryptoError(
      "Failed to create BIP32 root node from seed",
      error
    );
  }
}
var DEFAULT_RELATIVE_PATH = "0/0";
async function signMessage(params) {
  const { message, seed } = params;
  if (!seed) {
    throw new ValidationError("seed is required", "seed");
  }
  const normalizedNetwork = normalizeNetwork(params.network ?? "regtest");
  const relativePath = DEFAULT_RELATIVE_PATH;
  const accountPath = accountDerivationPath(normalizedNetwork, false);
  const messageBytes = ensureMessageInput(message);
  const { ecc } = await ensureBaseDependencies();
  const root = await deriveRootFromSeedInput(seed, normalizedNetwork);
  const accountNode = root.derivePath(accountPath);
  const child = accountNode.derivePath(relativePath);
  const privateKey = child.privateKey;
  if (!privateKey) {
    throw new CryptoError("Derived node does not contain a private key");
  }
  if (!ecc || typeof ecc.signSchnorr !== "function") {
    throw new CryptoError("Schnorr signing not supported by ECC module");
  }
  const messageHash = await sha256(messageBytes);
  const signature = Buffer.from(
    ecc.signSchnorr(messageHash, privateKey)
  ).toString("base64");
  return signature;
}
async function verifyMessage(params) {
  const { message, signature, accountXpub } = params;
  const messageBytes = ensureMessageInput(message);
  const relativePath = DEFAULT_RELATIVE_PATH;
  const signatureBytes = Buffer.from(signature, "base64");
  const normalizedNetwork = normalizeNetwork(params.network ?? "regtest");
  const versions = getNetworkVersions2(normalizedNetwork);
  const { ecc, factory } = await ensureBaseDependencies();
  if (!ecc || typeof ecc.verifySchnorr !== "function" || typeof ecc.xOnlyPointFromPoint !== "function") {
    throw new CryptoError("Schnorr verification not supported by ECC module");
  }
  let accountNode;
  try {
    accountNode = factory(ecc).fromBase58(accountXpub, versions);
  } catch (_error) {
    throw new ValidationError("Invalid account xpub provided", "accountXpub");
  }
  const child = accountNode.derivePath(relativePath);
  const pubkeyBuffer = child.publicKey instanceof Buffer ? child.publicKey : Buffer.from(child.publicKey);
  const xOnlyPubkey = ecc.xOnlyPointFromPoint(pubkeyBuffer);
  const messageHash = await sha256(messageBytes);
  try {
    return ecc.verifySchnorr(messageHash, xOnlyPubkey, signatureBytes);
  } catch {
    return false;
  }
}
async function estimatePsbt(psbtBase64) {
  if (!psbtBase64) {
    throw new ValidationError("psbt is required", "psbt");
  }
  const { Psbt } = await ensureSignerDependencies();
  if (!Psbt) {
    throw new CryptoError("BitcoinJS Psbt module not loaded");
  }
  let psbt;
  try {
    psbt = Psbt.fromBase64(psbtBase64.trim());
    return {
      fee: psbt.getFee(),
      feeRate: psbt.getFeeRate(),
      vbytes: psbt.extractTransaction().virtualSize()
    };
  } catch (error) {
    console.log("error", error);
    throw new ValidationError("Invalid PSBT provided", "psbt");
  }
}
var VSS_SIGNING_KEY_DOMAIN = "rgb-lib-vss-backup-encryption-v1";
function deriveVssSigningKeyFromMnemonic(mnemonic) {
  validateMnemonic(mnemonic, "mnemonic");
  const keyBytes = new TextEncoder().encode(VSS_SIGNING_KEY_DOMAIN);
  const messageBytes = new TextEncoder().encode(mnemonic.trim());
  const digest = hmac_js.hmac(sha2_js.sha256, keyBytes, messageBytes);
  return Array.from(digest).map((b) => b.toString(16).padStart(2, "0")).join("");
}
var restoreFromBackup = async (params) => {
  const { backupFilePath, password, dataDir } = params;
  if (!backupFilePath) {
    throw new ValidationError("backup file is required", "backup");
  }
  if (!password) {
    throw new ValidationError("password is required", "password");
  }
  if (!dataDir) {
    throw new ValidationError("restore directory is required", "restoreDir");
  }
  return await restoreWallet({
    backupFilePath,
    password,
    dataDir
  });
};
var createWallet = async (network = "regtest") => {
  return await generateKeys2(network);
};
var WalletManager = class {
  constructor(params) {
    this.disposed = false;
    if (!params.xpubVan) {
      throw new ValidationError("xpubVan is required", "xpubVan");
    }
    if (!params.xpubCol) {
      throw new ValidationError("xpubCol is required", "xpubCol");
    }
    if (!params.masterFingerprint) {
      throw new ValidationError(
        "masterFingerprint is required",
        "masterFingerprint"
      );
    }
    this.network = normalizeNetwork(params.network ?? "regtest");
    this.xpubVan = params.xpubVan;
    this.xpubCol = params.xpubCol;
    this.seed = params.seed ?? null;
    this.mnemonic = params.mnemonic ?? null;
    this.xpub = params.xpub ?? null;
    this.masterFingerprint = params.masterFingerprint;
    this.dataDir = params.dataDir ?? path3__namespace.default.join(
      process.cwd(),
      ".rgb-wallet",
      this.network,
      this.masterFingerprint
    );
    this._initParams = params;
  }
  async initialize() {
    if (this.client) return;
    const params = this._initParams;
    this.client = await RGBLibClient.create({
      xpubVan: params.xpubVan,
      xpubCol: params.xpubCol,
      masterFingerprint: params.masterFingerprint,
      network: this.network,
      transportEndpoint: params.transportEndpoint,
      indexerUrl: params.indexerUrl,
      dataDir: params.dataDir ?? this.dataDir
    });
  }
  async goOnline() {
    this.client.getOnline();
  }
  /**
   * Get wallet's extended public keys
   */
  getXpub() {
    return {
      xpubVan: this.xpubVan,
      xpubCol: this.xpubCol
    };
  }
  /**
   * Get wallet's network
   */
  getNetwork() {
    return this.network;
  }
  /**
   * Dispose of sensitive wallet data
   * Clears mnemonic and seed from memory
   * Idempotent - safe to call multiple times
   */
  async dispose() {
    if (this.disposed) {
      return;
    }
    if (this.mnemonic !== null) {
      this.mnemonic = null;
    }
    if (this.seed !== null && this.seed.length > 0) {
      this.seed.fill(0);
      this.seed = null;
    }
    this.client.dropWallet();
    this.disposed = true;
  }
  /**
   * Check if wallet has been disposed
   */
  isDisposed() {
    return this.disposed;
  }
  /**
   * Guard method to ensure wallet has not been disposed
   * @throws {WalletError} if wallet has been disposed
   */
  ensureNotDisposed() {
    if (this.disposed) {
      throw new WalletError("Wallet has been disposed");
    }
  }
  registerWallet() {
    return this.client.registerWallet();
  }
  async getBtcBalance() {
    return this.client.getBtcBalance();
  }
  async getAddress() {
    return this.client.getAddress();
  }
  async listUnspents() {
    const unspents = this.client.listUnspents();
    return unspents.map((unspent) => ({
      utxo: {
        ...unspent.utxo,
        exists: unspent.utxo.exists ?? true
      },
      rgbAllocations: unspent.rgbAllocations.map((allocation) => {
        const assignmentKeys = Object.keys(allocation.assignment);
        const assignmentType = assignmentKeys[0];
        const assignment = {
          type: assignmentType ?? "Any",
          amount: assignmentType && allocation.assignment[assignmentType] ? Number(allocation.assignment[assignmentType]) : void 0
        };
        return {
          assetId: allocation.assetId,
          assignment,
          settled: allocation.settled
        };
      }),
      pendingBlinded: unspent.pendingBlinded ?? 0
    }));
  }
  async listAssets() {
    const assets = this.client.listAssets();
    return assets;
  }
  async getAssetBalance(asset_id) {
    const balance = this.client.getAssetBalance(asset_id);
    return {
      settled: balance.settled ?? 0,
      future: balance.future ?? 0,
      spendable: balance.spendable ?? 0,
      offchainOutbound: balance.offchainOutbound ?? 0,
      offchainInbound: balance.offchainInbound ?? 0
    };
  }
  async createUtxosBegin(params) {
    return this.client.createUtxosBegin(params);
  }
  async createUtxosEnd(params) {
    return this.client.createUtxosEnd(params);
  }
  async sendBegin(params) {
    return this.client.sendBegin(params);
  }
  /**
   * Batch send begin: accepts already-built recipientMap.
   * Returns unsigned PSBT (use signPsbt then sendEnd to complete).
   */
  async sendBeginBatch(params) {
    return this.client.sendBeginBatch(params);
  }
  /**
   * Complete batch send: sendBeginBatch → sign PSBT → sendEnd.
   */
  async sendBatch(params, mnemonic) {
    this.ensureNotDisposed();
    const psbt = await this.sendBeginBatch(params);
    const signedPsbt = await this.signPsbt(psbt, mnemonic);
    return await this.sendEnd({ signedPsbt });
  }
  async sendEnd(params) {
    return this.client.sendEnd(params);
  }
  async sendBtcBegin(params) {
    return this.client.sendBtcBegin(params);
  }
  async sendBtcEnd(params) {
    return this.client.sendBtcEnd(params);
  }
  async estimateFeeRate(blocks) {
    if (!Number.isFinite(blocks)) {
      throw new ValidationError("blocks must be a finite number", "blocks");
    }
    if (!Number.isInteger(blocks) || blocks <= 0) {
      throw new ValidationError("blocks must be a positive integer", "blocks");
    }
    const feeEstimation = await this.client.getFeeEstimation({ blocks });
    return feeEstimation;
  }
  async estimateFee(psbtBase64) {
    return await estimatePsbt(psbtBase64);
  }
  async sendBtc(params) {
    this.ensureNotDisposed();
    const psbt = await this.sendBtcBegin(params);
    const signed = await this.signPsbt(psbt);
    return await this.sendBtcEnd({ signedPsbt: signed });
  }
  async blindReceive(params) {
    const invoice = await this.client.blindReceive({
      ...params,
      assetId: params.assetId ?? "",
      amount: params.amount ?? 0
    });
    return {
      invoice: invoice.invoice,
      recipientId: invoice.recipientId,
      expirationTimestamp: invoice.expirationTimestamp ?? null,
      batchTransferIdx: invoice.batchTransferIdx
    };
  }
  async witnessReceive(params) {
    const invoice = await this.client.witnessReceive({
      ...params,
      assetId: params.assetId ?? "",
      amount: params.amount ?? 0
    });
    return {
      invoice: invoice.invoice,
      recipientId: invoice.recipientId,
      expirationTimestamp: invoice.expirationTimestamp ?? null,
      batchTransferIdx: invoice.batchTransferIdx
    };
  }
  async decodeRGBInvoice(params) {
    const invoiceData = await this.client.decodeRGBInvoice(params);
    const assignmentKeys = Object.keys(invoiceData.assignment);
    const assignmentType = assignmentKeys[0];
    const assignment = {
      type: assignmentType ?? "Any",
      amount: assignmentType && invoiceData.assignment[assignmentType] ? Number(invoiceData.assignment[assignmentType]) : void 0
    };
    return {
      invoice: params.invoice,
      recipientId: invoiceData.recipientId,
      assetSchema: invoiceData.assetSchema,
      assetId: invoiceData.assetId,
      network: invoiceData.network,
      assignment,
      assignmentName: invoiceData.assignmentName,
      expirationTimestamp: invoiceData.expirationTimestamp ?? null,
      transportEndpoints: invoiceData.transportEndpoints
    };
  }
  async issueAssetNia(params) {
    const asset = await this.client.issueAssetNia(params);
    return asset;
  }
  async issueAssetIfa(params) {
    const asset = await this.client.issueAssetIfa(params);
    return asset;
  }
  async inflateBegin(params) {
    return this.client.inflateBegin(params);
  }
  async inflateEnd(params) {
    return this.client.inflateEnd(params);
  }
  /**
   * Complete inflate operation: begin → sign → end
   * @param params - Inflate parameters
   * @param mnemonic - Optional mnemonic for signing
   */
  async inflate(params, mnemonic) {
    this.ensureNotDisposed();
    const psbt = await this.inflateBegin(params);
    const signedPsbt = await this.signPsbt(psbt, mnemonic);
    return await this.inflateEnd({
      signedPsbt
    });
  }
  async refreshWallet() {
    this.client.refreshWallet();
  }
  async listTransactions() {
    const transactions = this.client.listTransactions();
    return transactions;
  }
  async listTransfers(asset_id) {
    const transfers = this.client.listTransfers(asset_id);
    return transfers;
  }
  async failTransfers(params) {
    return this.client.failTransfers(params);
  }
  async createBackup(params) {
    return this.client.createBackup(params);
  }
  /**
   * Configure VSS cloud backup for this wallet.
   */
  async configureVssBackup(config) {
    this.ensureNotDisposed();
    this.client.configureVssBackup(config);
  }
  /**
   * Disable automatic VSS backup.
   */
  async disableVssAutoBackup() {
    this.ensureNotDisposed();
    this.client.disableVssAutoBackup();
  }
  /**
   * Trigger a VSS backup immediately and return the server version.
   */
  async vssBackup(config) {
    this.ensureNotDisposed();
    return this.client.vssBackup(config);
  }
  /**
   * Get VSS backup info for this wallet.
   */
  async vssBackupInfo(config) {
    this.ensureNotDisposed();
    return this.client.vssBackupInfo(config);
  }
  /**
   * Sign a PSBT using the wallet's mnemonic or a provided mnemonic
   * @param psbt - Base64 encoded PSBT
   * @param mnemonic - Optional mnemonic (uses wallet's mnemonic if not provided)
   */
  async signPsbt(psbt, mnemonic) {
    this.ensureNotDisposed();
    const mnemonicToUse = mnemonic ?? this.mnemonic;
    if (mnemonicToUse) {
      return await signPsbt(mnemonicToUse, psbt, this.network);
    }
    if (this.seed) {
      return await signPsbtFromSeed(this.seed, psbt, this.network);
    }
    throw new WalletError(
      "mnemonic is required. Provide it as parameter or initialize wallet with mnemonic."
    );
  }
  /**
   * Complete send operation: begin → sign → end
   * @param invoiceTransfer - Transfer invoice parameters
   * @param mnemonic - Optional mnemonic for signing
   */
  async send(invoiceTransfer, mnemonic) {
    this.ensureNotDisposed();
    const psbt = await this.sendBegin(invoiceTransfer);
    const signedPsbt = await this.signPsbt(psbt, mnemonic);
    return await this.sendEnd({ signedPsbt });
  }
  async createUtxos({
    upTo,
    num,
    size,
    feeRate
  }) {
    this.ensureNotDisposed();
    const psbt = await this.createUtxosBegin({ upTo, num, size, feeRate });
    const signedPsbt = await this.signPsbt(psbt);
    return this.createUtxosEnd({ signedPsbt });
  }
  async syncWallet() {
    this.client.syncWallet();
  }
  async signMessage(message) {
    this.ensureNotDisposed();
    if (!message) {
      throw new ValidationError("message is required", "message");
    }
    if (!this.seed) {
      throw new WalletError(
        "Wallet seed is required for message signing. Initialize the wallet with a seed."
      );
    }
    return signMessage({
      message,
      seed: this.seed,
      network: this.network
    });
  }
  async verifyMessage(message, signature, accountXpub) {
    if (!message) {
      throw new ValidationError("message is required", "message");
    }
    if (!signature) {
      throw new ValidationError("signature is required", "signature");
    }
    return verifyMessage({
      message,
      signature,
      accountXpub: accountXpub ?? this.xpubVan,
      network: this.network
    });
  }
};
function createWalletManager(params) {
  return new WalletManager(params);
}
var wallet = new Proxy({}, {
  get(target, prop) {
    {
      throw new WalletError(
        "The legacy singleton wallet instance is deprecated. Please use `new WalletManager(params)` or `createWalletManager(params)` instead. Example: const wallet = new WalletManager({ xpubVan, xpubCol, masterFingerprint, network, transportEndpoint, indexerUrl })"
      );
    }
  }
});

// src/utexo/utexo-protocol.ts
var LightningProtocol = class {
  async createLightningInvoice(_params) {
    throw new Error("createLightningInvoice not implemented");
  }
  async getLightningReceiveRequest(_id) {
    throw new Error("getLightningReceiveRequest not implemented");
  }
  async getLightningSendRequest(_id) {
    throw new Error("getLightningSendRequest not implemented");
  }
  async getLightningSendFeeEstimate(_params) {
    throw new Error("getLightningSendFeeEstimate not implemented");
  }
  async payLightningInvoiceBegin(_params) {
    throw new Error("payLightningInvoiceBegin not implemented");
  }
  async payLightningInvoiceEnd(_params) {
    throw new Error("payLightningInvoiceEnd not implemented");
  }
  async payLightningInvoice(_params, _mnemonic) {
    throw new Error("payLightningInvoice not implemented");
  }
  async listLightningPayments() {
    throw new Error("listLightningPayments not implemented");
  }
};
var OnchainProtocol = class {
  async onchainReceive(_params) {
    throw new Error("onchainReceive not implemented");
  }
  async onchainSendBegin(_params) {
    throw new Error("onchainSendBegin not implemented");
  }
  async onchainSendEnd(_params) {
    throw new Error("onchainSendEnd not implemented");
  }
  async onchainSend(_params, _mnemonic) {
    throw new Error("onchainSend not implemented");
  }
  async getOnchainSendStatus(_send_id) {
    throw new Error("getOnchainSendStatus not implemented");
  }
  async listOnchainTransfers(_asset_id) {
    throw new Error("listOnchainTransfers not implemented");
  }
};
var UTEXOProtocol = class extends LightningProtocol {
  constructor() {
    super(...arguments);
    this.onchainProtocol = new OnchainProtocol();
  }
  async onchainReceive(params) {
    return this.onchainProtocol.onchainReceive(params);
  }
  async onchainSendBegin(params) {
    return this.onchainProtocol.onchainSendBegin(params);
  }
  async onchainSendEnd(params) {
    return this.onchainProtocol.onchainSendEnd(params);
  }
  async onchainSend(params, mnemonic) {
    return this.onchainProtocol.onchainSend(params, mnemonic);
  }
  async getOnchainSendStatus(send_id) {
    return this.onchainProtocol.getOnchainSendStatus(send_id);
  }
  async listOnchainTransfers(asset_id) {
    return this.onchainProtocol.listOnchainTransfers(asset_id);
  }
};

// src/utexo/config/gateway.ts
var DEFAULT_GATEWAY_BASE_URLS = {
  mainnet: "https://gateway.utexo.utexo.com/",
  testnet: "https://dev.gateway.utexo.tricorn.network/"
};

// src/utexo/bridge/types.ts
var TransferStatuses = /* @__PURE__ */ ((TransferStatuses2) => {
  TransferStatuses2[TransferStatuses2["Unspecified"] = 0] = "Unspecified";
  TransferStatuses2[TransferStatuses2["Confirming"] = 1] = "Confirming";
  TransferStatuses2[TransferStatuses2["Canceled"] = 2] = "Canceled";
  TransferStatuses2[TransferStatuses2["Finished"] = 3] = "Finished";
  TransferStatuses2[TransferStatuses2["Waiting"] = 4] = "Waiting";
  TransferStatuses2[TransferStatuses2["Cancelling"] = 5] = "Cancelling";
  TransferStatuses2[TransferStatuses2["Failed"] = 6] = "Failed";
  TransferStatuses2[TransferStatuses2["Fetching"] = 7] = "Fetching";
  return TransferStatuses2;
})(TransferStatuses || {});

// src/utexo/bridge/api.ts
var encodeTransferStatus = (transferStatus) => {
  const textEncoder = new TextEncoder();
  return textEncoder.encode(transferStatus.toString())[0];
};
var UtexoBridgeApiClient = class {
  /**
   * Creates a new UtexoBridgeApiClient instance
   *
   * @param axiosInstance - Axios instance to use for HTTP requests (required)
   * @param basePath - Base path for API endpoints (defaults to '/v1/utexo/bridge')
   *
   * @example
   * ```typescript
   * import axios from 'axios';
   * import { UtexoBridgeApiClient } from './utexoBridge';
   *
   * const axiosInstance = axios.create({
   *   baseURL: 'https://api.example.com'
   * });
   *
   * const client = new UtexoBridgeApiClient(axiosInstance);
   * ```
   */
  constructor(axiosInstance, basePath = "/v1/utexo/bridge") {
    this.axios = axiosInstance;
    this.basePath = basePath;
  }
  /**
   * Gets bridge-in signature for a transfer
   *
   * @param request - Bridge-in signature request data
   * @returns Promise resolving to bridge-in signature response
   * @throws {ApiError} If the request fails
   */
  async getBridgeInSignature(request) {
    try {
      const { data } = await this.axios.post(
        `${this.basePath}/bridge-in-signature`,
        request
      );
      return data;
    } catch (error) {
      const responseData = error.response?.data;
      if (responseData !== void 0) {
        const message = typeof responseData === "string" ? responseData : JSON.stringify(responseData);
        throw new Error(message);
      }
      throw error;
    }
  }
  /**
   * Submits a signed transaction to the blockchain
   *
   * @param request - Submit transaction request data
   * @returns Promise resolving to transaction hash
   * @throws {ApiError} If the request fails
   */
  async submitTransaction(request) {
    const { data } = await this.axios.post(
      `${this.basePath}/submit-transaction`,
      request
    );
    return data.txHash;
  }
  /**
   * Verifies a bridge-in transaction after it has been sent
   *
   * @param request - Verify bridge-in request data
   * @returns Promise that resolves when verification is complete
   * @throws {ApiError} If the request fails
   */
  async verifyBridgeIn(request) {
    await this.axios.post(`${this.basePath}/verify-bridge-in`, request);
  }
  /**
   * Gets receiver invoice by transfer ID and network ID
   *
   * @param transferId - Transfer ID
   * @param networkId - Network ID
   * @returns Promise resolving to invoice string
   * @throws {ApiError} If the request fails
   */
  async getReceiverInvoice(transferId, networkId) {
    const { data } = await this.axios.get(
      `${this.basePath}/receiver-invoice/${transferId}/${networkId}`
    );
    return data.invoice;
  }
  async getWithdrawTransfer(invoice, networkId) {
    const { data } = await this.axios.get(`${this.basePath}/transfers/history`, {
      params: {
        network_id: String(networkId),
        offset: String(0),
        limit: String(10),
        address: "rgb-address"
      }
    });
    if (data.transfers.length === 0) {
      return null;
    }
    const withdrawTransfer = data.transfers.map((transfer) => ({
      ...transfer,
      status: TransferStatuses[encodeTransferStatus(transfer.status)]
    })).find((transfer) => transfer.recipient.address === invoice);
    if (!withdrawTransfer) {
      return null;
    }
    return withdrawTransfer;
  }
  /**
   * Gets transfer information by mainnet invoice
   *
   * @param mainnetInvoice - Mainnet invoice string
   * @param networkId - Network ID
   * @returns Promise resolving to transfer information
   * @throws {ApiError} If the request fails
   */
  async getTransferByMainnetInvoice(mainnetInvoice, networkId) {
    try {
      const { data } = await this.axios.get(
        `${this.basePath}/transfer-by-mainnet-invoice`,
        {
          params: {
            mainnet_invoice: mainnetInvoice,
            network_id: networkId
          }
        }
      );
      if (data) {
        return {
          ...data,
          status: TransferStatuses[encodeTransferStatus(data.status)]
        };
      }
      return data;
    } catch (_error) {
      console.log("Mainnet invoice not found");
      return null;
    }
  }
};
function getBridgeAPI(network = "mainnet") {
  const axiosInstance = axios__default.default.create({
    baseURL: DEFAULT_GATEWAY_BASE_URLS[network]
  });
  return new UtexoBridgeApiClient(axiosInstance);
}

// src/utexo/utils/helpers.ts
var UTXO_PATH_INDEX = 2;
function toUnitsNumber(value, precision) {
  const s = String(value).trim();
  const neg = s.startsWith("-");
  const [iRaw, fRaw = ""] = (neg ? s.slice(1) : s).split(".");
  const frac = (fRaw + "0".repeat(precision)).slice(0, precision);
  const unitsStr = (iRaw || "0") + frac;
  const units = Number(unitsStr);
  if (!Number.isSafeInteger(units)) {
    throw new Error(
      `Amount exceeds MAX_SAFE_INTEGER. Use BigInt instead. got=${unitsStr}`
    );
  }
  return neg ? -units : units;
}
function fromUnitsNumber(units, precision) {
  const neg = units < 0;
  const base = 10 ** precision;
  const value = Math.abs(units) / base;
  return neg ? -value : value;
}
function decodeBridgeInvoice(hexInvoice) {
  const hex = hexInvoice.startsWith("0x") ? hexInvoice.slice(UTXO_PATH_INDEX) : hexInvoice;
  return Buffer.from(hex, "hex").toString("utf-8");
}

// src/utexo/config/vss.ts
var DEFAULT_VSS_SERVER_URL = "https://vss-server.utexo.com/vss";
function getVssConfigs(config) {
  const base = { ...config };
  return {
    layer1: { ...base, storeId: `${config.storeId}_layer1` },
    utexo: { ...base, storeId: `${config.storeId}_utexo` }
  };
}
var BACKUP_FILE_SUFFIX = ".backup";
var LAYER1_BACKUP_SUFFIX = "_layer1.backup";
var UTEXO_BACKUP_SUFFIX = "_utexo.backup";
var UTEXO_BACKUP_TMP_LAYER1 = ".layer1";
var UTEXO_BACKUP_TMP_UTEXO = ".utexo";
function getBackupStoreId(masterFingerprint) {
  return `wallet_${masterFingerprint}`;
}
function prepareUtxoBackupDirs(backupPath, masterFingerprint) {
  const storeId = getBackupStoreId(masterFingerprint);
  if (!fs2__namespace.default.existsSync(backupPath)) {
    fs2__namespace.default.mkdirSync(backupPath, { recursive: true });
  }
  const layer1TmpDir = path3__namespace.default.join(backupPath, UTEXO_BACKUP_TMP_LAYER1);
  const utexoTmpDir = path3__namespace.default.join(backupPath, UTEXO_BACKUP_TMP_UTEXO);
  fs2__namespace.default.mkdirSync(layer1TmpDir, { recursive: true });
  fs2__namespace.default.mkdirSync(utexoTmpDir, { recursive: true });
  return {
    storeId,
    layer1TmpDir,
    utexoTmpDir,
    layer1FinalPath: path3__namespace.default.join(
      backupPath,
      `${storeId}_layer1${BACKUP_FILE_SUFFIX}`
    ),
    utexoFinalPath: path3__namespace.default.join(
      backupPath,
      `${storeId}_utexo${BACKUP_FILE_SUFFIX}`
    )
  };
}
function finalizeUtxoBackupPaths(params) {
  const {
    layer1BackupPath,
    utexoBackupPath,
    layer1FinalPath,
    utexoFinalPath,
    layer1TmpDir,
    utexoTmpDir
  } = params;
  fs2__namespace.default.renameSync(layer1BackupPath, layer1FinalPath);
  fs2__namespace.default.renameSync(utexoBackupPath, utexoFinalPath);
  fs2__namespace.default.rmdirSync(layer1TmpDir);
  fs2__namespace.default.rmdirSync(utexoTmpDir);
}
async function buildVssConfigFromMnemonic(mnemonic, serverUrl, networkPreset = "testnet") {
  const keys = await deriveKeysFromMnemonic(networkPreset, mnemonic.trim());
  return {
    serverUrl,
    storeId: `wallet_${keys.masterFingerprint}`,
    signingKey: deriveVssSigningKeyFromMnemonic(mnemonic.trim()),
    backupMode: "Blocking"
  };
}
async function restoreUtxoWalletFromVss(params) {
  const {
    mnemonic,
    targetDir,
    config: providedConfig,
    networkPreset = "testnet",
    vssServerUrl
  } = params;
  if (!mnemonic || !mnemonic.trim()) {
    throw new ValidationError("mnemonic is required", "mnemonic");
  }
  if (!targetDir) {
    throw new ValidationError("targetDir is required", "targetDir");
  }
  const serverUrl = vssServerUrl ?? DEFAULT_VSS_SERVER_URL;
  const config = providedConfig ?? await buildVssConfigFromMnemonic(
    mnemonic.trim(),
    serverUrl,
    networkPreset
  );
  const presetConfig = getUtxoNetworkConfig(networkPreset);
  const layer1Network = String(presetConfig.networkMap.mainnet);
  const utexoNetwork = String(presetConfig.networkMap.utexo);
  const masterFingerprint = config.storeId.replace(/^wallet_/, "") || config.storeId;
  const layer1Config = {
    ...config,
    storeId: `${config.storeId}_layer1`
  };
  const utexoConfig = {
    ...config,
    storeId: `${config.storeId}_utexo`
  };
  const { walletPath: layer1Path } = await restoreFromVss({
    config: layer1Config,
    targetDir: path3__namespace.default.join(targetDir, layer1Network, masterFingerprint)
  });
  const { walletPath: utexoPath } = await restoreFromVss({
    config: utexoConfig,
    targetDir: path3__namespace.default.join(targetDir, utexoNetwork, masterFingerprint)
  });
  return { layer1Path, utexoPath, targetDir };
}
function restoreUtxoWalletFromBackup(params) {
  const { backupPath, password, targetDir, networkPreset = "testnet" } = params;
  if (!backupPath || !password || !targetDir) {
    throw new ValidationError(
      "backupPath, password, and targetDir are required",
      "restoreUtxoWalletFromBackup"
    );
  }
  if (!fs2__namespace.default.existsSync(backupPath) || !fs2__namespace.default.statSync(backupPath).isDirectory()) {
    throw new ValidationError(
      "backupPath must be an existing directory",
      "backupPath"
    );
  }
  const files = fs2__namespace.default.readdirSync(backupPath);
  const layer1File = files.find((f) => f.endsWith(LAYER1_BACKUP_SUFFIX));
  const utexoFile = files.find((f) => f.endsWith(UTEXO_BACKUP_SUFFIX));
  if (!layer1File || !utexoFile) {
    throw new ValidationError(
      `backupPath must contain wallet_<fp>_layer1.backup and wallet_<fp>_utexo.backup (from createBackup)`,
      "backupPath"
    );
  }
  const masterFingerprint = layer1File.slice(0, -LAYER1_BACKUP_SUFFIX.length).replace(/^wallet_/, "");
  const expectedUtexoFile = `wallet_${masterFingerprint}${UTEXO_BACKUP_SUFFIX}`;
  if (utexoFile !== expectedUtexoFile) {
    throw new ValidationError(
      `Layer1 and utexo backup filenames must share the same wallet id (expected ${expectedUtexoFile})`,
      "backupPath"
    );
  }
  const layer1BackupFile = path3__namespace.default.join(backupPath, layer1File);
  const utexoBackupFile = path3__namespace.default.join(backupPath, utexoFile);
  if (!fs2__namespace.default.existsSync(layer1BackupFile) || !fs2__namespace.default.existsSync(utexoBackupFile)) {
    throw new ValidationError("Backup files not found", "backupPath");
  }
  const presetConfig = getUtxoNetworkConfig(networkPreset);
  const layer1Network = String(presetConfig.networkMap.mainnet);
  const utexoNetwork = String(presetConfig.networkMap.utexo);
  const layer1DataDir = path3__namespace.default.join(targetDir, layer1Network, masterFingerprint);
  const utexoDataDir = path3__namespace.default.join(targetDir, utexoNetwork, masterFingerprint);
  for (const dir of [layer1DataDir, utexoDataDir]) {
    if (!fs2__namespace.default.existsSync(path3__namespace.default.dirname(dir))) {
      fs2__namespace.default.mkdirSync(path3__namespace.default.dirname(dir), { recursive: true });
    }
    if (!fs2__namespace.default.existsSync(dir)) {
      fs2__namespace.default.mkdirSync(dir, { recursive: true });
    }
  }
  restoreWallet({
    backupFilePath: layer1BackupFile,
    password,
    dataDir: layer1DataDir
  });
  restoreWallet({
    backupFilePath: utexoBackupFile,
    password,
    dataDir: utexoDataDir
  });
  return {
    layer1Path: layer1DataDir,
    utexoPath: utexoDataDir,
    targetDir
  };
}

// src/utexo/utexo-wallet.ts
var UTEXOWallet = class extends UTEXOProtocol {
  /**
   * Creates a new UTEXOWallet instance
   * @param mnemonicOrSeed - Either a mnemonic phrase (string) or seed (Uint8Array)
   * @param options - Optional configuration options (defaults to { network: 'mainnet' })
   */
  constructor(mnemonicOrSeed, options = {}) {
    super();
    this.layer1Keys = null;
    this.utexoKeys = null;
    this.layer1RGBWallet = null;
    this.utexoRGBWallet = null;
    this.mnemonicOrSeed = mnemonicOrSeed;
    this.options = options;
    const preset = options.network ?? "mainnet";
    const networkConfig = getUtxoNetworkConfig(preset);
    this.networkMap = networkConfig.networkMap;
    this.networkIdMap = networkConfig.networkIdMap;
    this.bridge = getBridgeAPI(preset);
  }
  async initialize() {
    this.layer1Keys = await this.derivePublicKeys(this.networkMap.mainnet);
    this.utexoKeys = await this.derivePublicKeys(this.networkMap.utexo);
    const fp = this.utexoKeys.masterFingerprint;
    const dataDir = this.options.dataDir;
    this.utexoRGBWallet = new WalletManager({
      xpubVan: this.utexoKeys.accountXpubVanilla,
      xpubCol: this.utexoKeys.accountXpubColored,
      masterFingerprint: this.utexoKeys.masterFingerprint,
      network: this.networkMap.utexo,
      mnemonic: this.mnemonicOrSeed,
      dataDir: dataDir ? path3__namespace.default.join(dataDir, String(this.networkMap.utexo), fp) : void 0
    });
    this.layer1RGBWallet = new WalletManager({
      xpubVan: this.layer1Keys.accountXpubVanilla,
      xpubCol: this.layer1Keys.accountXpubColored,
      masterFingerprint: this.layer1Keys.masterFingerprint,
      network: this.networkMap.mainnet,
      mnemonic: this.mnemonicOrSeed,
      dataDir: dataDir ? path3__namespace.default.join(dataDir, String(this.networkMap.mainnet), fp) : void 0
    });
  }
  /**
   * Derive public keys from mnemonic or seed
   * @param network - BitcoinNetwork identifier
   * @returns Promise resolving to PublicKeys containing xpub, accountXpubVanilla, accountXpubColored, and masterFingerprint
   * @throws {ValidationError} If mnemonic is invalid
   */
  async derivePublicKeys(network) {
    const generatedKeys = await deriveKeysFromMnemonicOrSeed(
      network,
      this.mnemonicOrSeed
    );
    const { xpub, accountXpubVanilla, accountXpubColored, masterFingerprint } = generatedKeys;
    return { xpub, accountXpubVanilla, accountXpubColored, masterFingerprint };
  }
  async getPubKeys() {
    if (!this.layer1Keys) {
      throw new ValidationError("Public keys are not set", "publicKeys");
    }
    return this.layer1Keys;
  }
  /**
   * Guard method to ensure wallet is initialized
   * @throws {WalletError} if wallet is not initialized
   */
  ensureInitialized() {
    if (!this.utexoRGBWallet) {
      throw new WalletError("Wallet not initialized. Call initialize() first.");
    }
  }
  // ==========================================
  // IWalletManager Implementation
  // ==========================================
  async goOnline() {
    this.ensureInitialized();
    throw new Error("goOnline not implemented");
  }
  getXpub() {
    this.ensureInitialized();
    return this.utexoRGBWallet.getXpub();
  }
  getNetwork() {
    this.ensureInitialized();
    return this.utexoRGBWallet.getNetwork();
  }
  async dispose() {
    if (this.layer1RGBWallet) {
      await this.layer1RGBWallet.dispose();
    }
    if (this.utexoRGBWallet) {
      await this.utexoRGBWallet.dispose();
    }
  }
  isDisposed() {
    if (!this.utexoRGBWallet) {
      return false;
    }
    return this.utexoRGBWallet.isDisposed();
  }
  async getBtcBalance() {
    this.ensureInitialized();
    return this.utexoRGBWallet.getBtcBalance();
  }
  async getAddress() {
    this.ensureInitialized();
    return this.utexoRGBWallet.getAddress();
  }
  async listUnspents() {
    this.ensureInitialized();
    return this.utexoRGBWallet.listUnspents();
  }
  async createUtxosBegin(params) {
    this.ensureInitialized();
    return this.utexoRGBWallet.createUtxosBegin(params);
  }
  async createUtxosEnd(params) {
    this.ensureInitialized();
    return this.utexoRGBWallet.createUtxosEnd(params);
  }
  async createUtxos(params) {
    this.ensureInitialized();
    return this.utexoRGBWallet.createUtxos(params);
  }
  async listAssets() {
    this.ensureInitialized();
    return this.utexoRGBWallet.listAssets();
  }
  async getAssetBalance(asset_id) {
    this.ensureInitialized();
    return this.utexoRGBWallet.getAssetBalance(asset_id);
  }
  async issueAssetNia(params) {
    this.ensureInitialized();
    return this.utexoRGBWallet.issueAssetNia(params);
  }
  async issueAssetIfa(params) {
    this.ensureInitialized();
    return this.utexoRGBWallet.issueAssetIfa(params);
  }
  async inflateBegin(params) {
    this.ensureInitialized();
    return this.utexoRGBWallet.inflateBegin(params);
  }
  async inflateEnd(params) {
    this.ensureInitialized();
    return this.utexoRGBWallet.inflateEnd(params);
  }
  async inflate(params, mnemonic) {
    this.ensureInitialized();
    return this.utexoRGBWallet.inflate(params, mnemonic);
  }
  async sendBegin(params) {
    this.ensureInitialized();
    return this.utexoRGBWallet.sendBegin(params);
  }
  async sendEnd(params) {
    this.ensureInitialized();
    return this.utexoRGBWallet.sendEnd(params);
  }
  async send(invoiceTransfer, mnemonic) {
    this.ensureInitialized();
    return this.utexoRGBWallet.send(invoiceTransfer, mnemonic);
  }
  async sendBtcBegin(params) {
    this.ensureInitialized();
    return this.utexoRGBWallet.sendBtcBegin(params);
  }
  async sendBtcEnd(params) {
    this.ensureInitialized();
    return this.utexoRGBWallet.sendBtcEnd(params);
  }
  async sendBtc(params) {
    this.ensureInitialized();
    return this.utexoRGBWallet.sendBtc(params);
  }
  async blindReceive(params) {
    this.ensureInitialized();
    return this.utexoRGBWallet.blindReceive(params);
  }
  async witnessReceive(params) {
    this.ensureInitialized();
    return this.utexoRGBWallet.witnessReceive(params);
  }
  async decodeRGBInvoice(params) {
    this.ensureInitialized();
    return this.utexoRGBWallet.decodeRGBInvoice(params);
  }
  async listTransactions() {
    this.ensureInitialized();
    return this.utexoRGBWallet.listTransactions();
  }
  async listTransfers(asset_id) {
    this.ensureInitialized();
    return this.utexoRGBWallet.listTransfers(asset_id);
  }
  async failTransfers(params) {
    this.ensureInitialized();
    return this.utexoRGBWallet.failTransfers(params);
  }
  async refreshWallet() {
    this.ensureInitialized();
    this.utexoRGBWallet.refreshWallet();
  }
  async syncWallet() {
    this.ensureInitialized();
    this.utexoRGBWallet.syncWallet();
  }
  async estimateFeeRate(blocks) {
    this.ensureInitialized();
    return this.utexoRGBWallet.estimateFeeRate(blocks);
  }
  async estimateFee(psbtBase64) {
    this.ensureInitialized();
    return this.utexoRGBWallet.estimateFee(psbtBase64);
  }
  /**
   * Create backup for both layer1 and utexo stores in one folder.
   * Writes backupPath/wallet_{masterFingerprint}_layer1.backup and backupPath/wallet_{masterFingerprint}_utexo.backup
   * (same naming convention as VSS: storeId_layer1, storeId_utexo with storeId = wallet_<fp>).
   * Use restoreUtxoWalletFromBackup with the same backupPath to restore both.
   */
  async createBackup(params) {
    this.ensureInitialized();
    const { backupPath, password } = params;
    if (!backupPath || !password) {
      throw new ValidationError(
        "backupPath and password are required",
        "createBackup"
      );
    }
    const fp = this.utexoKeys.masterFingerprint;
    const { layer1TmpDir, utexoTmpDir, layer1FinalPath, utexoFinalPath } = prepareUtxoBackupDirs(backupPath, fp);
    const layer1Result = await this.layer1RGBWallet.createBackup({
      backupPath: layer1TmpDir,
      password
    });
    const utexoResult = await this.utexoRGBWallet.createBackup({
      backupPath: utexoTmpDir,
      password
    });
    finalizeUtxoBackupPaths({
      layer1BackupPath: layer1Result.backupPath,
      utexoBackupPath: utexoResult.backupPath,
      layer1FinalPath,
      utexoFinalPath,
      layer1TmpDir,
      utexoTmpDir
    });
    return {
      message: "Backup created successfully (layer1 + utexo)",
      backupPath,
      layer1BackupPath: layer1FinalPath,
      utexoBackupPath: utexoFinalPath
    };
  }
  async configureVssBackup(config) {
    this.ensureInitialized();
    const { layer1, utexo } = getVssConfigs(config);
    await this.layer1RGBWallet.configureVssBackup(layer1);
    await this.utexoRGBWallet.configureVssBackup(utexo);
  }
  async disableVssAutoBackup() {
    this.ensureInitialized();
    await this.layer1RGBWallet.disableVssAutoBackup();
    await this.utexoRGBWallet.disableVssAutoBackup();
  }
  /**
   * Run VSS backup for both layer1 and utexo stores.
   * Config is optional: when omitted, builds config from mnemonic (option param or wallet mnemonic)
   * and options.vssServerUrl (or DEFAULT_VSS_SERVER_URL if not set).
   *
   * @param config - Optional; when omitted, built from mnemonic and vssServerUrl
   * @param mnemonic - Optional; when omitted, uses wallet mnemonic (only if wallet was created with mnemonic string)
   */
  async vssBackup(config, mnemonic) {
    this.ensureInitialized();
    let vssConfig;
    if (config) {
      vssConfig = config;
    } else {
      const mnemonicToUse = mnemonic ?? (typeof this.mnemonicOrSeed === "string" ? this.mnemonicOrSeed : null);
      if (!mnemonicToUse) {
        throw new ValidationError(
          "mnemonic is required for VSS backup when config is not passed (wallet was created with seed)",
          "mnemonic"
        );
      }
      const serverUrl = this.options.vssServerUrl ?? DEFAULT_VSS_SERVER_URL;
      const preset = this.options.network ?? "mainnet";
      vssConfig = await buildVssConfigFromMnemonic(
        mnemonicToUse.trim(),
        serverUrl,
        preset
      );
    }
    const { layer1, utexo } = getVssConfigs(vssConfig);
    await this.layer1RGBWallet.vssBackup(layer1);
    const version = await this.utexoRGBWallet.vssBackup(utexo);
    return version;
  }
  /**
   * Get VSS backup info. Config is optional; when omitted, built from mnemonic (param or wallet)
   * and options.vssServerUrl (or DEFAULT_VSS_SERVER_URL if not set).
   */
  async vssBackupInfo(config, mnemonic) {
    this.ensureInitialized();
    let vssConfig;
    if (config) {
      vssConfig = config;
    } else {
      const mnemonicToUse = mnemonic ?? (typeof this.mnemonicOrSeed === "string" ? this.mnemonicOrSeed : null);
      if (!mnemonicToUse) {
        throw new ValidationError(
          "config or mnemonic required for vssBackupInfo",
          "config"
        );
      }
      const serverUrl = this.options.vssServerUrl ?? DEFAULT_VSS_SERVER_URL;
      const preset = this.options.network ?? "mainnet";
      vssConfig = await buildVssConfigFromMnemonic(
        mnemonicToUse.trim(),
        serverUrl,
        preset
      );
    }
    const { utexo } = getVssConfigs(vssConfig);
    return this.utexoRGBWallet.vssBackupInfo(utexo);
  }
  async signPsbt(psbt, mnemonic) {
    this.ensureInitialized();
    return this.utexoRGBWallet.signPsbt(psbt, mnemonic);
  }
  async signMessage(message) {
    this.ensureInitialized();
    return this.utexoRGBWallet.signMessage(message);
  }
  async verifyMessage(message, signature, accountXpub) {
    this.ensureInitialized();
    return this.utexoRGBWallet.verifyMessage(message, signature, accountXpub);
  }
  /**
   * Validates that the wallet has sufficient spendable balance for the given asset and amount.
   * @param assetId - Asset ID to check balance for
   * @param amount - Required amount (in asset units)
   * @throws {ValidationError} If balance is not found or insufficient
   */
  async validateBalance(assetId, amount) {
    const assetBalance = await this.getAssetBalance(assetId);
    if (!assetBalance || !assetBalance.spendable) {
      throw new ValidationError("Asset balance is not found", "assetBalance");
    }
    if (assetBalance.spendable < amount) {
      throw new ValidationError(
        `Insufficient balance ${assetBalance.spendable} < ${amount}`,
        "amount"
      );
    }
  }
  /**
   * Extracts invoice data and destination asset from a bridge transfer.
   *
   * @param bridgeTransfer - Bridge transfer response containing recipient invoice and token info
   * @returns Object containing invoice string, decoded invoice data, and destination asset
   * @throws {ValidationError} If destination asset is not supported
   */
  async extractInvoiceAndAsset(bridgeTransfer) {
    const utexoInvoice = bridgeTransfer.recipient.address;
    const invoiceData = await this.decodeRGBInvoice({ invoice: utexoInvoice });
    const destinationAsset = this.networkIdMap.utexo.getAssetById(
      bridgeTransfer.recipientToken.id
    );
    if (!destinationAsset) {
      throw new ValidationError(
        "Destination asset is not supported",
        "assetId"
      );
    }
    return { utexoInvoice, invoiceData, destinationAsset };
  }
  /**
   * IUTEXOProtocol Implementation
   */
  async onchainReceive(params) {
    this.ensureInitialized();
    const destinationAsset = getDestinationAsset(
      "mainnet",
      "utexo",
      params.assetId ?? null,
      this.networkIdMap
    );
    if (!destinationAsset) {
      throw new ValidationError(
        "Destination asset is not supported",
        "assetId"
      );
    }
    if (!params.amount) {
      throw new ValidationError("Amount is required", "amount");
    }
    const destinationInvoice = await this.utexoRGBWallet.witnessReceive({
      assetId: "",
      //invoice can receive any asset
      amount: params.amount,
      minConfirmations: params.minConfirmations,
      durationSeconds: params.durationSeconds
    });
    const bridgeTransfer = await this.bridge.getBridgeInSignature({
      sender: {
        address: "rgb-address",
        networkName: this.networkIdMap.mainnet.networkName,
        networkId: this.networkIdMap.mainnet.networkId
      },
      tokenId: destinationAsset.tokenId,
      amount: params.amount.toString(),
      destination: {
        address: destinationInvoice.invoice,
        networkName: this.networkIdMap.utexo.networkName,
        networkId: this.networkIdMap.utexo.networkId
      },
      additionalAddresses: []
    });
    const decodedInvoice = decodeBridgeInvoice(bridgeTransfer.signature);
    return {
      invoice: decodedInvoice
    };
  }
  async onchainSendBegin(params) {
    this.ensureInitialized();
    const bridgeTransfer = await this.bridge.getTransferByMainnetInvoice(
      params.invoice,
      this.networkIdMap.mainnet.networkId
    );
    if (!bridgeTransfer) {
      console.log("External invoice UTEXO -> Mainnet initiated");
      return this.UTEXOToMainnetRGB(params);
    }
    const utexoInvoice = bridgeTransfer.recipient.address;
    const invoiceData = await this.decodeRGBInvoice({ invoice: utexoInvoice });
    const bridgeAmount = bridgeTransfer.recipientAmount;
    const destinationAsset = this.networkIdMap.utexo.getAssetById(
      bridgeTransfer.recipientToken.id
    );
    if (!destinationAsset) {
      throw new ValidationError(
        "Destination asset is not supported",
        "assetId"
      );
    }
    const amount = toUnitsNumber(bridgeAmount, destinationAsset.precision);
    const isWitness = invoiceData.recipientId.includes("wvout:");
    await this.validateBalance(destinationAsset.assetId, amount);
    const psbt = await this.utexoRGBWallet.sendBegin({
      invoice: utexoInvoice,
      amount,
      assetId: destinationAsset.assetId,
      donation: true,
      ...isWitness && {
        witnessData: {
          amountSat: 1e3,
          blinding: 0
        }
      }
    });
    return psbt;
  }
  async onchainSendEnd(params) {
    this.ensureInitialized();
    const sendResult = await this.utexoRGBWallet.sendEnd({
      signedPsbt: params.signedPsbt
    });
    return sendResult;
  }
  async onchainSend(params, mnemonic) {
    this.ensureInitialized();
    const psbt = await this.onchainSendBegin(params);
    const signed_psbt = await this.utexoRGBWallet.signPsbt(psbt, mnemonic);
    return await this.onchainSendEnd({
      signedPsbt: signed_psbt,
      invoice: params.invoice
    });
  }
  async getOnchainSendStatus(invoice) {
    const bridgeTransfer = await this.bridge.getTransferByMainnetInvoice(
      invoice,
      this.networkIdMap.mainnet.networkId
    );
    if (!bridgeTransfer) {
      const withdrawTransfer = await this.bridge.getWithdrawTransfer(
        invoice,
        this.networkIdMap.utexo.networkId
      );
      if (!withdrawTransfer) {
        return null;
      }
      return withdrawTransfer.status;
    }
    const { invoiceData, destinationAsset } = await this.extractInvoiceAndAsset(bridgeTransfer);
    const assets = await this.utexoRGBWallet.listAssets();
    const walletAsset = assets.nia.find(
      (a) => a.assetId === destinationAsset.assetId
    );
    const transfers = await this.utexoRGBWallet.listTransfers(
      walletAsset?.assetId
    );
    const transfer = transfers.find(
      (transfer2) => transfer2.recipientId === invoiceData.recipientId
    );
    if (transfer) {
      return transfer.status;
    }
    if (bridgeTransfer) {
      return bridgeTransfer.status;
    }
    return null;
  }
  async listOnchainTransfers(asset_id) {
    this.ensureInitialized();
    return this.utexoRGBWallet.listTransfers(asset_id);
  }
  async createLightningInvoice(params) {
    this.ensureInitialized();
    const asset = params.asset;
    if (!asset) {
      throw new ValidationError("Asset is required", "asset");
    }
    if (!asset.assetId) {
      throw new ValidationError("Asset ID is required", "assetId");
    }
    if (!asset.amount) {
      throw new ValidationError("Amount is required", "amount");
    }
    const destinationAsset = getDestinationAsset(
      "mainnet",
      "utexo",
      asset.assetId,
      this.networkIdMap
    );
    if (!destinationAsset) {
      throw new ValidationError(
        "Destination asset is not supported",
        "assetId"
      );
    }
    const destinationInvoice = await this.utexoRGBWallet.witnessReceive({
      assetId: "",
      //invoice can receive any asset
      amount: asset.amount
    });
    const bridgeTransfer = await this.bridge.getBridgeInSignature({
      sender: {
        address: "rgb-address",
        networkName: this.networkIdMap.mainnetLightning.networkName,
        networkId: this.networkIdMap.mainnetLightning.networkId
      },
      tokenId: destinationAsset.tokenId,
      amount: asset.amount.toString(),
      destination: {
        address: destinationInvoice.invoice,
        networkName: this.networkIdMap.utexo.networkName,
        networkId: this.networkIdMap.utexo.networkId
      },
      additionalAddresses: []
    });
    const decodedLnInvoice = decodeBridgeInvoice(bridgeTransfer.signature);
    return {
      lnInvoice: decodedLnInvoice
    };
  }
  async payLightningInvoiceBegin(params) {
    this.ensureInitialized();
    const bridgeTransfer = await this.bridge.getTransferByMainnetInvoice(
      params.lnInvoice,
      this.networkIdMap.mainnetLightning.networkId
    );
    if (!bridgeTransfer) {
      console.log("External invoice UTEXO -> Mainnet Lightning initiated");
      return this.UtexoToMainnetLightning(params);
    }
    const bridgeAmount = bridgeTransfer.recipientAmount;
    const { utexoInvoice, invoiceData, destinationAsset } = await this.extractInvoiceAndAsset(bridgeTransfer);
    const amount = toUnitsNumber(bridgeAmount, destinationAsset.precision);
    const isWitness = invoiceData.recipientId.includes("wvout:");
    const psbt = await this.utexoRGBWallet.sendBegin({
      invoice: utexoInvoice,
      amount,
      assetId: destinationAsset.assetId,
      donation: true,
      ...isWitness && {
        witnessData: {
          amountSat: 1e3,
          blinding: 0
        }
      }
    });
    return psbt;
  }
  async payLightningInvoiceEnd(params) {
    this.ensureInitialized();
    const sendResult = await this.utexoRGBWallet.sendEnd({
      signedPsbt: params.signedPsbt
    });
    return sendResult;
  }
  async payLightningInvoice(params, mnemonic) {
    this.ensureInitialized();
    const psbt = await this.payLightningInvoiceBegin(params);
    const signed_psbt = await this.utexoRGBWallet.signPsbt(psbt, mnemonic);
    return await this.payLightningInvoiceEnd({
      signedPsbt: signed_psbt,
      lnInvoice: params.lnInvoice
    });
  }
  async getLightningSendRequest(lnInvoice) {
    this.ensureInitialized();
    const bridgeTransfer = await this.bridge.getTransferByMainnetInvoice(
      lnInvoice,
      this.networkIdMap.mainnetLightning.networkId
    );
    if (!bridgeTransfer) {
      const withdrawTransfer = await this.bridge.getWithdrawTransfer(
        lnInvoice,
        this.networkIdMap.utexo.networkId
      );
      if (!withdrawTransfer) {
        return null;
      }
      return withdrawTransfer.status;
    }
    const { invoiceData, destinationAsset } = await this.extractInvoiceAndAsset(bridgeTransfer);
    const transfers = await this.utexoRGBWallet.listTransfers(
      destinationAsset.assetId
    );
    return transfers.length > 0 ? transfers.find(
      (transfer) => transfer.recipientId === invoiceData.recipientId
    )?.status ?? null : null;
  }
  async getLightningReceiveRequest(lnInvoice) {
    this.ensureInitialized();
    const bridgeTransfer = await this.bridge.getTransferByMainnetInvoice(
      lnInvoice,
      this.networkIdMap.mainnetLightning.networkId
    );
    if (!bridgeTransfer) {
      const withdrawTransfer = await this.bridge.getWithdrawTransfer(
        lnInvoice,
        this.networkIdMap.utexo.networkId
      );
      if (!withdrawTransfer) {
        return null;
      }
      return withdrawTransfer.status;
    }
    const { invoiceData, destinationAsset } = await this.extractInvoiceAndAsset(bridgeTransfer);
    const transfers = await this.utexoRGBWallet.listTransfers(
      destinationAsset.assetId
    );
    return transfers.length > 0 ? transfers.find(
      (transfer) => transfer.recipientId === invoiceData.recipientId
    )?.status ?? null : null;
  }
  async UTEXOToMainnetRGB(params) {
    this.ensureInitialized();
    const invoiceData = await this.decodeRGBInvoice({
      invoice: params.invoice
    });
    if (!params.assetId && !invoiceData.assetId) {
      throw new ValidationError(
        "Asset ID is required for external invoice",
        "assetId"
      );
    }
    const assetId = params.assetId ?? invoiceData.assetId;
    const utexoAsset = getDestinationAsset(
      "mainnet",
      "utexo",
      assetId ?? null,
      this.networkIdMap
    );
    if (!utexoAsset) {
      throw new ValidationError("UTEXO asset is not supported", "assetId");
    }
    const destinationAsset = this.networkIdMap.mainnet.getAssetById(
      utexoAsset?.tokenId ?? 0
    );
    if (!destinationAsset) {
      throw new ValidationError(
        "Destination asset is not supported",
        "assetId"
      );
    }
    if (!params.amount && !invoiceData.assignment.amount) {
      throw new ValidationError(
        "Amount is required for external invoice",
        "amount"
      );
    }
    let amount;
    if (params.amount) {
      amount = params.amount;
    } else if (invoiceData.assignment.amount) {
      amount = fromUnitsNumber(
        invoiceData.assignment.amount,
        destinationAsset.precision
      );
    } else {
      throw new ValidationError("Amount is required", "amount");
    }
    await this.validateBalance(
      utexoAsset.assetId,
      toUnitsNumber(amount.toString(), utexoAsset.precision)
    );
    const payload = {
      sender: {
        address: "rgb-address",
        networkName: this.networkIdMap.utexo.networkName,
        networkId: this.networkIdMap.utexo.networkId
      },
      tokenId: destinationAsset.tokenId,
      amount: amount.toString(),
      destination: {
        address: params.invoice,
        networkName: this.networkIdMap.mainnet.networkName,
        networkId: this.networkIdMap.mainnet.networkId
      },
      additionalAddresses: []
    };
    console.log("payload", payload);
    const bridgeOutTransfer = await this.bridge.getBridgeInSignature(payload);
    const decodedInvoice = decodeBridgeInvoice(bridgeOutTransfer.signature);
    const isWitness = decodedInvoice.includes("wvout:");
    const psbt = await this.utexoRGBWallet.sendBegin({
      invoice: decodedInvoice,
      amount: Number(bridgeOutTransfer.amount),
      assetId: utexoAsset.assetId,
      donation: true,
      ...isWitness && {
        witnessData: {
          amountSat: 1e3,
          blinding: 0
        }
      }
    });
    return psbt;
  }
  async UtexoToMainnetLightning(params) {
    this.ensureInitialized();
    if (!params.assetId) {
      throw new ValidationError(
        "Asset ID is required for external invoice",
        "assetId"
      );
    }
    const assetId = params.assetId;
    const utexoAsset = getDestinationAsset(
      "mainnet",
      "utexo",
      assetId ?? null,
      this.networkIdMap
    );
    const destinationAsset = this.networkIdMap.mainnet.getAssetById(
      utexoAsset?.tokenId ?? 0
    );
    if (!destinationAsset) {
      throw new ValidationError(
        "Destination asset is not supported",
        "assetId"
      );
    }
    if (!utexoAsset) {
      throw new ValidationError(
        "Destination asset is not supported",
        "assetId"
      );
    }
    if (!params.amount) {
      throw new ValidationError(
        "Amount is required for external invoice",
        "amount"
      );
    }
    const amount = params.amount;
    await this.validateBalance(
      utexoAsset.assetId,
      toUnitsNumber(amount.toString(), utexoAsset.precision)
    );
    const bridgeOutTransfer = await this.bridge.getBridgeInSignature({
      sender: {
        address: "rgb-address",
        networkName: this.networkIdMap.utexo.networkName,
        networkId: this.networkIdMap.utexo.networkId
      },
      tokenId: destinationAsset.tokenId,
      amount: amount.toString(),
      destination: {
        address: params.lnInvoice,
        networkName: this.networkIdMap.mainnetLightning.networkName,
        networkId: this.networkIdMap.mainnetLightning.networkId
      },
      additionalAddresses: []
    });
    const decodedInvoice = decodeBridgeInvoice(bridgeOutTransfer.signature);
    const isWitness = decodedInvoice.includes("wvout:");
    const psbt = await this.utexoRGBWallet.sendBegin({
      invoice: decodedInvoice,
      amount: Number(bridgeOutTransfer.amount),
      assetId: utexoAsset.assetId,
      donation: true,
      ...isWitness && {
        witnessData: {
          amountSat: 1e3,
          blinding: 0
        }
      }
    });
    return psbt;
  }
  // TODO: Implement remaining methods as needed:
  // - createLightningInvoice() - will use utexoRGBWallet
  // - getLightningReceiveRequest() - will use utexoRGBWallet
  // - getLightningSendRequest() - will use utexoRGBWallet
  // - getLightningSendFeeEstimate() - will use utexoRGBWallet
  // - payLightningInvoiceBegin() - will use utexoRGBWallet
  // - payLightningInvoiceEnd() - will use utexoRGBWallet
  // - onchainSendBegin() - will use layer1RGBWallet or utexoRGBWallet
  // - onchainSendEnd() - will use layer1RGBWallet or utexoRGBWallet
  // - getOnchainSendStatus() - will use layer1RGBWallet or utexoRGBWallet
  // - listOnchainTransfers() - will use layer1RGBWallet or utexoRGBWallet
  // - listLightningPayments() - will use utexoRGBWallet
};

// src/utils/logger.ts
var LogLevel = /* @__PURE__ */ ((LogLevel2) => {
  LogLevel2[LogLevel2["DEBUG"] = 0] = "DEBUG";
  LogLevel2[LogLevel2["INFO"] = 1] = "INFO";
  LogLevel2[LogLevel2["WARN"] = 2] = "WARN";
  LogLevel2[LogLevel2["ERROR"] = 3] = "ERROR";
  LogLevel2[LogLevel2["NONE"] = 4] = "NONE";
  return LogLevel2;
})(LogLevel || {});
var Logger = class {
  constructor() {
    this.level = 3 /* ERROR */;
  }
  /**
   * Set the log level
   */
  setLevel(level) {
    this.level = level;
  }
  /**
   * Get the current log level
   */
  getLevel() {
    return this.level;
  }
  /**
   * Log debug messages
   */
  debug(...args) {
    if (this.level <= 0 /* DEBUG */) {
      console.debug("[SDK DEBUG]", ...args);
    }
  }
  /**
   * Log info messages
   */
  info(...args) {
    if (this.level <= 1 /* INFO */) {
      console.info("[SDK INFO]", ...args);
    }
  }
  /**
   * Log warning messages
   */
  warn(...args) {
    if (this.level <= 2 /* WARN */) {
      console.warn("[SDK WARN]", ...args);
    }
  }
  /**
   * Log error messages
   */
  error(...args) {
    if (this.level <= 3 /* ERROR */) {
      console.error("[SDK ERROR]", ...args);
    }
  }
};
var logger = new Logger();
function configureLogging(level) {
  logger.setLevel(level);
}

exports.BIP32_VERSIONS = BIP32_VERSIONS;
exports.BadRequestError = BadRequestError;
exports.COIN_BITCOIN_MAINNET = COIN_BITCOIN_MAINNET;
exports.COIN_BITCOIN_TESTNET = COIN_BITCOIN_TESTNET;
exports.COIN_RGB_MAINNET = COIN_RGB_MAINNET;
exports.COIN_RGB_TESTNET = COIN_RGB_TESTNET;
exports.ConfigurationError = ConfigurationError;
exports.ConflictError = ConflictError;
exports.CryptoError = CryptoError;
exports.DEFAULT_API_TIMEOUT = DEFAULT_API_TIMEOUT;
exports.DEFAULT_LOG_LEVEL = DEFAULT_LOG_LEVEL;
exports.DEFAULT_MAX_RETRIES = DEFAULT_MAX_RETRIES;
exports.DEFAULT_NETWORK = DEFAULT_NETWORK;
exports.DEFAULT_VSS_SERVER_URL = DEFAULT_VSS_SERVER_URL;
exports.DERIVATION_ACCOUNT = DERIVATION_ACCOUNT;
exports.DERIVATION_PURPOSE = DERIVATION_PURPOSE;
exports.KEYCHAIN_BTC = KEYCHAIN_BTC;
exports.KEYCHAIN_RGB = KEYCHAIN_RGB;
exports.LightningProtocol = LightningProtocol;
exports.LogLevel = LogLevel;
exports.NETWORK_MAP = NETWORK_MAP;
exports.NetworkError = NetworkError;
exports.NotFoundError = NotFoundError;
exports.OnchainProtocol = OnchainProtocol;
exports.RgbNodeError = RgbNodeError;
exports.SDKError = SDKError;
exports.UTEXOProtocol = UTEXOProtocol;
exports.UTEXOWallet = UTEXOWallet;
exports.ValidationError = ValidationError;
exports.WalletError = WalletError;
exports.WalletManager = WalletManager;
exports.accountXpubsFromMnemonic = accountXpubsFromMnemonic;
exports.configureLogging = configureLogging;
exports.createWallet = createWallet;
exports.createWalletManager = createWalletManager;
exports.deriveKeysFromMnemonic = deriveKeysFromMnemonic;
exports.deriveKeysFromMnemonicOrSeed = deriveKeysFromMnemonicOrSeed;
exports.deriveKeysFromSeed = deriveKeysFromSeed;
exports.deriveKeysFromXpriv = deriveKeysFromXpriv;
exports.deriveVssSigningKeyFromMnemonic = deriveVssSigningKeyFromMnemonic;
exports.generateKeys = generateKeys2;
exports.getDestinationAsset = getDestinationAsset;
exports.getEnvironment = getEnvironment;
exports.getUtxoNetworkConfig = getUtxoNetworkConfig;
exports.getXprivFromMnemonic = getXprivFromMnemonic;
exports.getXpubFromXpriv = getXpubFromXpriv;
exports.isBrowser = isBrowser;
exports.isNode = isNode;
exports.logger = logger;
exports.normalizeNetwork = normalizeNetwork;
exports.restoreFromBackup = restoreFromBackup;
exports.restoreFromVss = restoreFromVss;
exports.restoreKeys = restoreKeys;
exports.restoreUtxoWalletFromBackup = restoreUtxoWalletFromBackup;
exports.restoreUtxoWalletFromVss = restoreUtxoWalletFromVss;
exports.signMessage = signMessage;
exports.signPsbt = signPsbt;
exports.signPsbtFromSeed = signPsbtFromSeed;
exports.signPsbtSync = signPsbtSync;
exports.utexoNetworkIdMap = utexoNetworkIdMap;
exports.utexoNetworkMap = utexoNetworkMap;
exports.validateBase64 = validateBase64;
exports.validateHex = validateHex;
exports.validateMnemonic = validateMnemonic;
exports.validateNetwork = validateNetwork;
exports.validatePsbt = validatePsbt;
exports.validateRequired = validateRequired;
exports.validateString = validateString;
exports.verifyMessage = verifyMessage;
exports.wallet = wallet;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map