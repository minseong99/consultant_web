import "server-only";

// 모든 값은 서버 전용이다. NEXT_PUBLIC_ 접두사를 붙이지 않는다.
export const USE_MOCK = process.env.USE_MOCK !== "false";

export const config = {
  n8nBaseUrl: (process.env.N8N_BASE_URL ?? "").replace(/\/+$/, ""),
  n8nWebSecret: process.env.N8N_WEB_SECRET ?? "",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  staffDemoPassword: process.env.STAFF_DEMO_PASSWORD ?? "",
  /** 로그인 화면에서 처음 선택되어 있을 직원 (선택) */
  staffDefaultId: process.env.STAFF_DEFAULT_ID ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "",
};

/** 실제 연동 모드에서 빠진 환경변수 이름 목록 */
export function missingRealModeEnv() {
  const required: Record<string, string> = {
    N8N_BASE_URL: config.n8nBaseUrl,
    N8N_WEB_SECRET: config.n8nWebSecret,
    SUPABASE_URL: config.supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: config.supabaseServiceRoleKey,
    STAFF_DEMO_PASSWORD: config.staffDemoPassword,
    SESSION_SECRET: config.sessionSecret,
  };
  return Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name);
}
