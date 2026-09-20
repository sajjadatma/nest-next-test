import { CompanyMembersPage } from "@/components/b2b/b2b-management";
export default async function CompanyMembersPageRoute({ params }: { params: Promise<{ companyId: string }> }) { const { companyId } = await params; return <CompanyMembersPage companyId={companyId} />; }
