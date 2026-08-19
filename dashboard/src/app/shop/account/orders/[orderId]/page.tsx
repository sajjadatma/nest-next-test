import { CustomerAccountClient } from "@/components/customer-account-client";

export default async function ShopAccountOrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <CustomerAccountClient view="orders" orderId={orderId} />;
}
