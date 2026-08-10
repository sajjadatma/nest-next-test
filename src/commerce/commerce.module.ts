import { Module } from '@nestjs/common';
import { ConversationModule } from '../conversations/conversation.module';
import { CartRepository } from './cart/cart.repository';
import { CartService } from './cart/cart.service';
import { CheckoutHandoffController } from './checkout/checkout-handoff.controller';
import { CheckoutLinkService } from './checkout/checkout-link.service';
import { CommerceToolsService } from './commerce-tools.service';
import { ShippingReadRepository } from './shipping/shipping-read.repository';
import { ShippingReadService } from './shipping/shipping-read.service';
import { VariantReadService } from './variants/variant-read.service';
import { VariantRepository } from './variants/variant.repository';

@Module({
  imports: [ConversationModule],
  controllers: [CheckoutHandoffController],
  providers: [CommerceToolsService, VariantReadService, VariantRepository, ShippingReadService, ShippingReadRepository, CartRepository, CartService, CheckoutLinkService],
  exports: [CommerceToolsService],
})
export class CommerceModule {}
