# Missing Configurations for EventBridge/Webhook Setup

## ⚠️ Critical Missing Configurations

### 1. EventBridge Rule State (Explicit)
**Status:** ⚠️ **Should be explicit**

The EventBridge rule should explicitly set `State: ENABLED` to ensure it's active after deployment.

**Current:** Rule state is managed by SAM defaults (usually ENABLED, but not explicit)

**Recommended Fix:**
```yaml
StripeEventBridge:
  Type: EventBridgeRule
  Properties:
    EventBusName: default
    State: ENABLED  # ← Add this (Description not supported by SAM EventBridgeRule)
    Pattern:
      source:
        - stripe.com
      detail-type:
        - checkout.session.completed
```

---

### 2. Dead Letter Queue (DLQ) for EventBridge
**Status:** ❌ **Missing - Critical for production**

If the Lambda fails repeatedly, events will be lost without a DLQ.

**Recommended Fix:**
```yaml
StripeEventBridgeHandler:
  Type: AWS::Serverless::Function
  Properties:
    # ... existing config ...
    DeadLetterQueue:
      Type: SQS
      TargetArn: !GetAtt StripeEventDLQ.Arn
    # ... rest of config ...

# Add this resource
StripeEventDLQ:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: cachao-stripe-event-dlq
    MessageRetentionPeriod: 1209600  # 14 days
    VisibilityTimeout: 60
```

**Or use SNS:**
```yaml
DeadLetterQueue:
  Type: SNS
  TargetArn: !GetAtt StripeEventDLQTopic.Arn

StripeEventDLQTopic:
  Type: AWS::SNS::Topic
  Properties:
    TopicName: cachao-stripe-event-dlq
```

---

### 3. EventBridge Retry Configuration
**Status:** ⚠️ **Uses defaults - Should be explicit**

EventBridge has default retry behavior, but explicit configuration is recommended.

**Current:** Uses EventBridge defaults (2 retries, exponential backoff)

**Recommended Fix:**
```yaml
StripeEventBridge:
  Type: EventBridgeRule
  Properties:
    # ... existing config ...
    RetryPolicy:
      MaximumRetryAttempts: 3
      MaximumEventAgeInSeconds: 3600  # 1 hour
    Targets:
      - Arn: !GetAtt StripeEventBridgeHandler.Arn
        Id: StripeEventHandlerTarget
        RetryPolicy:
          MaximumRetryAttempts: 3
          MaximumEventAgeInSeconds: 3600
```

**Note:** When using SAM's `Events` syntax, retry is handled automatically, but you can configure it via the rule target.

---

### 4. Reserved Concurrency for Lambda
**Status:** ⚠️ **Missing - Could cause issues under load**

Without reserved concurrency, the Lambda could be throttled if many payments complete simultaneously.

**Recommended Fix:**
```yaml
StripeEventBridgeHandler:
  Type: AWS::Serverless::Function
  Properties:
    # ... existing config ...
    ReservedConcurrentExecutions: 10  # ← Add this
    # ... rest of config ...
```

---

### 5. CloudWatch Alarms for Failed Invocations
**Status:** ❌ **Missing - Important for monitoring**

No alarms configured to alert on failures.

**Recommended Fix:**
```yaml
StripeEventBridgeHandlerAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: cachao-stripe-eventbridge-failures
    AlarmDescription: Alert when Stripe EventBridge handler fails
    MetricName: Errors
    Namespace: AWS/Lambda
    Statistic: Sum
    Period: 300  # 5 minutes
    EvaluationPeriods: 1
    Threshold: 1
    ComparisonOperator: GreaterThanOrEqualToThreshold
    Dimensions:
      - Name: FunctionName
        Value: !GetAtt StripeEventBridgeHandler.Arn
    AlarmActions:
      - !Ref StripeEventFailureSNS  # SNS topic for notifications

StripeEventFailureSNS:
  Type: AWS::SNS::Topic
  Properties:
    TopicName: cachao-stripe-event-failures
    # Add subscription for email/SMS
```

---

## 🔧 Recommended Enhancements

### 6. API Gateway Throttling for Webhook
**Status:** ⚠️ **Optional but recommended**

Protect webhook endpoint from abuse.

**Recommended Fix:**
```yaml
CachaoApi:
  Type: AWS::Serverless::Api
  Properties:
    # ... existing config ...
    Throttle:
      BurstLimit: 100
      RateLimit: 50
    # ... rest of config ...
```

Or add usage plan:
```yaml
StripeWebhookUsagePlan:
  Type: AWS::ApiGateway::UsagePlan
  Properties:
    UsagePlanName: cachao-stripe-webhook-plan
    ApiStages:
      - ApiId: !Ref CachaoApi
        Stage: Prod
    Throttle:
      BurstLimit: 100
      RateLimit: 50
```

---

### 7. EventBridge Rule Description
**Status:** ⚠️ **Missing - Good practice**

Add description for easier management.

**Recommended Fix:**
```yaml
StripeEventBridge:
  Type: EventBridgeRule
  Properties:
    Description: "Processes Stripe checkout.session.completed events to update order status"
    # ... rest of config ...
```

---

### 8. Lambda Function Tags
**Status:** ⚠️ **Missing - Good for cost tracking**

Add tags for better resource management.

**Recommended Fix:**
```yaml
StripeEventBridgeHandler:
  Type: AWS::Serverless::Function
  Properties:
    # ... existing config ...
    Tags:
      Environment: dev
      Service: cachao
      Component: payment-processing
      ManagedBy: sam
    # ... rest of config ...
```

