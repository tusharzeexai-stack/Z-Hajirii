# Z-Hajirii — AWS Migration Guide

This document explains how to deploy the AWS backend that replaces Supabase.

---

## AWS Services Used

| Service | Purpose |
|---|---|
| **Amazon RDS (PostgreSQL 16)** | Managed relational database — same schema as Supabase |
| **AWS Lambda (Node.js 20)** | Serverless API functions (one per table) |
| **Amazon API Gateway (REST)** | HTTP endpoints that proxy to Lambda |
| **AWS Secrets Manager** | Stores DB credentials — Lambda reads them at runtime |
| **AWS VPC** | Network isolation for RDS |

---

## Prerequisites

1. **AWS Account** with permissions to create: RDS, Lambda, API Gateway, Secrets Manager, VPC, IAM.
2. **AWS CLI** installed and configured:
   ```bash
   aws configure
   # Enter: Access Key ID, Secret Access Key, Region (e.g. ap-south-1), output format (json)
   ```
3. **Node.js 20+** (for the deploy script).

---

## Step 1 — Deploy the CloudFormation Stack

This single command provisions everything (VPC, RDS, Lambda, API Gateway, Secrets Manager):

```bash
aws cloudformation deploy \
  --template-file aws/cloudformation/stack.yaml \
  --stack-name zhajirii-stack \
  --parameter-overrides \
      DBPassword=YourStrongPassword123! \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ap-south-1
```

> ⚠️ RDS takes **5–10 minutes** to provision. Wait until the stack status is `CREATE_COMPLETE`.

Check status:
```bash
aws cloudformation describe-stacks \
  --stack-name zhajirii-stack \
  --query 'Stacks[0].StackStatus' \
  --region ap-south-1
```

---

## Step 2 — Load the Database Schema

Get the RDS endpoint:
```bash
aws cloudformation describe-stacks \
  --stack-name zhajirii-stack \
  --query 'Stacks[0].Outputs[?OutputKey==`RDSEndpoint`].OutputValue' \
  --output text \
  --region ap-south-1
```

Connect and run the schema (requires `psql` or any PostgreSQL client):
```bash
psql -h <RDS_ENDPOINT> -U zhajirii_admin -d zhajirii_db -f schema.sql
# Enter the DBPassword you set in Step 1 when prompted
```

Or use **pgAdmin** / **DBeaver** with the endpoint, username, and password.

---

## Step 3 — Deploy Lambda Code

```bash
bash aws/deploy.sh ap-south-1 default
```

This script:
1. Installs Node.js dependencies (`pg`, `@aws-sdk/client-secrets-manager`)
2. Zips all Lambda handlers
3. Updates all 8 Lambda functions

---

## Step 4 — Configure the Frontend

Get the API Gateway URL from the stack outputs:
```bash
aws cloudformation describe-stacks \
  --stack-name zhajirii-stack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
  --output text \
  --region ap-south-1
```

Copy the URL and set it in `.env`:
```env
VITE_API_GATEWAY_URL=https://abc123xyz.execute-api.ap-south-1.amazonaws.com/prod
```

---

## Step 5 — Run the App

```bash
npm install   # removes old @supabase/supabase-js if still cached
npm run dev
```

Open http://localhost:3002 — the app now talks to **AWS** instead of Supabase.

---

## Migrate Existing Supabase Data (Optional)

If you have existing data in Supabase that you want to keep:

```bash
# 1. Export from Supabase (run in Supabase SQL editor → Export as CSV, or use pg_dump)
pg_dump "postgresql://postgres:<supabase-password>@db.<project-ref>.supabase.co:5432/postgres" \
  --data-only \
  --table=users \
  --table=employees \
  --table=attendance_logs \
  --table=tasks \
  --table=leave_requests \
  --table=notifications \
  --table=audit_logs \
  --table=chat_messages \
  -f supabase_data_export.sql

# 2. Import into RDS
psql -h <RDS_ENDPOINT> -U zhajirii_admin -d zhajirii_db -f supabase_data_export.sql
```

---

## File Structure

```
aws/
├── cloudformation/
│   └── stack.yaml          ← Full AWS infrastructure (deploy this first)
├── lambda/
│   ├── db.js               ← Shared PostgreSQL connection (Secrets Manager)
│   ├── utils.js            ← CORS headers + response helpers
│   ├── package.json        ← Lambda dependencies (pg + AWS SDK)
│   └── handlers/
│       ├── users.js
│       ├── employees.js
│       ├── attendance_logs.js
│       ├── tasks.js
│       ├── leave_requests.js
│       ├── notifications.js
│       ├── audit_logs.js
│       └── chat_messages.js
└── deploy.sh               ← One-command Lambda deployment

src/
├── awsApiClient.ts         ← Drop-in replacement for supabaseClient.ts
└── App.tsx                 ← Only 1 line changed (import path)
```

---

## Cost Estimate (ap-south-1, ~50 users)

| Service | Monthly Cost |
|---|---|
| RDS db.t3.micro (Free Tier 1yr) | ~$0 / **$15** after free tier |
| Lambda (< 1M req/month) | **Free** |
| API Gateway (< 1M req/month) | **Free** |
| Secrets Manager | ~$0.40 |
| **Total** | **~$0.40** (free tier) / **~$16** (post free tier) |
