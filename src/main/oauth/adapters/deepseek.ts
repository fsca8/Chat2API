/**
 * DeepSeek Authentication Adapter
 * Authentication method: Login using default browser, manually extract token
 */

import axios from 'axios'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { shell } from 'electron'
import { BaseOAuthAdapter } from './base'
import {
  OAuthResult,
  OAuthOptions,
  TokenValidationResult,
  CredentialInfo,
  AdapterConfig,
  OAuthCallbackData,
} from '../types'

const DEEPSEEK_API_BASE = 'https://chat.deepseek.com'

// 获取系统代理配置
function getHttpsProxyAgent(): HttpsProxyAgent | undefined {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy
  if (proxyUrl) {
    return new HttpsProxyAgent(proxyUrl)
  }
  return undefined
}

const FAKE_HEADERS = {
  'Accept': '*/*',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  'Content-Type': 'application/json',
  'DNT': '1',
  'Origin': DEEPSEEK_API_BASE,
  'Priority': 'u=1, i',
  'Referer': `${DEEPSEEK_API_BASE}/`,
  'Sec-Ch-Ua': '"Not)A;Brand";v="8", "Chromium";v="138"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-GPC': '1',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  'X-App-Version': '20241129.1',
  'X-Client-Locale': 'zh_CN',
  'X-Client-Platform': 'web',
  'X-Client-Timezone-Offset': '28800',
  'X-Client-Version': '2.0.0',
}

export class DeepSeekAdapter extends BaseOAuthAdapter {
  constructor(config: AdapterConfig) {
    super({
      ...config,
      providerType: 'deepseek',
      authMethods: ['manual'],
      loginUrl: DEEPSEEK_API_BASE,
      apiUrl: DEEPSEEK_API_BASE,
    })
  }

  /**
   * Start login flow - Open default browser
   */
  async startLogin(options: OAuthOptions): Promise<OAuthResult> {
    this.emitProgress('pending', 'Opening browser...')
    
    try {
      await shell.openExternal(DEEPSEEK_API_BASE)
      this.emitProgress('pending', 'Please log in via browser and enter Token manually')
      
      return {
        success: false,
        providerId: options.providerId,
        providerType: 'deepseek',
        error: 'Please log in via browser, extract Token from Developer Tools and enter manually',
      }
    } catch (error) {
      console.error('[DeepSeek] startLogin error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to open browser'
      this.emitProgress('error', errorMessage)
      
      return {
        success: false,
        providerId: options.providerId,
        providerType: 'deepseek',
        error: errorMessage,
      }
    }
  }

  /**
   * Complete authentication with manually entered token
   */
  async loginWithToken(providerId: string, token: string): Promise<OAuthResult> {
    this.emitProgress('pending', 'Validating Token...')
    
    try {
      const validation = await this.validateToken({ token })
      
      if (!validation.valid) {
        return {
          success: false,
          providerId,
          providerType: 'deepseek',
          error: validation.error || 'Token validation failed',
        }
      }
      
      this.emitProgress('success', 'Token validation successful')
      
      return {
        success: true,
        providerId,
        providerType: 'deepseek',
        credentials: { token },
        accountInfo: validation.accountInfo,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.emitProgress('error', `Token validation failed: ${errorMessage}`)
      
      return {
        success: false,
        providerId,
        providerType: 'deepseek',
        error: errorMessage,
      }
    }
  }

  /**
   * Handle callback (DeepSeek does not support)
   */
  protected async processCallback(data: OAuthCallbackData): Promise<void> {
    // DeepSeek does not support OAuth callback
  }

  /**
   * Validate token validity
   */
  async validateToken(credentials: Record<string, string>): Promise<TokenValidationResult> {
    const rawToken = credentials.token || credentials.userToken
    
    if (!rawToken) {
      return {
        valid: false,
        error: 'Token cannot be empty',
      }
    }
    
    // 处理token格式：可能是JSON对象 {"value":"xxx","__version":"0"} 或纯字符串
    let token = rawToken
    try {
      const parsed = JSON.parse(rawToken)
      if (parsed && parsed.value) {
        token = parsed.value
        console.log('[DeepSeek OAuth] Extracted token from JSON object')
      }
    } catch {
      // token是纯字符串，直接使用
    }
    
    try {
      const url = `${DEEPSEEK_API_BASE}/api/v0/chat_session/create`
      const headers = {
        Authorization: `Bearer ${token}`,
        ...FAKE_HEADERS,
      }
      
      console.log('[DeepSeek OAuth] ========== Validate Token Request ==========')
      console.log('[DeepSeek OAuth] URL:', url)
      console.log('[DeepSeek OAuth] Method: POST')
      console.log('[DeepSeek OAuth] Headers:', JSON.stringify(headers, null, 2))
      console.log('[DeepSeek OAuth] ================================================')
      
      const httpsAgent = getHttpsProxyAgent()
      const response = await axios.post(url, {}, {
        headers,
        timeout: 15000,
        validateStatus: () => true,
        proxy: false,
        httpsAgent,
      })
      
      console.log('[DeepSeek OAuth] ========== Validate Token Response ==========')
      console.log('[DeepSeek OAuth] Status:', response.status)
      console.log('[DeepSeek OAuth] Data:', JSON.stringify(response.data, null, 2))
      console.log('[DeepSeek OAuth] =================================================')
      
      // 如果返回200且code为0，说明token有效
      if (response.status === 200 && response.data?.code === 0) {
        return {
          valid: true,
          tokenType: 'access',
          accountInfo: {
            userId: 'deepseek-user',
            email: '',
            name: 'DeepSeek User',
          },
        }
      }
      
      if (response.status === 401 || response.status === 403) {
        return {
          valid: false,
          error: 'Token is invalid or expired',
        }
      }
      
      return {
        valid: true,
        tokenType: 'access',
        accountInfo: {
          userId: 'deepseek-user',
          email: '',
          name: 'DeepSeek User',
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Validation request failed'
      return {
        valid: false,
        error: errorMessage,
      }
    }
  }

  /**
   * Refresh token
   */
  async refreshToken(credentials: Record<string, string>): Promise<CredentialInfo | null> {
    const token = credentials.token || credentials.refreshToken
    
    if (!token) {
      return null
    }
    
    try {
      const response = await axios.get(`${DEEPSEEK_API_BASE}/api/v0/users/current`, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...FAKE_HEADERS,
        },
        timeout: 15000,
        validateStatus: () => true,
      })
      
      if (response.status !== 200 || !response.data?.biz_data?.token) {
        return null
      }
      
      const newToken = response.data.biz_data.token
      
      return {
        type: 'access',
        value: newToken,
        expiresAt: this.getTimestamp() + 3600,
      }
    } catch {
      return null
    }
  }
}

export default DeepSeekAdapter
