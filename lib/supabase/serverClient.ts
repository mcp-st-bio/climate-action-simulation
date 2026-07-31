import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * 서버(Route Handler)에서만 사용하는 클라이언트. service_role 키로 RLS를 우회해 상태를 쓴다.
 * 절대 클라이언트 컴포넌트나 "use client" 파일에서 import하지 말 것.
 */
export const supabaseServer = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});
