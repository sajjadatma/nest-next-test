import { CheckoutClient } from "@/components/checkout-client";
import { CheckoutHandoffClient } from "@/components/checkout-handoff-client";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout_token?: string }>;
}) {
  const { checkout_token } = await searchParams;
  if (checkout_token) return <CheckoutHandoffClient token={checkout_token} />;
  return <CheckoutClient />;
}
