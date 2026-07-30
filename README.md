# BigAndBest Backend - AWS Clustered Deployment

> Production-ready Node.js backend with clustering support for AWS deployment

## 🎯 Overview

This backend has been optimized for AWS deployment with:
- **Node.js Clustering** - Utilizes all CPU cores for maximum performance
- **OS-based Load Handling** - Real-time system monitoring and resource management
- **Graceful Shutdown** - Proper cleanup and zero-downtime deployments
- **Auto-recovery** - Automatic worker restart on failures
- **Production-ready** - Removed serverless dependencies

## 🚀 Quick Start

### Development
```bash
npm install
npm run dev
```

### Production (PM2 - Recommended)
```bash
npm install -g pm2
npm run pm2:start
```

### Docker
```bash
docker-compose up -d
```

## 📁 Project Structure

```
backend-deployed/
├── server.js                    # Main clustered server
├── ecosystem.config.cjs         # PM2 configuration
├── docker-compose.yml           # Docker setup
├── Dockerfile                   # Container image
├── nginx.conf                   # Nginx reverse proxy config
├── package.json                 # Dependencies & scripts
├── AWS_DEPLOYMENT_GUIDE.md      # Comprehensive deployment guide
├── QUICK_REFERENCE.md           # Quick commands reference
└── routes/                      # API routes
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file with:

```bash
# Server
PORT=8000
NODE_ENV=production
CLUSTER_MODE=true
WORKERS=0  # 0 = auto-detect CPU cores

# Database
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_key

# Authentication
JWT_SECRET=your_jwt_secret

# Payment
RAZORPAY_KEY_ID=your_razorpay_key
RAZORPAY_KEY_SECRET=your_razorpay_secret

# Storage
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## 📊 Monitoring

### Health Check
```bash
curl http://localhost:8000/api/health
```

Returns:
- Server status
- Worker information
- System metrics (CPU, memory, load)
- Process details

### Metrics
```bash
curl http://localhost:8000/api/metrics
```

Detailed system and process metrics for monitoring tools.

## 🏗️ Deployment Options

### 1. AWS EC2 (Recommended)
- Full control over resources
- Cost-effective for sustained traffic
- See `AWS_DEPLOYMENT_GUIDE.md` for detailed steps

### 2. Docker/ECS
- Containerized deployment
- Easy scaling with ECS/Fargate
- Use provided `Dockerfile` and `docker-compose.yml`

### 3. Kubernetes
- Advanced orchestration
- Auto-scaling capabilities
- Requires k8s cluster setup

## 🛠️ Available Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start server (production) |
| `npm run dev` | Development with nodemon |
| `npm run start:cluster` | Start with clustering enabled |
| `npm run start:single` | Start single process (debugging) |
| `npm run pm2:start` | Start with PM2 (production) |
| `npm run pm2:reload` | Zero-downtime reload |
| `npm run pm2:logs` | View PM2 logs |
| `npm run pm2:monit` | Monitor dashboard |
| `npm test` | Run tests |

## 📈 Performance

### Clustering Benefits
- **Utilizes all CPU cores** - Better resource utilization
- **Load balancing** - Automatic distribution across workers
- **Fault tolerance** - Worker crashes don't bring down the server
- **Zero-downtime** - Reload workers one at a time

### Recommended Instance Types

| Traffic | Instance | vCPUs | Memory | Workers |
|---------|----------|-------|--------|---------|
| Low | t3.small | 2 | 2 GB | 2 |
| Medium | t3.medium | 2 | 4 GB | 2 |
| High | t3.large | 2 | 8 GB | 2 |
| Very High | c6i.xlarge | 4 | 8 GB | 4 |

## 🔒 Security

- ✅ Environment variables for secrets
- ✅ CORS configuration
- ✅ Rate limiting (via Nginx)
- ✅ HTTPS/SSL support
- ✅ Security headers
- ✅ Non-root Docker user
- ✅ Graceful error handling

## 🐛 Troubleshooting

### Check Status
```bash
# PM2
npm run pm2:status

# Docker
docker-compose ps
```

### View Logs
```bash
# PM2
npm run pm2:logs

# Docker
docker-compose logs -f api
```

### Common Issues

**Port already in use:**
```bash
lsof -i :8000
kill -9 <PID>
```

**Workers not starting:**
```bash
pm2 restart bigandbest-api --update-env
```

**High memory usage:**
```bash
pm2 scale bigandbest-api 2  # Reduce workers
```

## 📚 Documentation

- **[AWS Deployment Guide](./AWS_DEPLOYMENT_GUIDE.md)** - Complete deployment walkthrough
- **[Quick Reference](./QUICK_REFERENCE.md)** - Common commands and tips
- **[PM2 Docs](https://pm2.keymetrics.io/)** - Process manager documentation
- **[Node.js Cluster](https://nodejs.org/api/cluster.html)** - Clustering module docs

## 🔄 CI/CD

Example GitHub Actions workflow:

```yaml
name: Deploy to AWS
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ubuntu
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            cd /var/www/bigandbest/backend-deployed
            git pull
            npm install
            npm run pm2:reload
```

## 📞 Support

For issues or questions:
1. Check health endpoint: `/api/health`
2. Review logs: `npm run pm2:logs`
3. Check metrics: `/api/metrics`
4. Consult deployment guide

## 🎯 Next Steps

1. ✅ Set up monitoring (CloudWatch, Datadog)
2. ✅ Configure auto-scaling
3. ✅ Set up load balancer health checks
4. ✅ Implement log aggregation
5. ✅ Configure backups
6. ✅ Set up CI/CD pipeline
7. ✅ Enable SSL/TLS

## 📄 License

ISC

## 👥 Author

rudraksh

---

**Ready for production deployment on AWS! 🚀**

## Database Replica Restore

Use this flow to create a new database with Prisma tables and load the JSON export.

1. Point `DATABASE_URL` and `DIRECT_URL` to the new database.
2. Compile and push the Prisma schema:
   ```bash
   npm run db:push
   ```
3. Restore the exported data:
   ```bash
   npm run restore:db -- --in database-export.json
   ```
4. To create a fresh export again:
   ```bash
   npm run export:db -- --out database-export.json
   ```

Notes:
- `restore:db` is non-destructive by default and uses `ON CONFLICT DO NOTHING`.
- `restore:db` also syncs sequence-backed columns after inserts.
- For a different file path, pass `--in /path/to/file.json`.
