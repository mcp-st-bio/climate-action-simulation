import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** 브라우저에서 쓰는 클라이언트. anon 키만 가지므로 rooms 테이블을 읽고 Realtime을 구독할 수만 있다. */
export const supabaseBrowser = createClient(url, anonKey);
