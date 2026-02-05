# Quick Deploy RDS - Step by Step

## Step 1: Create RDS Instance

Run the script and enter your password when prompted:

```bash
cd backend
./create-rds-now.sh
```

**OR** if you want to provide password directly:

```bash
./create-rds-now.sh "your-secure-password"
```

This will take **5-10 minutes**. The script will:
- ✅ Create RDS MariaDB instance
- ✅ Configure security groups
- ✅ Show you the endpoint when ready

## Step 2: Update template.yaml

Once you have the endpoint (from Step 1 output), update the template:

```bash
./update-template-with-rds-endpoint.sh "cachao-dev-db.xxxxx.rds.amazonaws.com"
```

Replace `xxxxx` with your actual endpoint.

**OR** manually update all occurrences in `template.yaml`:
- Find: `cachao-mdb-2.cetzgm3nbskt.eu-west-1.rds.amazonaws.com`
- Replace with: `your-new-endpoint.rds.amazonaws.com`

## Step 3: Deploy

```bash
sam build
sam deploy
```

## All-in-One (After RDS is Created)

If you already have the endpoint:

```bash
# Update template
./update-template-with-rds-endpoint.sh "your-endpoint-here"

# Deploy
sam build && sam deploy
```

## Verify

After deployment, test an endpoint:

```bash
# Get your API URL from sam deploy output, then:
curl https://your-api-id.execute-api.eu-west-1.amazonaws.com/Prod/events
```

## Troubleshooting

**If RDS creation fails:**
- Check AWS credentials: `aws sts get-caller-identity --profile personal`
- Verify region: `eu-west-1`
- Check if instance name already exists

**If template update fails:**
- Check endpoint format (should end with `.rds.amazonaws.com`)
- Verify template.yaml exists in backend directory

**If deployment fails:**
- Check CloudWatch logs for Lambda functions
- Verify DB_HOST environment variable is correct
- Test database connection manually




