/**
 * OAuth 2.0 Server Implementation for ChatGPT Connector
 * Implements dynamic client registration and token management
 */

import { randomBytes } from 'crypto';
import express, { Request, Response, NextFunction } from 'express';

// OAuth configuration
export interface OAuthConfig {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
  jwksUri?: string;
  supportedScopes: string[];
  supportedResponseTypes: string[];
  supportedGrantTypes: string[];
}

// Client registration interface
export interface ClientRegistration {
  client_id: string;
  client_secret: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  scope: string;
  created_at: number;
}

// Token interface
export interface OAuthToken {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope: string;
  issued_at: number;
}

// Authorization code interface
interface AuthorizationCode {
  code: string;
  client_id: string;
  redirect_uri: string;
  scope: string;
  user_id?: string;
  expires_at: number;
  code_challenge?: string;
  code_challenge_method?: string;
}

// In-memory stores (replace with proper database in production)
const clients = new Map<string, ClientRegistration>();
const authorizationCodes = new Map<string, AuthorizationCode>();
const tokens = new Map<string, OAuthToken>();
const refreshTokens = new Map<string, { client_id: string; scope: string; user_id?: string }>();

/**
 * Generate a secure random string
 */
function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * OAuth configuration
 */
export const oauthConfig: OAuthConfig = {
  issuer: process.env.OAUTH_ISSUER || 'https://attio-mcp.localhost',
  authorizationEndpoint: '/oauth/authorize',
  tokenEndpoint: '/oauth/token',
  registrationEndpoint: '/oauth/register',
  jwksUri: '/oauth/jwks',
  supportedScopes: ['read', 'write', 'admin'],
  supportedResponseTypes: ['code'],
  supportedGrantTypes: ['authorization_code', 'refresh_token'],
};

/**
 * Dynamic client registration endpoint
 * POST /oauth/register
 */
export async function registerClient(req: Request, res: Response): Promise<void> {
  try {
    const {
      client_name,
      redirect_uris,
      grant_types = ['authorization_code'],
      response_types = ['code'],
      scope = 'read',
    } = req.body;

    // Validate required fields
    if (!client_name || !redirect_uris || !Array.isArray(redirect_uris)) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required fields: client_name and redirect_uris',
      });
      return;
    }

    // Validate redirect URIs
    for (const uri of redirect_uris) {
      try {
        new URL(uri);
      } catch {
        res.status(400).json({
          error: 'invalid_redirect_uri',
          error_description: `Invalid redirect URI: ${uri}`,
        });
        return;
      }
    }

    // Generate client credentials
    const client: ClientRegistration = {
      client_id: generateSecureToken(16),
      client_secret: generateSecureToken(32),
      client_name,
      redirect_uris,
      grant_types,
      response_types,
      scope,
      created_at: Date.now(),
    };

    // Store client
    clients.set(client.client_id, client);

    // Return client information
    res.status(201).json({
      client_id: client.client_id,
      client_secret: client.client_secret,
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      grant_types: client.grant_types,
      response_types: client.response_types,
      scope: client.scope,
    });
  } catch (error) {
    console.error('[OAuth] Registration error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to register client',
    });
  }
}

/**
 * Authorization endpoint
 * GET /oauth/authorize
 */
export async function authorize(req: Request, res: Response): Promise<void> {
  try {
    const {
      response_type,
      client_id,
      redirect_uri,
      scope = 'read',
      state,
      code_challenge,
      code_challenge_method,
    } = req.query as Record<string, string>;

    // Validate required parameters
    if (!response_type || !client_id || !redirect_uri) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameters',
      });
      return;
    }

    // Validate response type
    if (response_type !== 'code') {
      res.status(400).json({
        error: 'unsupported_response_type',
        error_description: 'Only authorization code flow is supported',
      });
      return;
    }

    // Validate client
    const client = clients.get(client_id);
    if (!client) {
      res.status(400).json({
        error: 'invalid_client',
        error_description: 'Client not found',
      });
      return;
    }

    // Validate redirect URI
    if (!client.redirect_uris.includes(redirect_uri)) {
      res.status(400).json({
        error: 'invalid_redirect_uri',
        error_description: 'Redirect URI not registered',
      });
      return;
    }

    // Generate authorization code
    const authCode: AuthorizationCode = {
      code: generateSecureToken(16),
      client_id,
      redirect_uri,
      scope,
      expires_at: Date.now() + 600000, // 10 minutes
      code_challenge,
      code_challenge_method,
    };

    // Store authorization code
    authorizationCodes.set(authCode.code, authCode);

    // Build redirect URL
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set('code', authCode.code);
    if (state) {
      redirectUrl.searchParams.set('state', state);
    }

    // Redirect to client
    res.redirect(redirectUrl.toString());
  } catch (error) {
    console.error('[OAuth] Authorization error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Authorization failed',
    });
  }
}

/**
 * Token endpoint
 * POST /oauth/token
 */
