import { redirect } from "next/navigation";
import { StaffShell } from "@/components/staff/StaffShell";
import { getBackend } from "@/lib/backend";
import { USE_MOCK } from "@/lib/config";
import { getSession } from "@/lib/session";

export default async function StaffLayout({ children }: LayoutProps<"/staff">) {
  const session = await getSession();
  if (!session) redirect("/staff/login");

  let storeName = session.store_id;
  try {
    const staff = (await getBackend().listStaff()).find((s) => s.staff_id === session.staff_id);
    if (staff) storeName = staff.store_name;
  } catch {
    // 매장 이름을 못 불러와도 화면은 연다. 연결 문제는 상단에 표시된다.
  }

  return (
    <StaffShell staffId={session.staff_id} storeName={storeName} mock={USE_MOCK}>
      {children}
    </StaffShell>
  );
}
