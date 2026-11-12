import { DriveAuthError, DriveConfigError, DriveNetworkError } from './errors';

export const DRIVE_SCOPES =
  'openid email https://www.googleapis.com/auth/drive.file';
export const DRIVE_SCOPE_SUMMARY = 'openid email drive.file';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface TokenError {
  type?: string;
  message?: string;
}

interface TokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}

interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: TokenResponse) => void;
  error_callback?: (error: TokenError) => void;
}

interface GoogleOAuth2 {
  initTokenClient(config: TokenClientConfig): TokenClient;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: GoogleOAuth2;
      };
    };
  }
}

export interface DriveSession {
  email: string;
  scope: string;
  expiresAt: number;
}

interface AccessToken {
  value: string;
  expiresAt: number;
}

let token: AccessToken | null = null;
let session: DriveSession | null = null;
let gisPromise: Promise<void> | null = null;

export function isGoogleDriveConnected(): boolean {
  return token !== null && session !== null && Date.now() < token.expiresAt;
}

export function googleDriveSession(): DriveSession | null {
  return isGoogleDriveConnected() ? session : null;
}

export function driveAccessToken(): string {
  if (!token || Date.now() >= token.expiresAt) {
    throw new DriveAuthError();
  }
  return token.value;
}

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();

  gisPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisPromise = null;
      reject(new DriveNetworkError('Google sign-in could not be loaded'));
    };
    document.head.append(script);
  });

  return gisPromise;
}

function requestAccessToken(clientId: string): Promise<TokenResponse> {
  return new Promise<TokenResponse>((resolve, reject) => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      reject(new DriveConfigError('Google sign-in is unavailable'));
      return;
    }

    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      callback();
    };

    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPES,
      callback: (response) => {
        finish(() => {
          if (response.error || !response.access_token) {
            reject(new DriveAuthError(response.error_description ?? response.error));
            return;
          }
          resolve(response);
        });
      },
      error_callback: (error) => {
        finish(() => reject(new DriveAuthError(error.message ?? error.type)));
      },
    });

    try {
      client.requestAccessToken({ prompt: 'select_account' });
    } catch (error) {
      finish(() => {
        reject(
          error instanceof Error
            ? new DriveConfigError(error.message)
            : new DriveConfigError(),
        );
      });
    }
  });
}

async function fetchEmail(accessToken: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new DriveNetworkError('Google account details could not be loaded');
  }

  if (response.status === 401) throw new DriveAuthError();
  if (!response.ok) throw new DriveNetworkError('Google account details could not be loaded');

  const body = (await response.json()) as { email?: unknown };
  if (typeof body.email !== 'string' || body.email === '') {
    throw new DriveAuthError('Google account has no email');
  }
  return body.email;
}

export async function connectGoogleDrive(clientId: string): Promise<DriveSession> {
  if (clientId.trim() === '') throw new DriveConfigError();
  if (!navigator.onLine) throw new DriveNetworkError('You are offline');

  await loadGis();
  const response = await requestAccessToken(clientId.trim());
  const accessToken = response.access_token;
  if (!accessToken) throw new DriveAuthError();

  const seconds = Number(response.expires_in);
  const lifetime = Number.isFinite(seconds) && seconds > 0 ? seconds : 3_600;
  const email = await fetchEmail(accessToken);

  token = {
    value: accessToken,
    expiresAt: Date.now() + Math.max(0, lifetime - 60) * 1_000,
  };
  session = {
    email,
    scope: response.scope ?? DRIVE_SCOPE_SUMMARY,
    expiresAt: token.expiresAt,
  };

  return session;
}

export function clearGoogleDriveSession(): void {
  token = null;
  session = null;
}

export async function signOutGoogleDrive(): Promise<void> {
  const current = token?.value;
  clearGoogleDriveSession();
  if (!current) return;

  try {
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: current }),
    });
  } catch {
    // Clearing local access is enough when the revoke request cannot reach Google.
  }
}
