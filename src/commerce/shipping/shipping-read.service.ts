import { Injectable } from '@nestjs/common';
import { ShippingReadRepository } from './shipping-read.repository';

export type ShippingMethod = {
  id: string;
  label: string;
  description?: string;
  eta: string;
  priceMinor: number;
};

@Injectable()
export class ShippingReadService {
  constructor(private readonly shipping: ShippingReadRepository) {}

  async availableMethods(): Promise<ShippingMethod[]> {
    const methods = await this.shipping.findActive();
    return methods.map((method) => ({
      id: method.id,
      label: method.label,
      ...(method.description ? { description: method.description } : {}),
      eta: method.eta,
      priceMinor: method.priceMinor,
    }));
  }
}
