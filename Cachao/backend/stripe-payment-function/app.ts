import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import mariadb from 'mariadb';
import Stripe from 'stripe';

let pool: mariadb.Pool | null = null;
let stripeClient: Stripe | null = null;

function getPool(): mariadb.Pool {
  if (!pool) {
    const host = process.env.DB_HOST || 'localhost';
    const port = parseInt(process.env.DB_PORT || '3306');
    const user = process.env.DB_USER || 'admin';
    const password = process.env.DB_PASSWORD || '';
    const database = process.env.DB_NAME || 'cachao';

    const isLocal = host === 'host.docker.internal' || host === 'localhost' || host === '127.0.0.1';

    pool = mariadb.createPool({
      host,
      port,
      user,
      password,
      database,
      connectionLimit: 1,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      allowPublicKeyRetrieval: isLocal,
      connectTimeout: 10000,
    });
  }
  return pool;
}

function getStripeClient(): Stripe {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is not set');
    }
    stripeClient = new Stripe(secretKey, {
      apiVersion: '2024-11-20.acacia',
    });
  }
  return stripeClient;
}

function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token, Accept, Origin, X-Requested-With',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Calculate ticket price with discounts
 */
async function calculateTicketPrice(
  connection: mariadb.PoolConnection,
  ticketId: string,
  quantity: number,
  discountCode?: string
): Promise<{
  unitPrice: number;
  discountAmount: number;
  totalAmount: number;
  discountCodeId?: string;
  appliedDiscount?: { type: string; value: number };
}> {
  // Get ticket base price
  const tickets = await connection.query(
    'SELECT id, price FROM tickets WHERE id = ?',
    [ticketId]
  ) as any[];

  if (tickets.length === 0) {
    throw new Error('Ticket not found');
  }

  const basePrice = parseFloat(tickets[0].price);
  let unitPrice = basePrice;
  let discountAmount = 0;
  let discountCodeId: string | undefined;
  let appliedDiscount: { type: string; value: number } | undefined;

  // Apply date-based discount if available
  const today = new Date().toISOString().split('T')[0];
  const dateDiscounts = await connection.query(
    `SELECT discount_type, discount_value 
     FROM ticket_discounts 
     WHERE ticket_id = ? AND valid_until >= ? AND is_active = TRUE
     ORDER BY valid_until ASC
     LIMIT 1`,
    [ticketId, today]
  ) as any[];

  if (dateDiscounts.length > 0) {
    const discount = dateDiscounts[0];
    if (discount.discount_type === 'percentage') {
      const discountValue = parseFloat(discount.discount_value);
      discountAmount = (basePrice * discountValue) / 100;
      appliedDiscount = { type: 'date_percentage', value: discountValue };
    } else {
      discountAmount = parseFloat(discount.discount_value);
      appliedDiscount = { type: 'date_fixed', value: discountAmount };
    }
    unitPrice = Math.max(0, basePrice - discountAmount);
  }

  // Apply discount code if provided
  if (discountCode) {
    const eventId = (await connection.query(
      'SELECT event_id FROM tickets WHERE id = ?',
      [ticketId]
    ) as any[])[0]?.event_id;

    if (eventId) {
      const codes = await connection.query(
        `SELECT id, discount_type, discount_value, max_uses, used_count, valid_from, valid_until, is_active
         FROM discount_codes
         WHERE event_id = ? AND code = ? AND is_active = TRUE`,
        [eventId, discountCode.toUpperCase()]
      ) as any[];

      if (codes.length > 0) {
        const code = codes[0];
        const now = new Date();
        const validFrom = code.valid_from ? new Date(code.valid_from) : null;
        const validUntil = code.valid_until ? new Date(code.valid_until) : null;

        if (
          (!validFrom || validFrom <= now) &&
          (!validUntil || validUntil >= now) &&
          (!code.max_uses || code.used_count < code.max_uses)
        ) {
          discountCodeId = code.id.toString();
          let codeDiscount = 0;

          if (code.discount_type === 'percentage') {
            const discountValue = parseFloat(code.discount_value);
            codeDiscount = (unitPrice * discountValue) / 100;
            appliedDiscount = { type: 'code_percentage', value: discountValue };
          } else {
            codeDiscount = parseFloat(code.discount_value);
            appliedDiscount = { type: 'code_fixed', value: codeDiscount };
          }

          // Discount code overrides date discount
          discountAmount = codeDiscount;
          unitPrice = Math.max(0, basePrice - discountAmount);
        }
      }
    }
  }

  const totalAmount = unitPrice * quantity;

  return {
    unitPrice,
    discountAmount,
    totalAmount,
    discountCodeId,
    appliedDiscount,
  };
}

