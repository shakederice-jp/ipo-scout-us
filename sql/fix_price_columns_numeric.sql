-- 2026/10追加: 価格帯・公募価格に小数(例: $4.25)を保存できるようにする
-- Supabase の SQL Editor に貼り付けて、Run を押してください(何度実行しても安全です)。
alter table ipo_companies alter column price_range_min type numeric using price_range_min::numeric;
alter table ipo_companies alter column price_range_max type numeric using price_range_max::numeric;
alter table ipo_companies alter column ipo_price type numeric using ipo_price::numeric;
