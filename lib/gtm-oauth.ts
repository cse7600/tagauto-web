// GTM OAuth 2.0 토큰 관리
// perma-studio-2의 google-auth-library 패턴 참고

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GTM_SCOPE = "https://www.googleapis.com/auth/tagmanager.edit.containers https://www.googleapis.com/auth/tagmanager.readonly";

export function getOAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GTM_CLIENT_ID!,
    redirect_uri: process.env.GTM_REDIRECT_URI!,
    response_type: "code",
    scope: GTM_SCOPE,
    access_type: "offline",
    prompt: "consent",
    ...(state && { state }),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GTM_CLIENT_ID!,
      client_secret: process.env.GTM_CLIENT_SECRET!,
      redirect_uri: process.env.GTM_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GTM_CLIENT_ID!,
      client_secret: process.env.GTM_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  return res.json();
}

// GTM API 호출용 access_token 반환 (만료 시 자동 갱신)
export async function getValidToken(stored: {
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
}): Promise<string> {
  const expiresAt = new Date(stored.token_expires_at).getTime();
  const now = Date.now();

  // 만료 5분 전부터 갱신
  if (now < expiresAt - 5 * 60 * 1000) {
    return stored.access_token;
  }

  const refreshed = await refreshAccessToken(stored.refresh_token);
  return refreshed.access_token;
}
