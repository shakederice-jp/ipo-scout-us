-- 米国版Supabase(ipo-scout-us)のSQL Editorで実行してください。
-- 上場後の値動き(初日騰落率など)の計算結果を保存する列を追加します。
alter table public.ipo_companies
  add column if not exists price_track jsonb;
