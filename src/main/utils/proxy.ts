/**
 * Proxy utility functions
 * Centralized proxy configuration for all adapters
 */

import { HttpsProxyAgent } from 'https-proxy-agent'

/**
 * Get HTTPS proxy agent from environment variables
 * @returns HttpsProxyAgent if proxy is configured, undefined otherwise
 */
export function getHttpsProxyAgent(): HttpsProxyAgent | undefined {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy
  if (proxyUrl) {
    return new HttpsProxyAgent(proxyUrl)
  }
  return undefined
}

/**
 * Get axios proxy config for HTTPS requests
 * Returns config object with proxy: false and httpsAgent if proxy is available
 */
export function getProxyConfig(): { proxy: false; httpsAgent?: HttpsProxyAgent } {
  const httpsAgent = getHttpsProxyAgent()
  return {
    proxy: false,
    ...(httpsAgent && { httpsAgent }),
  }
}
