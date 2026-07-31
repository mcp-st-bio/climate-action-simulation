import { PostgrestError } from "@supabase/supabase-js";

/**
 * PostgREST의 "행이 없음"(PGRST116)과 그 밖의 DB 오류를 구분한다.
 * 둘을 뭉뚱그려 404로 내보내면 스키마 오류가 "방을 찾을 수 없습니다"로 보여
 * 원인을 찾기 어려워진다.
 */
export function isRowNotFound(error: PostgrestError | null): boolean {
  return error?.code === "PGRST116";
}
