// 서비스 계정으로 GTM API 토큰 발급
// OAuth 클라이언트 ID 불필요 — 서비스 계정 JSON만으로 동작

import { GoogleAuth } from "google-auth-library";

let _auth: GoogleAuth | null = null;

function getAuth() {
  if (!_auth) {
    const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (keyJson) {
      // Vercel 환경: 환경변수에서 JSON 파싱
      let credentials: object;
      try {
        credentials = JSON.parse(keyJson);
      } catch {
        const fixed = keyJson.replace(
          /"private_key"\s*:\s*"([\s\S]+?)"/,
          (_m: string, keyVal: string) =>
            `"private_key":"${keyVal.replace(/\r?\n/g, "\\n")}"`,
        );
        credentials = JSON.parse(fixed);
      }
      _auth = new GoogleAuth({
        credentials,
        scopes: [
          "https://www.googleapis.com/auth/tagmanager.edit.containers",
          "https://www.googleapis.com/auth/tagmanager.readonly",
          "https://www.googleapis.com/auth/analytics.readonly",
        ],
      });
    } else {
      // 로컬: 파일 경로 사용
      _auth = new GoogleAuth({
        keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
        scopes: [
          "https://www.googleapis.com/auth/tagmanager.edit.containers",
          "https://www.googleapis.com/auth/tagmanager.readonly",
          "https://www.googleapis.com/auth/analytics.readonly",
        ],
      });
    }
  }
  return _auth;
}

export async function getGtmToken(): Promise<string> {
  const client = await getAuth().getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("GTM 토큰 발급 실패");
  return token.token;
}
