-- Create return_orders table
CREATE TABLE IF NOT EXISTS public.return_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  order_id UUID,
  user_id UUID,
  return_type VARCHAR NOT NULL,
  reason VARCHAR NOT NULL,
  additional_details TEXT,
  bank_account_holder_name VARCHAR NOT NULL,
  bank_account_number VARCHAR NOT NULL,
  bank_ifsc_code VARCHAR NOT NULL,
  bank_name VARCHAR NOT NULL,
  refund_amount DECIMAL NOT NULL,
  status VARCHAR DEFAULT 'pending',
  admin_notes TEXT,
  admin_id UUID,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT return_orders_pkey PRIMARY KEY (id),
  CONSTRAINT return_orders_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT return_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT return_orders_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id)
);

-- Create return_order_items table
CREATE TABLE IF NOT EXISTS public.return_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  return_order_id UUID,
  order_item_id UUID,
  quantity INTEGER DEFAULT 1,
  return_reason VARCHAR,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT return_order_items_pkey PRIMARY KEY (id),
  CONSTRAINT return_order_items_return_order_id_fkey FOREIGN KEY (return_order_id) REFERENCES public.return_orders(id) ON DELETE CASCADE,
  CONSTRAINT return_order_items_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id)
);

-- Note: The return_orders_detailed VIEW is not created here. 
-- We will handle the join via Prisma include/queries instead of relying on a view.
-- If the view is absolutely required by other parts of the system, it should be created separately.
