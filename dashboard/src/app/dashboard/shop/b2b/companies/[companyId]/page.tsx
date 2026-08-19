import { CompanyMembersPage } from "@/components/b2b/b2b-management";

export default async function B2bCompanyMembersPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  return <CompanyMembersPage companyId={companyId} />;
}
