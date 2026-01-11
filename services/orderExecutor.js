import { supabase } from "../config/supabaseClient.js";
import crypto from "crypto";

/**
 * Order Executor Service
 * Handles automatic execution of scheduled orders with distributed locking,
 * retry logic, and comprehensive error handling
 */

const WORKER_ID = process.env.WORKER_ID || `worker-${crypto.randomBytes(4).toString('hex')}`;
const MAX_RETRY_ATTEMPTS = parseInt(process.env.MAX_RETRY_ATTEMPTS) || 3;
const LOCK_TIMEOUT_MS = parseInt(process.env.LOCK_TIMEOUT_MINUTES || 5) * 60 * 1000;
const RETRY_DELAYS = [5 * 60 * 1000, 15 * 60 * 1000, 30 * 60 * 1000]; // 5m, 15m, 30m

/**
 * Acquire distributed lock for order execution
 */
const acquireLock = async (orderId) => {
    const lockToken = `${WORKER_ID}_${Date.now()}`;
    const lockExpiry = new Date(Date.now() + LOCK_TIMEOUT_MS);

    try {
        const { data, error } = await supabase
            .from('scheduled_orders')
            .update({
                lock_token: lockToken,
                lock_expires_at: lockExpiry.toISOString()
            })
            .eq('id', orderId)
            .or(`lock_token.is.null,lock_expires_at.lt.${new Date().toISOString()}`)
            .select();

        if (error) {
            console.error('Lock acquisition error:', error);
            return null;
        }

        return data && data.length > 0 ? lockToken : null;
    } catch (error) {
        console.error('Error acquiring lock:', error);
        return null;
    }
};

/**
 * Release distributed lock
 */
const releaseLock = async (orderId, lockToken) => {
    try {
        await supabase
            .from('scheduled_orders')
            .update({
                lock_token: null,
                lock_expires_at: null
            })
            .eq('id', orderId)
            .eq('lock_token', lockToken);
    } catch (error) {
        console.error('Error releasing lock:', error);
    }
};

/**
 * Log execution attempt
 */
const logExecutionAttempt = async (scheduledOrderId, attemptNumber, status, details = {}) => {
    try {
        await supabase
            .from('order_execution_logs')
            .insert([{
                scheduled_order_id: scheduledOrderId,
                attempt_number: attemptNumber,
                status,
                inventory_check_passed: details.inventory_check_passed || false,
                payment_check_passed: details.payment_check_passed || false,
                error_message: details.error_message,
                error_code: details.error_code,
                execution_duration_ms: details.execution_duration_ms,
                worker_id: WORKER_ID,
                metadata: details.metadata || {}
            }]);
    } catch (error) {
        console.error('Error logging execution attempt:', error);
    }
};

/**
 * Validate inventory for cart items
 */
const validateInventory = async (cartItems) => {
    try {
        for (const item of cartItems) {
            const { data: product, error } = await supabase
                .from('products')
                .select('id, name, stock_quantity, is_active')
                .eq('id', item.product_id)
                .single();

            if (error || !product) {
                return {
                    valid: false,
                    reason: `Product not found: ${item.product_id}`
                };
            }

            if (!product.is_active) {
                return {
                    valid: false,
                    reason: `Product discontinued: ${product.name}`
                };
            }

            if (product.stock_quantity < item.quantity) {
                return {
                    valid: false,
                    reason: `Insufficient stock for ${product.name}. Available: ${product.stock_quantity}, Required: ${item.quantity}`
                };
            }
        }

        return { valid: true };
    } catch (error) {
        return {
            valid: false,
            reason: `Inventory check failed: ${error.message}`
        };
    }
};

/**
 * Validate payment
 */