---

### 9. Explicit IAM Permissions (Optional)
**Status:** ✅ **Working but not explicit**

SAM auto-creates IAM roles, but explicit policies are clearer.

**Current:** Lambda has default execution role (works for RDS access without VPC)

**Optional Enhancement:**
```yaml
StripeEventBridgeHandler:
  Type: AWS::Serverless::Function
  Properties:
    # ... existing config ...
    Policies:
      - Statement:
          - Sid: RDSAccess
            Effect: Allow
            Action:
              - rds:DescribeDBInstances
            Resource: '*'
          - Sid: CloudWatchLogs
            Effect: Allow
            Action:
              - logs:CreateLogGroup
              - logs:CreateLogStream
              - logs:PutLogEvents
            Resource: !Sub 'arn:aws:logs:${AWS::Region}:${AWS::AccountId}:*'
    # ... rest of config ...
```

**Note:** Database access works without explicit RDS permissions when not using VPC.

---

### 10. X-Ray Tracing (Optional)
**Status:** ⚠️ **Missing - Useful for debugging**

Enable X-Ray tracing for better observability.

**Recommended Fix:**
```yaml
StripeEventBridgeHandler:
  Type: AWS::Serverless::Function
  Properties:
    # ... existing config ...
    Tracing: Active  # ← Add this
    # ... rest of config ...
```

---

## 🔴 Manual Configuration Required (Not in Code)

### 11. Partner Event Source Association
**Status:** ⚠️ **Must be done manually in AWS Console**

After Stripe creates the EventBridge destination, you must associate it in AWS.

**Steps:**
1. Go to: AWS Console → EventBridge → Partner event sources
2. Find: `aws.partner/stripe.com/{unique-id}`
3. Click: "Associate with event bus"
4. Select: `default` event bus
5. Click: "Associate"

**Verification:**
```bash
aws events list-partner-event-sources \
  --region eu-west-1 \
  --query 'PartnerEventSources[*].[Name,State]' \
  --output table
```

---

### 12. Stripe Dashboard Configuration
**Status:** ⚠️ **Must be done manually in Stripe Dashboard**

**EventBridge Destination:**
1. Go to: https://dashboard.stripe.com/settings/event-destinations
2. Verify destination is **Active**
3. Verify `checkout.session.completed` event is enabled

**Webhook Endpoint (if using fallback):**
1. Go to: https://dashboard.stripe.com/webhooks
2. Add endpoint: `https://{api-id}.execute-api.{region}.amazonaws.com/Prod/webhooks/stripe`
3. Select event: `checkout.session.completed`
4. Copy webhook secret to `STRIPE_WEBHOOK_SECRET` parameter

---

### 13. CloudWatch Log Retention
**Status:** ⚠️ **Uses default (never expire) - Should set retention**

**Current:** Logs never expire (costs can accumulate)

**Recommended Fix:**
```yaml
StripeEventBridgeHandlerLogGroup:
  Type: AWS::Logs::LogGroup
  Properties:
    LogGroupName: !Sub '/aws/lambda/${StripeEventBridgeHandler}'
    RetentionInDays: 14  # Keep logs for 14 days

StripePaymentFunctionLogGroup:
  Type: AWS::Logs::LogGroup
  Properties:
    LogGroupName: !Sub '/aws/lambda/${StripePaymentFunction}'
    RetentionInDays: 14
```

---

## 📋 Summary Checklist

### Critical (Should Add):
- [ ] **Dead Letter Queue** for EventBridge handler
- [ ] **CloudWatch Alarms** for failed invocations
- [ ] **Log Retention** configuration
- [ ] **Partner Event Source Association** (manual in AWS Console)
- [ ] **Stripe Dashboard Configuration** (manual)

### Recommended (Nice to Have):
- [ ] **Reserved Concurrency** for Lambda
- [ ] **EventBridge Rule Description**
- [ ] **Explicit Rule State: ENABLED**
- [ ] **Lambda Function Tags**
- [ ] **X-Ray Tracing**

### Optional (Enhancements):
- [ ] **API Gateway Throttling** for webhook
- [ ] **Explicit IAM Policies** (if needed)
- [ ] **Retry Policy Configuration** (explicit)

---

## 🚀 Priority Order

1. **High Priority:**
   - Dead Letter Queue (prevents event loss)
   - CloudWatch Alarms (monitoring)
   - Log Retention (cost control)
   - Partner Event Source Association (required for EventBridge to work)

2. **Medium Priority:**
   - Reserved Concurrency (performance)
   - Rule Description (management)
   - Explicit Rule State (clarity)

3. **Low Priority:**
   - Tags, X-Ray, Throttling (nice-to-haves)

---

## 📝 Notes

- **IAM Permissions:** Current setup works without explicit RDS permissions because Lambda accesses RDS over the internet (not VPC). If you move to VPC, you'll need VPC configuration and security groups.

- **EventBridge Auto-Permissions:** SAM automatically grants EventBridge permission to invoke Lambda when you define an EventBridge event. No manual IAM needed.

- **Webhook Signature Verification:** Already implemented in code - just needs `STRIPE_WEBHOOK_SECRET` parameter.

- **Error Handling:** Code throws errors for EventBridge (triggers retry) and returns error responses for webhooks. This is correct behavior.
