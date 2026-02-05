# Quick Reference Guide

## 🚀 API Endpoints

### Base URL
```
https://oi7p8gbold.execute-api.eu-west-1.amazonaws.com/Prod/
```

### Main Endpoints
- **Events**: `https://oi7p8gbold.execute-api.eu-west-1.amazonaws.com/Prod/events/`
- **Videos**: `https://oi7p8gbold.execute-api.eu-west-1.amazonaws.com/Prod/videos/`
- **Hello**: `https://oi7p8gbold.execute-api.eu-west-1.amazonaws.com/Prod/hello/`

## 🔐 Cognito Configuration

- **User Pool ID**: `eu-west-1_y1FDQpQ9b`
- **Client ID**: `37a41hu5u7mlm6nbh9n3d23ogb`

## 💾 Database

- **Endpoint**: `cachao-dev-db.cetzgm3nbskt.eu-west-1.rds.amazonaws.com`
- **Port**: `3306`
- **Database**: `cachao`
- **Username**: `admin`
- **Password**: Stored in AWS Parameter Store (`/cachao/database/password`)

### Get Password
```bash
aws ssm get-parameter \
  --name "/cachao/database/password" \
  --with-decryption \
  --region eu-west-1 \
  --profile personal \
  --query 'Parameter.Value' \
  --output text
```

## 📊 Cost Summary

- **Current**: ~$18-20/month
- **Previous**: ~$100-160/month
- **Savings**: ~$82-142/month (82-85%)

## 🛠️ Useful Commands

### Deploy Updates
```bash
cd backend
sam build && sam deploy --parameter-overrides "DatabaseUser=admin DatabasePassword=$(aws ssm get-parameter --name "/cachao/database/password" --with-decryption --region eu-west-1 --profile personal --query 'Parameter.Value' --output text)"
```

### View Logs
```bash
sam logs -n EventsFunction --stack-name Cachao --tail
```

### Test API
```bash
# Test events endpoint
curl https://oi7p8gbold.execute-api.eu-west-1.amazonaws.com/Prod/events

# Test with authentication (replace TOKEN with actual JWT)
curl -H "Authorization: Bearer TOKEN" \
  https://oi7p8gbold.execute-api.eu-west-1.amazonaws.com/Prod/events
```

### Connect to Database
```bash
DB_PASSWORD=$(aws ssm get-parameter --name "/cachao/database/password" --with-decryption --region eu-west-1 --profile personal --query 'Parameter.Value' --output text)
mariadb -h cachao-dev-db.cetzgm3nbskt.eu-west-1.rds.amazonaws.com \
  -u admin -p"$DB_PASSWORD" cachao
```

## 📁 Key Files

- `template.yaml` - Infrastructure definition
- `events-function/app.ts` - Main Lambda function
- `MIGRATION_SUMMARY.md` - Complete migration details
- `RDS_CREDENTIALS.md` - Database credentials

## ✅ Status

- ✅ RDS instance created and running
- ✅ Database tables created
- ✅ Lambda functions deployed (no VPC)
- ✅ API Gateway configured
- ✅ API tested and working
- ✅ Cost optimization achieved

## 🔄 Next Steps

1. Test authenticated endpoints
2. Monitor costs for first week
3. Set up CloudWatch alarms
4. Plan for production setup (if needed)