const validatePayment = async (scheduledOrder) => {
    try {
        const { payment_method, payment_intent_id, total_amount } = scheduledOrder;

        // COD always valid
        if (payment_method === 'COD') {
            return { valid: true };
        }

        // Wallet validation
        if (payment_method === 'WALLET') {
            const { data: wallet, error } = await supabase
                .from('wallets')
                .select('balance')
                .eq('user_id', scheduledOrder.user_id)
                .single();

            if (error || !wallet) {
                return {
                    valid: false,
                    reason: 'Wallet not found'
                };
            }

            if (wallet.balance < total_amount) {
                return {
                    valid: false,
                    reason: `Insufficient wallet balance. Required: ₹${total_amount}, Available: ₹${wallet.balance}`
                };
            }

            return { valid: true };
        }

        // Razorpay validation
        if (payment_method === 'RAZORPAY') {
            if (!payment_intent_id) {
                return {
                    valid: false,
                    reason: 'Payment intent ID missing'
                };
            }

            // Here you would validate with Razorpay API
            // For now, we'll assume it's valid if payment_intent_id exists
            return { valid: true };
        }

        return {
            valid: false,
            reason: 'Unsupported payment method'
        };
    } catch (error) {
        return {
            valid: false,
            reason: `Payment validation failed: ${error.message}`
        };
    }
};

/**
 * Create actual order from scheduled order
 */
const createOrder = async (scheduledOrder) => {
    try {
        const orderData = {
            user_id: scheduledOrder.user_id,
            address_id: scheduledOrder.address_id,
            total_amount: scheduledOrder.total_amount,
            payment_method: scheduledOrder.payment_method,
            payment_status: scheduledOrder.payment_method === 'COD' ? 'PENDING' : 'PAID',
            order_status: 'PENDING',
            items: scheduledOrder.cart_items,
            metadata: {
                ...scheduledOrder.metadata,
                scheduled_order_id: scheduledOrder.id,
                scheduled_at: scheduledOrder.scheduled_at
            }
        };

        const { data: order, error } = await supabase
            .from('orders')
            .insert([orderData])
            .select()
            .single();

        if (error) throw error;

        return { success: true, order };
    } catch (error) {
        return {
            success: false,
            reason: `Order creation failed: ${error.message}`
        };
    }
};

/**
 * Execute a single scheduled order
 */