export async function token(req: Request, res: Response): Promise<void> {
  try {
    const {
      grant_type,
      code,
      redirect_uri,
      client_id,
      client_secret,
      refresh_token,
      code_verifier,
    } = req.body;

    // Validate grant type
    if (!['authorization_code', 'refresh_token'].includes(grant_type)) {
      res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Grant type not supported',
      });
      return;
    }

    // Validate client credentials
    const client = clients.get(client_id);
    if (!client || client.client_secret !== client_secret) {
      res.status(401).json({
        error: 'invalid_client',
        error_description: 'Client authentication failed',
      });
      return;
    }

    if (grant_type === 'authorization_code') {
      // Handle authorization code grant
      if (!code || !redirect_uri) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing required parameters',
        });
        return;
      }

      const authCode = authorizationCodes.get(code);
      if (!authCode) {
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid authorization code',
        });
        return;
      }

      // Validate code hasn't expired
      if (authCode.expires_at < Date.now()) {
        authorizationCodes.delete(code);
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Authorization code expired',
        });
        return;
      }

      // Validate redirect URI matches
      if (authCode.redirect_uri !== redirect_uri) {
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Redirect URI mismatch',
        });
        return;
      }

      // Validate client ID matches
      if (authCode.client_id !== client_id) {
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Client ID mismatch',
        });
        return;
      }

      // TODO: Validate PKCE if code_challenge was provided

      // Generate tokens
      const accessToken = generateSecureToken(32);
      const refreshToken = generateSecureToken(32);

      const tokenData: OAuthToken = {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600, // 1 hour
        refresh_token: refreshToken,
        scope: authCode.scope,
        issued_at: Date.now(),
      };

      // Store tokens
      tokens.set(accessToken, tokenData);
      refreshTokens.set(refreshToken, {
        client_id,
        scope: authCode.scope,
      });

      // Delete used authorization code
      authorizationCodes.delete(code);

      // Return tokens
      res.json({
        access_token: tokenData.access_token,
        token_type: tokenData.token_type,
        expires_in: tokenData.expires_in,
        refresh_token: tokenData.refresh_token,
        scope: tokenData.scope,
      });
    } else if (grant_type === 'refresh_token') {
      // Handle refresh token grant
      if (!refresh_token) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing refresh token',
        });
        return;
      }

      const refreshData = refreshTokens.get(refresh_token);
      if (!refreshData || refreshData.client_id !== client_id) {
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid refresh token',
        });
        return;
      }

      // Generate new access token
      const accessToken = generateSecureToken(32);

      const tokenData: OAuthToken = {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600, // 1 hour
        refresh_token: refresh_token,
        scope: refreshData.scope,
        issued_at: Date.now(),
      };

      // Store new access token
      tokens.set(accessToken, tokenData);

      // Return new token
      res.json({
        access_token: tokenData.access_token,
        token_type: tokenData.token_type,
        expires_in: tokenData.expires_in,
        refresh_token: tokenData.refresh_token,
        scope: tokenData.scope,
      });
    }
  } catch (error) {
    console.error('[OAuth] Token error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Token generation failed',
    });
  }
}

/**
 * Token validation middleware
 */
export function validateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'unauthorized',
      error_description: 'Missing or invalid authorization header',
    });
    return;
  }

  const accessToken = authHeader.substring(7);
  const tokenData = tokens.get(accessToken);

  if (!tokenData) {
    res.status(401).json({
      error: 'invalid_token',
      error_description: 'Token not found',
    });
    return;
  }

  // Check token expiration
  const expiresAt = tokenData.issued_at + tokenData.expires_in * 1000;
  if (expiresAt < Date.now()) {
    tokens.delete(accessToken);
    res.status(401).json({
      error: 'invalid_token',
      error_description: 'Token expired',
    });
    return;
  }

  // Attach token data to request
  (req as any).oauth = {
    scope: tokenData.scope,
    token: accessToken,
  };

  next();
}

/**
 * Initialize OAuth endpoints
 */
export function initializeOAuthEndpoints(app: express.Application): void {
  // Dynamic client registration
  app.post('/oauth/register', registerClient);

  // Authorization endpoint
  app.get('/oauth/authorize', authorize);

  // Token endpoint
  app.post('/oauth/token', express.json(), token);

  // OAuth metadata endpoint
  app.get('/.well-known/oauth-authorization-server', (req, res) => {
    res.json({
      issuer: oauthConfig.issuer,
      authorization_endpoint: `${oauthConfig.issuer}${oauthConfig.authorizationEndpoint}`,
      token_endpoint: `${oauthConfig.issuer}${oauthConfig.tokenEndpoint}`,
      registration_endpoint: `${oauthConfig.issuer}${oauthConfig.registrationEndpoint}`,
      jwks_uri: oauthConfig.jwksUri ? `${oauthConfig.issuer}${oauthConfig.jwksUri}` : undefined,
      scopes_supported: oauthConfig.supportedScopes,
      response_types_supported: oauthConfig.supportedResponseTypes,
      grant_types_supported: oauthConfig.supportedGrantTypes,
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      code_challenge_methods_supported: ['S256', 'plain'],
    });
  });

  console.log('[OAuth] OAuth 2.0 endpoints initialized');
}