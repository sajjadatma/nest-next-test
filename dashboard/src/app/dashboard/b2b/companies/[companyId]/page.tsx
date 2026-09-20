import { redirect } from "next/navigation";

export default async function B2bCompanyMembersPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  redirect(`/dashboard/companies/${companyId}`);
}