export const executeScheduledOrder = async (orderId, workerId = WORKER_ID) => {
    const startTime = Date.now();
    let lockToken = null;

    try {
        // Acquire lock
        lockToken = await acquireLock(orderId);
        if (!lockToken) {
            return {
                success: false,
                message: 'Could not acquire lock (another worker processing or recently processed)'
            };
        }

        // Fetch order details
        const { data: scheduledOrder, error: fetchError } = await supabase
            .from('scheduled_orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (fetchError || !scheduledOrder) {
            await releaseLock(orderId, lockToken);
            return {
                success: false,
                message: 'Scheduled order not found'
            };
        }

        // Check if already processed
        if (scheduledOrder.status !== 'SCHEDULED') {
            await releaseLock(orderId, lockToken);
            return {
                success: false,
                message: `Order already in status: ${scheduledOrder.status}`
            };
        }

        // Update status to PROCESSING
        await supabase
            .from('scheduled_orders')
            .update({
                status: 'PROCESSING',
                last_execution_attempt: new Date().toISOString(),
                execution_attempts: scheduledOrder.execution_attempts + 1
            })
            .eq('id', orderId);

        const attemptNumber = scheduledOrder.execution_attempts + 1;

        // Validate inventory
        const inventoryCheck = await validateInventory(scheduledOrder.cart_items);
        if (!inventoryCheck.valid) {
            await supabase
                .from('scheduled_orders')
                .update({
                    status: 'FAILED',
                    failure_reason: inventoryCheck.reason
                })
                .eq('id', orderId);

            await logExecutionAttempt(orderId, attemptNumber, 'FAILED', {
                inventory_check_passed: false,
                error_message: inventoryCheck.reason,
                error_code: 'INVENTORY_UNAVAILABLE',
                execution_duration_ms: Date.now() - startTime
            });

            await releaseLock(orderId, lockToken);

            return {
                success: false,
                message: inventoryCheck.reason
            };
        }

        // Validate payment
        const paymentCheck = await validatePayment(scheduledOrder);
        if (!paymentCheck.valid) {
            // Handle retry logic
            if (attemptNumber < MAX_RETRY_ATTEMPTS) {
                const nextRetryDelay = RETRY_DELAYS[attemptNumber - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
                const nextRetryAt = new Date(Date.now() + nextRetryDelay);

                await supabase
                    .from('scheduled_orders')
                    .update({
                        status: 'SCHEDULED', // Back to scheduled for retry
                        scheduled_at: nextRetryAt.toISOString()
                    })
                    .eq('id', orderId);

                await logExecutionAttempt(orderId, attemptNumber, 'RETRY', {
                    inventory_check_passed: true,
                    payment_check_passed: false,
                    error_message: paymentCheck.reason,
                    error_code: 'PAYMENT_FAILED',
                    execution_duration_ms: Date.now() - startTime,
                    metadata: { next_retry_at: nextRetryAt.toISOString() }
                });

                await releaseLock(orderId, lockToken);

                return {
                    success: false,
                    message: `Payment failed. Retry scheduled for ${nextRetryAt.toISOString()}`,
                    retry: true
                };
            } else {
                // Max retries reached
                await supabase
                    .from('scheduled_orders')
                    .update({
                        status: 'FAILED',
                        failure_reason: `Payment failed after ${MAX_RETRY_ATTEMPTS} attempts: ${paymentCheck.reason}`
                    })
                    .eq('id', orderId);

                await logExecutionAttempt(orderId, attemptNumber, 'FAILED', {
                    inventory_check_passed: true,
                    payment_check_passed: false,
                    error_message: paymentCheck.reason,
                    error_code: 'PAYMENT_FAILED_MAX_RETRIES',
                    execution_duration_ms: Date.now() - startTime
                });

                await releaseLock(orderId, lockToken);

                return {
                    success: false,
                    message: `Payment failed after ${MAX_RETRY_ATTEMPTS} attempts`
                };
            }
        }

        // Create order
        const orderResult = await createOrder(scheduledOrder);
        if (!orderResult.success) {
            await supabase
                .from('scheduled_orders')
                .update({
                    status: 'FAILED',
                    failure_reason: orderResult.reason
                })
                .eq('id', orderId);

            await logExecutionAttempt(orderId, attemptNumber, 'FAILED', {
                inventory_check_passed: true,
                payment_check_passed: true,
                error_message: orderResult.reason,
                error_code: 'ORDER_CREATION_FAILED',
                execution_duration_ms: Date.now() - startTime
            });

            await releaseLock(orderId, lockToken);

            return {
                success: false,
                message: orderResult.reason
            };
        }

        // Success! Update scheduled order
        await supabase
            .from('scheduled_orders')
            .update({
                status: 'PLACED',
                placed_order_id: orderResult.order.id,
                payment_status: 'COMPLETED'
            })
            .eq('id', orderId);

        await logExecutionAttempt(orderId, attemptNumber, 'SUCCESS', {
            inventory_check_passed: true,
            payment_check_passed: true,
            execution_duration_ms: Date.now() - startTime,
            metadata: { order_id: orderResult.order.id }
        });

        await releaseLock(orderId, lockToken);

        return {
            success: true,
            message: 'Order placed successfully',
            data: {
                order_id: orderResult.order.id,
                scheduled_order_id: orderId
            }
        };

    } catch (error) {
        console.error('Error executing scheduled order:', error);

        if (lockToken) {
            await releaseLock(orderId, lockToken);
        }

        return {
            success: false,
            message: `Execution error: ${error.message}`
        };
    }
};

/**
 * Main function to execute all due scheduled orders
 */
export const executeScheduledOrders = async () => {
    try {
        console.log(`[${new Date().toISOString()}] Checking for scheduled orders...`);

        // Fetch orders due for execution
        const { data: orders, error } = await supabase
            .from('scheduled_orders')
            .select('id, scheduled_at, user_id')
            .eq('status', 'SCHEDULED')
            .lte('scheduled_at', new Date().toISOString())
            .order('scheduled_at', { ascending: true })
            .limit(50); // Process max 50 orders per run

        if (error) {
            console.error('Error fetching scheduled orders:', error);
            return;
        }

        if (!orders || orders.length === 0) {
            console.log('No scheduled orders due for execution');
            return;
        }

        console.log(`Found ${orders.length} orders to execute`);

        // Execute orders sequentially to avoid overwhelming the system
        for (const order of orders) {
            console.log(`Executing order ${order.id}...`);
            const result = await executeScheduledOrder(order.id);
            console.log(`Result: ${result.message}`);
        }

        console.log('Scheduled order execution completed');

    } catch (error) {
        console.error('Error in executeScheduledOrders:', error);
    }
};
