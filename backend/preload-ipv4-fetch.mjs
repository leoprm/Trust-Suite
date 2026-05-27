// Preload: force IPv4 for ALL Node.js HTTP traffic.
// Runs via --import (native Node ESM) before tsx loads anything.
// grammY captures fetch at import time, so this MUST be first.
//
// Strategy: undici's setGlobalDispatcher forces family:4 on all connections.
// This is the only reliable way to prevent IPv6 timeouts, because:
// - dns.setDefaultResultOrder → ignored by undici
// - kernel net.ipv6.conf.all.disable_ipv6 → ignored by undici
// - Replacing globalThis.fetch → grammY may capture undici directly
import { Agent, setGlobalDispatcher } from 'undici';

setGlobalDispatcher(
  new Agent({
    connect: {
      family: 4,
    },
  }),
);

console.log('[preload] undici global dispatcher set to IPv4-only');