/**
 * Create Stripe checkout session for ticket purchase
 */
async function createTicketCheckoutSession(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  let connection: mariadb.PoolConnection | null = null;
  try {
    console.log('Creating checkout session, path:', event.path);
    console.log('Path parameters:', JSON.stringify(event.pathParameters));
    
    const eventId = event.pathParameters?.id;
    const ticketId = event.pathParameters?.ticketId;

    if (!eventId || !ticketId) {
      console.error('Missing eventId or ticketId:', { eventId, ticketId });
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID and Ticket ID are required',
        }),
      };
    }
    
    console.log('Processing checkout for event:', eventId, 'ticket:', ticketId);

    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    const { quantity = 1, email, discount_code } = body;

    if (!email) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Email is required',
        }),
      };
    }

    if (quantity < 1) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Quantity must be at least 1',
        }),
      };
    }

    try {
      connection = await getPool().getConnection();
      console.log('Database connection established');
    } catch (dbError: any) {
      console.error('Failed to get database connection:', dbError);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Database connection failed',
          details: dbError?.message || 'Unknown database error',
        }),
      };
    }

    if (!connection) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Database connection not available',
        }),
      };
    }

    // Verify ticket exists and is available
    console.log('Querying ticket:', ticketId, 'for event:', eventId);
    const tickets = await connection.query(
      `SELECT id, name, price, max_quantity, sold_quantity, is_active, event_id
       FROM tickets
       WHERE id = ? AND event_id = ?`,
      [ticketId, eventId]
    ) as any[];

    if (tickets.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Ticket not found',
        }),
      };
    }

    const ticket = tickets[0];

    if (!ticket.is_active) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Ticket is not available for purchase',
        }),
      };
    }

    if (ticket.max_quantity && ticket.sold_quantity + quantity > ticket.max_quantity) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: `Only ${ticket.max_quantity - ticket.sold_quantity} tickets available`,
        }),
      };
    }

    // Calculate price with discounts
    console.log('Calculating price for ticket:', ticketId, 'quantity:', quantity, 'discount_code:', discount_code);
    let priceCalculation;
    try {
      priceCalculation = await calculateTicketPrice(
        connection,
        ticketId,
        quantity,
        discount_code
      );
      console.log('Price calculation result:', priceCalculation);
    } catch (priceError: any) {
      console.error('Error calculating price:', priceError);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Failed to calculate ticket price',
          details: priceError?.message || 'Unknown price calculation error',
        }),
      };
    }

    // Get user cognito_sub if logged in (from request context or Authorization header)
    let cognitoSub: string | null = null;
    
    // Try to get from authorizer claims (if route has auth enabled)
    const claims = event.requestContext?.authorizer?.claims;
    if (claims?.sub) {
      cognitoSub = claims.sub;
      console.log('Got cognito_sub from authorizer claims:', cognitoSub);
    } else {
      // Since this route has Auth: NONE, decode JWT token manually from Authorization header
      const authHeader = event.headers.Authorization || event.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.substring(7); // Remove "Bearer " prefix
          const parts = token.split('.');
          if (parts.length === 3) {
            // Decode JWT payload (second part)
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
            cognitoSub = payload.sub || null;
            console.log('Decoded cognito_sub from JWT token:', cognitoSub);
          }
        } catch (decodeError: any) {
          console.error('Error decoding JWT token:', decodeError);
          // Continue without cognito_sub - will be a guest checkout
        }
      }
    }
    
    // If still no cognito_sub, it's a guest checkout
    if (!cognitoSub) {
      console.log('No cognito_sub found - this is a guest checkout');
    } else {
      console.log('✅ cognito_sub captured for ticket order:', cognitoSub);
    }
    
    console.log('Creating ticket order with:', {
      eventId,
      ticketId,
      cognitoSub,
      email,
      quantity,
    });

    // Create order record
    // Note: user_id is set to NULL since users table uses cognito_sub as primary key (no id column)
    const orderResult = await connection.query(
      `INSERT INTO ticket_orders 
       (event_id, ticket_id, user_id, cognito_sub, email, quantity, unit_price, discount_amount, discount_code_id, total_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        eventId,
        ticketId,
        null, // user_id is NULL since users table doesn't have an id column
        cognitoSub,
        email,
        quantity,
        priceCalculation.unitPrice,
        priceCalculation.discountAmount,
        priceCalculation.discountCodeId || null,
        priceCalculation.totalAmount,
      ]
    ) as any;

    const orderId = orderResult.insertId;

    // Get event details for checkout
    const events = await connection.query(
      'SELECT id, name FROM events WHERE id = ?',
      [eventId]
    ) as any[];

    const eventName = events.length > 0 ? events[0].name : 'Event';

    // Create Stripe checkout session
    console.log('Initializing Stripe client...');
    let stripe: Stripe;
    try {
      stripe = getStripeClient();
      console.log('Stripe client initialized');
    } catch (stripeError: any) {
      console.error('Error initializing Stripe client:', stripeError);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: stripeError.message || 'Failed to initialize payment processor',
        }),
      };
    }
    const origin = event.headers.origin || event.headers.Origin || '';
    const baseUrl = origin || 'http://localhost:3000';
    console.log('Creating Stripe checkout session with baseUrl:', baseUrl);

    let session;
    try {
      session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `${ticket.name} - ${eventName}`,
              description: `Ticket for ${eventName}`,
            },
            unit_amount: Math.round(priceCalculation.unitPrice * 100), // Convert to cents
          },
          quantity: quantity,
        },
      ],
      mode: 'payment',
      success_url: `${baseUrl}/events/${eventId}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/events/${eventId}?payment=cancelled`,
      customer_email: email,
      metadata: {
        order_id: orderId.toString(),
        event_id: eventId,
        ticket_id: ticketId,
      },
    });
    console.log('Stripe checkout session created:', session.id);
    } catch (stripeSessionError: any) {
      console.error('Error creating Stripe checkout session:', stripeSessionError);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Failed to create checkout session',
          details: stripeSessionError?.message || 'Unknown Stripe error',
        }),
      };
    }

    // Update order with checkout session ID
    try {
      await connection.query(
        'UPDATE ticket_orders SET stripe_checkout_session_id = ? WHERE id = ?',
        [session.id, orderId]
      );
      console.log('Order updated with checkout session ID');
    } catch (updateError: any) {
      console.error('Error updating order with checkout session ID:', updateError);
      // Don't fail the request if this update fails - the order is already created
    }

    console.log('Checkout session created successfully:', session.id);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        checkout_url: session.url,
        session_id: session.id,
      }),
    };
  } catch (error: any) {
    console.error('Unexpected error creating checkout session:', error);
    console.error('Error stack:', error.stack);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to create checkout session',
        details: error.stack || 'Unknown error',
      }),
    };
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Handle Stripe events from EventBridge or Webhook
 * Supports both EventBridge (preferred) and direct webhook (fallback)
 */
async function handleStripeEvent(
  event: APIGatewayProxyEvent | any
): Promise<APIGatewayProxyResult | void> {
  let connection: mariadb.PoolConnection | null = null;
  try {
    let stripeEvent: Stripe.Event;

    // Check if this is an EventBridge event (from AWS EventBridge)
    // Stripe sends events with source: 'stripe.com' and detail-type: 'checkout.session.completed'
    // EventBridge wraps it: { source: 'stripe.com', 'detail-type': 'checkout.session.completed', detail: { ... } }
    const isEventBridge = event.source === 'stripe.com' || 
                         event.source === 'aws.events' || 
                         event['detail-type'] || 
                         (event.detail && typeof event.detail === 'object' && !event.body);
    
    if (isEventBridge) {
      // EventBridge format: event.detail contains the Stripe event object
      // The detail contains the full Stripe event structure
      console.log('🔔 Received EventBridge event');
      console.log('Event source:', event.source);
      console.log('Event detail-type:', event['detail-type']);
      console.log('Full event structure:', JSON.stringify(event, null, 2));
      
      // Stripe EventBridge format: event.detail contains the full Stripe event object
      // Based on actual Stripe event structure you provided:
      // EventBridge wraps it: {
      //   "source": "stripe.com",
      //   "detail-type": "checkout.session.completed",
      //   "detail": {
      //     "type": "checkout.session.completed",
      //     "id": "evt_xxx",
      //     "data": {
      //       "object": {
      //         "id": "cs_test_xxx",
      //         "metadata": { "order_id": "8" },
      //         "payment_intent": "pi_xxx"
      //       }
      //     }
      //   }
      // }
      console.log('🔍 Parsing EventBridge event detail...');
      console.log('   event.detail type:', typeof event.detail);
      console.log('   event.detail keys:', event.detail ? Object.keys(event.detail) : 'null');
      
      if (event.detail) {
        // Check if event.detail is the full Stripe event (has type, id, data, etc.)
        if (event.detail.type && event.detail.id && event.detail.data) {
          // This is the full Stripe event structure - use it directly
          stripeEvent = event.detail as Stripe.Event;
          console.log('✅ Found complete Stripe event in event.detail');
          console.log('   Event type:', stripeEvent.type);
          console.log('   Event ID:', stripeEvent.id);
          console.log('   Has data.object:', !!stripeEvent.data?.object);
        } else if (event.detail.data && event.detail.data.object) {
          // Partial structure - construct the event
          stripeEvent = {
            type: event.detail.type || event['detail-type'] || 'checkout.session.completed',
            id: event.detail.id || event.id || `evt_${Date.now()}`,
            object: 'event',
            data: event.detail.data,
            created: event.detail.created || Math.floor(Date.now() / 1000),
            livemode: event.detail.livemode || false,
            api_version: event.detail.api_version || null,
            pending_webhooks: event.detail.pending_webhooks || 0,
            request: event.detail.request || null,
          } as Stripe.Event;
          console.log('✅ Constructed Stripe event from partial detail structure');
        } else {
          // Fallback: treat the entire detail as the event
          stripeEvent = event.detail as Stripe.Event;
          console.log('⚠️ Using event.detail as-is (fallback)');
        }
      } else {
        // If no detail, try to use the event itself
        stripeEvent = event as Stripe.Event;
        console.log('⚠️ Using event itself as Stripe event (last resort)');
      }
      
      // Additional validation
      if (!stripeEvent || !stripeEvent.type) {
        console.error('❌ Failed to extract Stripe event type!');
        console.error('   Full event structure:', JSON.stringify(event, null, 2));
        throw new Error('Invalid Stripe event structure: missing type');
      }
      
      if (!stripeEvent.data || !stripeEvent.data.object) {
        console.error('❌ Failed to extract Stripe event data.object!');
        console.error('   stripeEvent.data:', JSON.stringify(stripeEvent.data, null, 2));
        throw new Error('Invalid Stripe event structure: missing data.object');
      }
      
      console.log('📋 Parsed Stripe event type:', stripeEvent?.type);
      console.log('📋 Stripe event ID:', stripeEvent?.id);
      if (stripeEvent?.data?.object) {
        console.log('📋 Stripe event object type:', (stripeEvent.data.object as any).object);
        console.log('📋 Stripe event data object:', JSON.stringify(stripeEvent.data.object, null, 2));
      } else {
        console.error('❌ Stripe event has no data.object!');
        console.error('Full stripeEvent:', JSON.stringify(stripeEvent, null, 2));
      }
      
      // Validate that we have a proper Stripe event
      if (!stripeEvent || !stripeEvent.type) {
        console.error('❌ Failed to parse Stripe event from EventBridge!');
        console.error('Original event:', JSON.stringify(event, null, 2));
        throw new Error('Invalid Stripe event structure from EventBridge');
      }
    } else {
      // Webhook format (fallback for direct webhooks)
      const stripe = getStripeClient();
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Webhook secret not configured',
          }),
        };
      }

      const sig = event.headers?.['stripe-signature'] || event.headers?.['Stripe-Signature'];
      if (!sig) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Missing stripe-signature header',
          }),
        };
      }

      try {
        const body = event.isBase64Encoded
          ? Buffer.from(event.body || '', 'base64').toString('utf-8')
          : event.body || '';
        stripeEvent = stripe.webhooks.constructEvent(body, sig, webhookSecret);
        console.log('Received webhook event:', stripeEvent.type);
      } catch (err: any) {
        console.error('Webhook signature verification failed:', err.message);
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: `Webhook Error: ${err.message}`,
          }),
        };
      }
    }

    connection = await getPool().getConnection();

    // Handle the event
    if (stripeEvent.type === 'checkout.session.completed') {
      console.log('✅ Processing checkout.session.completed event');
      
      // Validate event structure
      if (!stripeEvent.data) {
        console.error('❌ stripeEvent.data is missing!');
        console.error('   Full stripeEvent:', JSON.stringify(stripeEvent, null, 2));
        throw new Error('Stripe event missing data');
      }
      
      if (!stripeEvent.data.object) {
        console.error('❌ stripeEvent.data.object is missing!');
        console.error('   stripeEvent.data:', JSON.stringify(stripeEvent.data, null, 2));
        throw new Error('Stripe event missing data.object');
      }
      
      const session = stripeEvent.data.object as Stripe.Checkout.Session;
      console.log('📋 Session object type:', (session as any).object);
      console.log('📋 Session ID:', session.id);
      console.log('📋 Session metadata type:', typeof session.metadata);
      console.log('📋 Session metadata:', JSON.stringify(session.metadata, null, 2));
      console.log('📋 Session payment_intent:', session.payment_intent);
      console.log('📋 Full session object keys:', Object.keys(session));
      
      // Validate metadata exists
      if (!session.metadata) {
        console.error('❌ Session metadata is missing!');
        console.error('   Full session object:', JSON.stringify(session, null, 2));
        throw new Error('Checkout session missing metadata');
      }
      
      const orderId = session.metadata?.order_id;
      console.log('🔍 Extracted order_id from metadata:', orderId);
      console.log('🔍 Order ID type:', typeof orderId);
      console.log('🔍 Order ID value:', orderId);
      console.log('🔍 Full session metadata:', JSON.stringify(session.metadata, null, 2));

      if (orderId) {
        // Convert orderId to number if it's a string
        const orderIdNum = typeof orderId === 'string' ? parseInt(orderId, 10) : orderId;
        console.log('🔄 Updating order', orderIdNum, 'to paid status');
        
        // Use paying customer's email so profile "My Tickets" can match (by email) when they log in
        const customerEmail = (session as any).customer_email ?? (session as any).customer_details?.email ?? null;
        
        // Update order status and email (email = who actually paid, for profile matching)
        const updateResult = await connection.query(
          customerEmail
            ? `UPDATE ticket_orders 
               SET status = 'paid', stripe_payment_intent_id = ?, email = ?
               WHERE id = ?`
            : `UPDATE ticket_orders 
               SET status = 'paid', stripe_payment_intent_id = ?
               WHERE id = ?`,
          customerEmail
            ? [session.payment_intent as string, customerEmail, orderIdNum]
            : [session.payment_intent as string, orderIdNum]
        );
        console.log('✅ Order update result:', updateResult);
        console.log('✅ Rows affected:', (updateResult as any).affectedRows || 'unknown');

        // Update ticket sold_quantity
        const orders = await connection.query(
          'SELECT ticket_id, quantity FROM ticket_orders WHERE id = ?',
          [orderIdNum]
        ) as any[];

        if (orders.length > 0) {
          const order = orders[0];
          console.log('🔄 Updating ticket sold_quantity for ticket_id:', order.ticket_id, 'quantity:', order.quantity);
          await connection.query(
            'UPDATE tickets SET sold_quantity = sold_quantity + ? WHERE id = ?',
            [order.quantity, order.ticket_id]
          );
          console.log('✅ Ticket sold_quantity updated');
        } else {
          console.log('⚠️ No order found with id:', orderId);
        }

        // Update discount code used count if applicable
        const orderDetails = await connection.query(
          'SELECT discount_code_id FROM ticket_orders WHERE id = ?',
          [orderIdNum]
        ) as any[];

        if (orderDetails.length > 0 && orderDetails[0].discount_code_id) {
          console.log('🔄 Updating discount code used_count for code_id:', orderDetails[0].discount_code_id);
          await connection.query(
            'UPDATE discount_codes SET used_count = used_count + 1 WHERE id = ?',
            [orderDetails[0].discount_code_id]
          );
          console.log('✅ Discount code used_count updated');
        }
        console.log('✅ Successfully processed checkout.session.completed event for order:', orderId);
      } else {
        console.error('❌ No order_id found in session metadata!');
        console.error('Session metadata:', JSON.stringify(session.metadata, null, 2));
      }
    } else {
      console.log('ℹ️ Event type is not checkout.session.completed, ignoring:', stripeEvent.type);
    }

    // For EventBridge, we don't return HTTP response
    if (isEventBridge) {
      console.log('✅ EventBridge event processed, returning void');
      return; // EventBridge handler returns void
    }

    // For webhook, return HTTP response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({ received: true }),
    };
  } catch (error: any) {
    console.error('Error handling Stripe event:', error);
    
    // For EventBridge, throw to trigger retry
    if (isEventBridge) {
      console.error('❌ EventBridge event failed, throwing for retry');
      throw error;
    }

    // For webhook, return error response
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to handle event',
      }),
    };
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Lambda handler for EventBridge events (preferred)
 */
export const eventBridgeHandler = async (event: any): Promise<void> => {
  try {
    console.log('🚀 EventBridge handler invoked');
    console.log('📦 Event structure:', JSON.stringify(event, null, 2));
    console.log('📦 Event source:', event.source);
    console.log('📦 Event detail-type:', event['detail-type']);
    console.log('📦 Event has detail:', !!event.detail);
    
    const result = await handleStripeEvent(event);
    
    // If handleStripeEvent returns void (for EventBridge), that's expected
    if (result) {
      console.log('⚠️ handleStripeEvent returned a result (unexpected for EventBridge):', result);
    } else {
      console.log('✅ EventBridge event processed successfully (void return)');
    }
  } catch (error: any) {
    console.error('❌ Error processing EventBridge event:', error);
    console.error('Error stack:', error.stack);
    throw error; // EventBridge will retry
  }
};

/**
 * Lambda handler for API Gateway (webhook fallback)
 */

/**
 * Lambda handler for API Gateway (webhook fallback)
 */
export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    console.log('Lambda handler invoked, method:', event.httpMethod, 'path:', event.path);
    console.log('Event:', JSON.stringify({
      path: event.path,
      httpMethod: event.httpMethod,
      pathParameters: event.pathParameters,
      queryStringParameters: event.queryStringParameters,
    }, null, 2));
    
    // Handle CORS preflight requests
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS preflight request');
      return {
        statusCode: 200,
        headers: {
          ...getCorsHeaders(),
        },
        body: '',
      };
    }

    // Normalize path - remove /Prod prefix if present
    let path = event.path || '';
    console.log('Original path:', path);
    if (path.startsWith('/Prod')) {
      path = path.substring(5);
      console.log('After removing /Prod:', path);
    }
    if (!path.startsWith('/')) {
      path = '/' + path;
    }
    console.log('Normalized path:', path);
    
    // POST /events/:id/tickets/:ticketId/checkout
    const checkoutMatch = path.match(/^\/events\/(\d+)\/tickets\/(\d+)\/checkout$/);
    console.log('Checkout match:', checkoutMatch);
    if (checkoutMatch && event.httpMethod === 'POST') {
      console.log('Processing checkout request');
      if (!event.pathParameters) {
        event.pathParameters = {};
      }
      event.pathParameters.id = checkoutMatch[1];
      event.pathParameters.ticketId = checkoutMatch[2];
      console.log('Path parameters set:', event.pathParameters);
      return await createTicketCheckoutSession(event);
    }

    // POST /webhooks/stripe (fallback for direct webhooks)
    if (path === '/webhooks/stripe' && event.httpMethod === 'POST') {
      return await handleStripeEvent(event);
    }

    console.log('No route matched, returning 404');
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: 'Not found',
        path: path,
        method: event.httpMethod,
      }),
    };
  } catch (error: any) {
    console.error('Unhandled error in lambda handler:', error);
    console.error('Error stack:', error.stack);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error.message || 'Unknown error',
        stack: error.stack || 'No stack trace',
      }),
    };
  }
};

