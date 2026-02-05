# Cachao Production Deployment Guide

This guide covers deploying Cachao to AWS for production use.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AWS Production                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────┐     ┌───────────────┐     ┌─────────────────┐   │
│   │   Amplify    │     │  API Gateway  │     │   CloudWatch    │   │
│   │   Hosting    │────▶│    (REST)     │     │  (Monitoring)   │   │
│   │  (Frontend)  │     └───────┬───────┘     └─────────────────┘   │
│   └──────────────┘             │                                    │
│                                ▼                                    │
│                       ┌────────────────┐                           │
│                       │    Lambda      │                           │
│                       │  (20+ funcs)   │                           │
│                       └────────┬───────┘                           │
│                                │                                    │
│         ┌──────────────────────┼──────────────────────┐            │
│         ▼                      ▼                      ▼            │
│   ┌───────────┐         ┌───────────┐         ┌───────────┐       │
│   │    RDS    │         │    S3     │         │  Cognito  │       │
│   │  MariaDB  │         │ (Videos)  │         │  (Auth)   │       │
│   └───────────┘         └───────────┘         └───────────┘       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- AWS CLI configured with appropriate credentials
- AWS SAM CLI installed (`brew install aws-sam-cli`)
- Node.js 20.x
- An AWS account with permissions for Lambda, API Gateway, RDS, S3, Cognito

## Environment Strategy

| Environment | Branch    | Stack Name       | Purpose                    |
|------------|-----------|------------------|----------------------------|
| Dev        | `develop` | `Cachao`         | Local/dev testing          |
| Staging    | `staging` | `Cachao-staging` | Pre-production testing     |
| Production | `main`    | `Cachao-prod`    | Live production            |

---

## Step 1: Create Production RDS Database

First, create a separate RDS instance for production:

```bash
# Create production RDS instance
aws rds create-db-instance \
  --db-instance-identifier cachao-prod-db \
  --db-instance-class db.t3.micro \
  --engine mariadb \
  --engine-version 10.11.8 \
  --master-username admin \
  --master-user-password "YOUR_SECURE_PASSWORD_HERE" \
  --allocated-storage 20 \
  --storage-type gp2 \
  --publicly-accessible \
  --backup-retention-period 7 \
  --multi-az false \
  --auto-minor-version-upgrade true \
  --region eu-west-1

# Wait for the instance to be available (takes ~5-10 minutes)
aws rds wait db-instance-available --db-instance-identifier cachao-prod-db

# Get the endpoint
aws rds describe-db-instances \
  --db-instance-identifier cachao-prod-db \
  --query "DBInstances[0].Endpoint.Address" \
  --output text
```

### Configure Security Group

```bash
# Get the security group ID
SG_ID=$(aws rds describe-db-instances \
  --db-instance-identifier cachao-prod-db \
  --query "DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId" \
  --output text)

# Allow inbound MySQL/MariaDB from Lambda (0.0.0.0/0 since Lambda IPs vary)
# For better security, use VPC endpoints in production
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 3306 \
  --cidr 0.0.0.0/0
```

### Initialize Database Schema

```bash
# Connect and create the database
mysql -h YOUR_PROD_RDS_ENDPOINT -u admin -p -e "CREATE DATABASE IF NOT EXISTS cachao;"

# Run migrations (from your dev machine)
# The app will auto-create tables on first Lambda invocation
```

---

## Step 2: Deploy Backend (SAM)

### Option A: Manual Deployment

```bash
cd backend

# Build the application
sam build

# Deploy to production
sam deploy --config-env prod

# Or with explicit parameters:
sam deploy \
  --stack-name Cachao-prod \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    Environment=prod \
    DatabaseHost=cachao-prod-db.xxxxx.eu-west-1.rds.amazonaws.com \
    DatabaseUser=admin \
    DatabasePassword=YOUR_PASSWORD \
    StripeSecretKey=sk_live_xxxxx \
    StripeWebhookSecret=whsec_xxxxx \
    AviationStackApiKey=your_key \
    AirLabsApiKey=your_key
```

### Option B: Automated with GitHub Actions

1. **Add GitHub Secrets** (Settings → Secrets → Actions):

   ```
   AWS_ACCESS_KEY_ID          - IAM user access key
   AWS_SECRET_ACCESS_KEY      - IAM user secret key
   
   # Production
   PROD_DB_HOST               - Production RDS endpoint
   PROD_DB_USER               - Database username
   PROD_DB_PASSWORD           - Database password
   PROD_STRIPE_SECRET_KEY     - Stripe live secret key
   PROD_STRIPE_WEBHOOK_SECRET - Stripe webhook secret
   PROD_STRIPE_PARTNER_BUS    - Stripe EventBridge bus name
   
   # Staging (optional)
   STAGING_DB_HOST
   STAGING_DB_USER
   STAGING_DB_PASSWORD
   STAGING_STRIPE_SECRET_KEY
   STAGING_STRIPE_WEBHOOK_SECRET
   
   # Shared
   AVIATIONSTACK_API_KEY
   AIRLABS_API_KEY
   ```

2. **Push to main branch** - triggers automatic deployment

### Get Stack Outputs

