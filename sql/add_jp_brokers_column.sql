-- 2026/10追加: 日本の証券会社での「公募(抽選)の取扱い」を銘柄ごとに記録する列
-- Supabase の SQL Editor に貼り付けて、Run を押してください(何度実行しても安全です)。
-- 中身の例: ["rakuten"]  ["rakuten","sbi"]  [](取扱いなし)
alter table ipo_companies add column if not exists jp_brokers jsonb default '[]'::jsonb;
