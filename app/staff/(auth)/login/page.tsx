"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, ErrorNote, inputClass, Spinner } from "@/components/ui";
import type { StaffOption } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffOption[] | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(true);
  const [mock, setMock] = useState(false);
  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/staff/options")
      .then((response) => response.json())
      .then((data) => {
        if (!data.success) throw new Error(data.message);
        setStaff(data.staff);
        setPasswordRequired(data.password_required);
        setMock(data.mock);
        setStaffId(data.staff[0]?.staff_id ?? "");
      })
      .catch((cause) => {
        setStaff([]);
        setError(cause instanceof Error && cause.message ? cause.message : "직원 목록을 불러오지 못했습니다.");
      });
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/staff/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ staff_id: staffId, password }),
      });
      const result = await response.json();
      if (result.success) {
        router.replace("/staff");
        router.refresh();
      } else setError(result.message ?? "로그인에 실패했습니다.");
    } catch {
      setError("네트워크 연결을 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 ring-1 ring-slate-200">
        <p className="text-[14px] font-semibold text-brand-600">상담 지원 AI Agent</p>
        <h1 className="mt-1 text-[24px] font-bold">직원 로그인</h1>

        {staff === null ? (
          <div className="mt-8 flex justify-center text-brand-600">
            <Spinner className="!size-6" />
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            <div>
              <label htmlFor="staff" className="mb-1.5 block text-[14px] font-semibold">
                직원
              </label>
              <select id="staff" className={inputClass} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                {staff.map((option) => (
                  <option key={option.staff_id} value={option.staff_id}>
                    {option.store_name} · {option.staff_id} ({option.role})
                  </option>
                ))}
              </select>
            </div>
            {passwordRequired ? (
              <div>
                <label htmlFor="password" className="mb-1.5 block text-[14px] font-semibold">
                  비밀번호
                </label>
                <input id="password" type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </div>
            ) : (
              mock && <p className="text-[13px] text-slate-500">MOCK 모드에서는 비밀번호 없이 들어갑니다.</p>
            )}
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" size="lg" loading={loading} disabled={!staffId}>
              들어가기
            </Button>
          </div>
        )}
      </form>
    </main>
  );
}