After deployment, get the important values:

```bash
# Get API URL
aws cloudformation describe-stacks \
  --stack-name Cachao-prod \
  --query "Stacks[0].Outputs[?OutputKey=='CachaoApi'].OutputValue" \
  --output text

# Get Cognito User Pool ID
aws cloudformation describe-stacks \
  --stack-name Cachao-prod \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
  --output text

# Get Cognito Client ID
aws cloudformation describe-stacks \
  --stack-name Cachao-prod \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" \
  --output text
```

---

## Step 3: Deploy Frontend (Amplify Hosting)

### Option A: AWS Console Setup

1. Go to **AWS Amplify Console** → **New app** → **Host web app**

2. Connect your GitHub repository

3. Configure build settings:
   - App name: `cachao-prod`
   - Branch: `main`
   - Build settings: Use `amplify.yml` from repo

4. Add **Environment Variables** in Amplify Console:
   ```
   NUXT_PUBLIC_API_URL             = https://xxxxx.execute-api.eu-west-1.amazonaws.com
   NUXT_PUBLIC_API_BASE_PATH       = /Prod
   NUXT_PUBLIC_APP_URL             = https://your-domain.amplifyapp.com
   NUXT_PUBLIC_COGNITO_USER_POOL_ID = eu-west-1_xxxxxxxx
   NUXT_PUBLIC_COGNITO_CLIENT_ID    = xxxxxxxxxxxxxxxxxx
   NUXT_PUBLIC_COGNITO_REGION       = eu-west-1
   ```

5. Click **Save and deploy**

### Option B: Amplify CLI Setup

```bash
# Install Amplify CLI
npm install -g @aws-amplify/cli

# Configure Amplify
amplify configure

# Initialize in frontend directory
cd frontend
amplify init

# Add hosting
amplify add hosting
# Select: Hosting with Amplify Console
# Select: Continuous deployment

# Deploy
amplify publish
```

---

## Step 4: Configure Custom Domain (Optional)

### For Amplify Hosting

1. Go to **Amplify Console** → Your App → **Domain management**
2. Click **Add domain**
3. Enter your domain and follow DNS verification steps

### For API Gateway

1. Go to **API Gateway Console** → **Custom domain names**
2. Create custom domain
3. Create base path mapping to your API

---

## Step 5: Production Checklist

### Security

- [ ] RDS not publicly accessible (use VPC + NAT Gateway for production)
- [ ] Database credentials stored in AWS Secrets Manager
- [ ] Cognito email configuration uses SES (not default, limited to 50/day)
- [ ] CORS restricted to production domain (not `*`)
- [ ] API Gateway throttling configured
- [ ] WAF enabled on API Gateway (optional)

### Monitoring

- [ ] CloudWatch alarms configured for:
  - Lambda errors
  - API Gateway 5xx errors
  - RDS CPU/connections
- [ ] SNS notifications for Stripe failures (already configured)
- [ ] X-Ray tracing enabled (already on Stripe functions)

### Backup

- [ ] RDS automated backups enabled (7-day retention)
- [ ] S3 versioning enabled on video bucket

### Cost Optimization

- [ ] Lambda memory sized appropriately
- [ ] RDS instance size appropriate for load
- [ ] Consider Reserved Instances for production RDS

---

## Deployment Commands Reference

```bash
# Build backend
cd backend && sam build

# Deploy to dev (default)
sam deploy

# Deploy to staging
sam deploy --config-env staging

# Deploy to production
sam deploy --config-env prod

# View logs
sam logs -n EventsFunction --stack-name Cachao-prod --tail

# Delete stack (CAREFUL!)
sam delete --stack-name Cachao-prod
```

---

## Rollback Procedure

If something goes wrong:

```bash
# View recent deployments
aws cloudformation describe-stack-events \
  --stack-name Cachao-prod \
  --max-items 10

# Rollback to previous version (CloudFormation automatic on failure)
# Or redeploy previous commit:
git checkout <previous-commit>
cd backend && sam build && sam deploy --config-env prod
```

---

## Cost Estimate (Monthly)

| Service              | Dev         | Production  |
|---------------------|-------------|-------------|
| RDS (db.t3.micro)   | ~$15        | ~$15-30     |
| Lambda              | ~$0-5       | ~$5-20      |
| API Gateway         | ~$1-5       | ~$5-20      |
| S3                  | ~$1-5       | ~$5-50      |
| Cognito             | Free tier   | ~$0-10      |
| Amplify Hosting     | Free tier   | ~$5-15      |
| **Total**           | **~$20-30** | **~$35-150**|

---

## Troubleshooting

### Lambda can't connect to RDS
- Check RDS security group allows inbound on port 3306
- Verify RDS is publicly accessible
- Check database credentials are correct

### Amplify build fails
- Check environment variables are set
- Review build logs in Amplify Console
- Ensure Node.js version matches (20.x)

### API Gateway returns 5xx
- Check Lambda CloudWatch logs
- Verify Cognito configuration
- Check CORS settings

### Stripe webhooks not working
- Verify webhook endpoint URL is correct
- Check webhook secret matches
- Review EventBridge rule in AWS Console
