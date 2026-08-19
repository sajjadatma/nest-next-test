import { OrderConfirmation } from "@/components/order-confirmation";

export default async function OrderConfirmationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <OrderConfirmation token={token} />;
}
