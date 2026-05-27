// Preload: force IPv4 for ALL Node.js HTTP traffic.
// Runs via --import (native Node ESM) before tsx loads anything.
//
// Three-layer defense — each covers a different HTTP stack in Node:
// 1. dns.setDefaultResultOrder('ipv4first') → Node's DNS resolver
// 2. Monkey-patch https.Agent.createConnection → grammY's native Agent
// 3. undici.setGlobalDispatcher({family:4}) → fetch/undici (other libs)
import dns from 'node:dns';
import https from 'node:https';
import { Agent, setGlobalDispatcher } from 'undici';

// Layer 1: DNS resolver prefers IPv4
dns.setDefaultResultOrder('ipv4first');

// Layer 2: Force family:4 on all https.Agent connections (grammY uses this)
const _origCreateConnection = https.Agent.prototype.createConnection;
https.Agent.prototype.createConnection = function (options, cb) {
  return _origCreateConnection.call(
    this,
    Object.assign({}, options, { family: 4 }),
    cb,
  );
};

// Layer 3: Force family:4 on all undici connections (fetch uses this)
setGlobalDispatcher(
  new Agent({
    connect: { family: 4 },
    headersTimeout: 15_000,
    bodyTimeout: 15_000,
  }),
);

console.log('[preload] IPv4 enforced (dns + https.Agent + undici)');
