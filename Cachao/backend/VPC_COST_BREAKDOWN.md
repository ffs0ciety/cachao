# VPC Cost Breakdown

## Your Previous VPC Configuration Costs

Based on your `template.yaml`, here's what you were paying for VPC-related services:

### 1. VPC Interface Endpoints

You had **2 Interface Endpoints** (charged per hour):

#### CognitoVPCEndpoint (Interface Endpoint)
- **Hourly Cost**: $0.01 per hour per endpoint
- **Monthly Cost**: $0.01 × 24 hours × 30 days = **$7.20/month**
- **Data Processing**: $0.01 per GB processed (varies by usage)

#### LambdaVPCEndpoint (Interface Endpoint)
- **Hourly Cost**: $0.01 per hour per endpoint
- **Monthly Cost**: $0.01 × 24 hours × 30 days = **$7.20/month**
- **Data Processing**: $0.01 per GB processed (varies by usage)

#### S3VPCEndpoint (Gateway Endpoint)
- **Cost**: **FREE** ✅
- Gateway endpoints for S3 and DynamoDB have no hourly charges

**Subtotal for Interface Endpoints**: ~$14.40/month (base) + data processing fees

### 2. Lambda Functions in VPC (ENI Costs)

You had **9 Lambda functions** configured with `VpcConfig`:

- `MigrateAddImageUrlFunction`
- `MigrateAddAlbumsFunction`
- `MigrateAddDateToAlbumsFunction`
- `MigrateAddEventStaffFunction`
- `MigrateAddFlightsFunction`
- `MigrateAddUsersFunction`
- `MigrateAddThumbnailFunction`
- `DeleteAllVideosFunction`
- `EventsFunction`

**ENI (Elastic Network Interface) Costs**:
- Each Lambda function in a VPC requires an ENI
- **Hourly Cost**: $0.005 per ENI per hour
- **Per Function**: $0.005 × 24 hours × 30 days = **$3.60/month per function**
- **Total for 9 functions**: 9 × $3.60 = **$32.40/month**

**Note**: ENIs are created per availability zone. If your functions span multiple AZs, costs multiply.

### 3. Lambda Cold Start Impact

While not a direct cost, Lambda functions in VPC have:
- **Slower cold starts**: 5-10 seconds (vs <1 second without VPC)
- **Higher timeout risk**: May need to increase timeout settings
- **More retries needed**: Can increase Lambda invocations (charged per request)

### 4. Data Transfer Costs

**Within VPC** (same region):
- **Free** ✅

**Through VPC Endpoints**:
- **Interface Endpoints**: $0.01 per GB processed
- **Gateway Endpoints**: Free for S3/DynamoDB

**Estimated Data Transfer** (for development):
- Cognito calls: ~1-5 GB/month = **$0.01-$0.05/month**
- Lambda invocations: ~1-5 GB/month = **$0.01-$0.05/month**

### 5. Aurora DB in VPC

Your Aurora DB was in the VPC, but this doesn't add VPC-specific costs. However:
- **Aurora itself**: ~$50-100/month (depending on instance size)
- **VPC doesn't add cost to RDS** - RDS pricing is the same whether in VPC or not

## Total VPC-Related Monthly Costs

| Component | Monthly Cost |
|-----------|--------------|
| **VPC Interface Endpoints** (2 endpoints) | **$14.40** |
| **Lambda ENI Costs** (9 functions) | **$32.40** |
| **Data Processing** (endpoints) | **$0.10-$0.50** |
| **Subtotal (VPC only)** | **~$47-48/month** |

## Additional Costs (Not VPC-Specific)

| Component | Monthly Cost |
|-----------|--------------|
| **Aurora DB** (your previous database) | **$50-100** |
| **Lambda Invocations** | **~$0.20** (free tier covers most) |
| **API Gateway** | **~$3.50** (first 1M requests free) |
| **S3 Storage** | **~$0.023/GB** |

## Total Previous Setup Cost

| Category | Cost |
|----------|------|
| **VPC Infrastructure** | **~$47-48/month** |
| **Aurora Database** | **~$50-100/month** |
| **Other Services** | **~$5-10/month** |
| **TOTAL** | **~$100-160/month** |

## New Setup Cost (Without VPC)

| Category | Cost |
|----------|------|
| **RDS t3.micro** | **~$15/month** |
| **Lambda Functions** | **~$0.20/month** |
| **API Gateway** | **~$3.50/month** |
| **S3 Storage** | **~$0.023/GB** |
| **TOTAL** | **~$18-20/month** |

## Cost Savings Breakdown

| Item | Before | After | Savings |
|------|--------|-------|---------|
| **Database** | $50-100 (Aurora) | $15 (RDS) | **$35-85/month** |
| **VPC Endpoints** | $14.40 | $0 | **$14.40/month** |
| **Lambda ENIs** | $32.40 | $0 | **$32.40/month** |
| **Data Processing** | $0.10-0.50 | $0 | **$0.10-0.50/month** |
| **TOTAL SAVINGS** | | | **~$82-132/month** |

**Percentage Savings**: **82-85%** 🎉

## Regional Pricing Notes

- Prices shown are for **eu-west-1** (Ireland) region
- Some regions may have slightly different pricing
- All prices are approximate and subject to change
- Check [AWS Pricing Calculator](https://calculator.aws/#/) for exact costs

## Why VPC Costs So Much

1. **Interface Endpoints**: Charged per hour, even when idle
   - You pay $0.01/hour whether you use it or not
   - 24/7 operation = $7.20/month per endpoint

2. **Lambda ENIs**: Each function in VPC needs network interfaces
   - More functions = more ENIs = higher costs
   - ENIs are persistent resources (not ephemeral)

3. **Always-On Costs**: Unlike Lambda invocations (pay-per-use), VPC resources charge hourly regardless of usage

## When VPC Makes Sense

VPC is worth the cost when you need:
- ✅ **Security compliance** (HIPAA, PCI-DSS, etc.)
- ✅ **Private database access** (production environments)
- ✅ **Network isolation** (multi-tenant applications)
- ✅ **Hybrid cloud** (connect to on-premises)

For **development/staging**, VPC is usually **overkill** and adds unnecessary costs.

## Recommendations

1. **Development**: Use RDS without VPC (current setup) ✅
2. **Staging**: Consider RDS without VPC, or use RDS Proxy if needed
3. **Production**: Use VPC with private subnets for security
   - But still consider RDS (non-Aurora) to save on database costs
   - Use RDS Proxy for connection pooling instead of VPC endpoints

## Monitoring VPC Costs

To track VPC costs in AWS Cost Explorer:
1. Go to AWS Cost Explorer
2. Filter by service: "EC2" (for ENIs) and "VPC" (for endpoints)
3. Group by "Usage Type" to see:
   - `VpcEndpoint-Hours` (Interface endpoints)
   - `NetworkInterface` (ENI costs)
   - `DataProcessing-Bytes` (Endpoint data processing)

## Summary

**Your VPC setup was costing approximately $47-48/month** just for VPC infrastructure, plus the expensive Aurora database. By removing VPC and switching to standard RDS, you're saving **~$82-132/month** (82-85% reduction) while maintaining the same functionality for development purposes.




