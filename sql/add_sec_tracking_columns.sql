-- 米国版Supabase(ipo-scout-us)のSQL Editorで実行してください。
-- SECの提出書類の追跡(sec-track)が、各社の進み具合を覚えておくための列を追加します。
alter table public.ipo_companies
  add column if not exists sec_stage text,        -- filed / amended / launched / priced / withdrawn
  add column if not exists sec_last_acc text,     -- 最後に処理したSEC書類の番号
  add column if not exists sec_last_form text,    -- 最後に処理した書類の種類(例: S-1/A)
  add column if not exists sec_last_filed date;   -- 最後に処理した書類の提出日
