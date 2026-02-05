# RDS Database Credentials

## ⚠️ IMPORTANT: Keep this file secure!

**Created**: $(date)

## Connection Details

- **Endpoint**: `cachao-dev-db.cetzgm3nbskt.eu-west-1.rds.amazonaws.com`
- **Port**: `3306`
- **Database**: `cachao`
- **Username**: `admin`
- **Password**: Stored in AWS Parameter Store at `/cachao/database/password`

## Password Location

The password is securely stored in AWS Systems Manager Parameter Store:

```bash
# Retrieve password
aws ssm get-parameter \
  --name "/cachao/database/password" \
  --with-decryption \
  --region eu-west-1 \
  --profile personal \
  --query 'Parameter.Value' \
  --output text
```

## Connection String

For local testing:
```bash
mariadb -h cachao-dev-db.cetzgm3nbskt.eu-west-1.rds.amazonaws.com \
  -u admin \
  -p \
  cachao
```

## Security Notes

- ✅ Password is stored in AWS Parameter Store (encrypted)
- ✅ RDS instance is publicly accessible (for development only)
- ⚠️ Security group allows access from anywhere (0.0.0.0/0) - restrict for production
- ⚠️ No encryption at rest (for dev only) - enable for production
- ⚠️ No backups (for dev only) - enable for production

## Next Steps

1. ✅ RDS instance created
2. ✅ template.yaml updated with new endpoint
3. ⏭️ Deploy: `sam build && sam deploy`

## Cost

- **RDS t3.micro**: ~$15/month
- **No VPC costs**: $0
- **Total**: ~$15/month (vs $100-200/month before)




