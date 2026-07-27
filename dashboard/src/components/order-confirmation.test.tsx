import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { OrderConfirmation } from './order-confirmation';

describe('OrderConfirmation', () => {
  it('renders durable order, contact, and delivery details', async () => {
    server.use(http.get('http://127.0.0.1:5050/api/shop/orders/confirmation/token-1', () => HttpResponse.json({
      number: 'NEST-1234', status: 'PENDING', totalMinor: 5000, phone: '+1 555 0100', email: 'buyer@example.com', createdAt: new Date().toISOString(), confirmationEmailStatus: 'SENT',
      shippingAddress: { fullName: 'Jane Buyer', line1: '1 Market Street', city: 'Portland', postalCode: '97201', country: 'US' },
      items: [{ id: 'line-1', productName: 'Canvas Tote', unitPriceMinor: 2500, quantity: 2 }],
    })));
    render(<OrderConfirmation token="token-1" />);
    expect(await screen.findByRole('heading', { name: 'Thank you, Jane Buyer.' })).toBeInTheDocument();
    expect(screen.getByText('NEST-1234')).toBeInTheDocument();
    expect(screen.getByText(/1 Market Street/)).toBeInTheDocument();
    expect(screen.getByText('A copy of this confirmation was emailed to you.')).toBeInTheDocument();
  });
});
