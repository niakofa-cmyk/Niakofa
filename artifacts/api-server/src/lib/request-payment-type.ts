export type RequestPaymentType = "immediate" | "pay_it_forward" | "goodwill";

export const DEFAULT_REQUEST_PAYMENT_TYPE: RequestPaymentType = "goodwill";

export function resolveRequestPaymentType(
  paymentType: RequestPaymentType | null | undefined,
): RequestPaymentType {
  return paymentType ?? DEFAULT_REQUEST_PAYMENT_TYPE;
}
