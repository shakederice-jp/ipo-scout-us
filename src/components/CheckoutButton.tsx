"use client";

import { CreditCard, Crown, Bell, BookOpen, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { PlanButton } from "@/components/PlanButton";
import { jpyMonth, jpyPerItem } from "@/lib/pricing";

type Plan = "plan_a" | "plan_b" | "plan_c" | "single";

const PLANS: {
  id: Plan;
  label: string;
  price: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    id: "plan_a",
    label: "A 分析プラン",
    price: jpyMonth("plan_a"),
    icon: <BookOpen className="h-3.5 w-3.5" aria-hidden />,
    description: "全IPO銘柄の超深度分析が読み放題",
  },
  {
    id: "plan_b",
    label: "B 分析＋通知プラン",
    price: jpyMonth("plan_b"),
    icon: <Bell className="h-3.5 w-3.5" aria-hidden />,
    description: "分析読み放題＋上場日・価格決定日・ロックアップ解除の通知",
  },
  {
    id: "plan_c",
    label: "C 総合プラン",
    price: jpyMonth("plan_c"),
    icon: <Crown className="h-3.5 w-3.5" aria-hidden />,
    description: "分析・通知に加え、日本版の週刊スライド(PDF)と予定の自動登録つき",
  },
  {
    id: "single",
    label: "シングルレポート",
    price: jpyPerItem("single"),
    icon: <Zap className="h-3.5 w-3.5" aria-hidden />,
    description: "特定の1銘柄だけ・永続閲覧",
  },
];

export function CheckoutButton({
  defaultPlan = "plan_c",
  stockId,
  availablePlans,
}: {
  defaultPlan?: Plan;
  stockId?: string;
  availablePlans?: Plan[];
}) {
  const [selectedPlan, setSelectedPlan] = useState<Plan>(defaultPlan);
  const visiblePlans = availablePlans ? PLANS.filter((p) => availablePlans.includes(p.id)) : PLANS;

  // ログイン後に ?buy=プラン名 付きで戻ってきたら、そのプランを選んだ状態にする
  // （実際の決済画面への移動は PlanButton が自動で行う）
  useEffect(() => {
    try {
      const buy = new URLSearchParams(window.location.search).get("buy");
      if (buy && visiblePlans.some((p) => p.id === buy)) setSelectedPlan(buy as Plan);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = visiblePlans.find((p) => p.id === selectedPlan) ?? visiblePlans[0];

  return (
    <div className="flex flex-col items-stretch gap-3">
      {/* プラン選択 */}
      <div className="grid grid-cols-2 gap-1.5">
        {visiblePlans.map((plan) => (
          <button
            key={plan.id}
            type="button"
            onClick={() => setSelectedPlan(plan.id)}
            className={[
              "flex flex-col items-start gap-0.5 rounded border px-2.5 py-2 text-left text-xs transition",
              selectedPlan === plan.id
                ? "border-[#1E3A66] bg-[#1E3A66]/10 text-[#1E3A66]"
                : "border-slate-300 bg-white text-slate-600 hover:border-[#1E3A66]",
            ].join(" ")}
          >
            <span className="flex items-center gap-1 font-semibold">
              {plan.icon}
              {plan.label}
            </span>
            <span className="font-bold tracking-wide">{plan.price}</span>
          </button>
        ))}
      </div>

      {/* 選択中プランの説明 */}
      <p className="text-xs text-slate-600 leading-relaxed">
        {current.description}
      </p>

      {/* 購入ボタン（ログイン済みなら決済画面へ直行／未ログインならログイン画面へ案内） */}
      <PlanButton
        key={current.id}
        plan={current.id}
        stockId={stockId}
        icon={<CreditCard className="h-4 w-4" aria-hidden />}
        label={`${current.label}を購入（${current.price}）`}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3.5 text-sm font-extrabold tracking-wide shadow-md transition bg-[#1E3A66] text-white hover:bg-[#16305a] disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}
