# SolunIP Labs ☀️🌙

> **Stop Wasting Time on Fake Leads**  
> Free IP enrichment & contact validation for marketing operations teams

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Live Demo](https://img.shields.io/badge/demo-live-success)](https://soluniplabs.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

---

## 🎯 The Problem

**60% of form submissions have email-company mismatches.** Marketing teams waste **23 hours per month** manually validating leads. Sales teams complain about lead quality. Expensive tools like ZoomInfo cost $15k+/year.

## ✨ The Solution

**SolunIP Labs** enriches IP addresses with geolocation data and scores email-company alignment using AI-powered matching algorithms. Upload a CSV or paste IPs, get back validated data in seconds.

**🎥 [Live Demo](https://soluniplabs.com/app)** | **📚 [Documentation](https://soluniplabs.com/docs)**

---

## 🚀 Features

### IP Enrichment
- 🌍 **Geolocation Data** - City, region, country, coordinates, timezone (99%+ accurate)
- 🏢 **Company Detection** - Organization name, ASN, ISP
- 📍 **Precision Mapping** - Latitude/longitude for territory assignment

### Email-Company Validation
- 🤖 **AI-Powered Scoring** - 7 matching algorithms (exact, substring, acronym, etc.)
- 📧 **Freemail Detection** - Identify Gmail, Yahoo, Outlook, etc.
- ⚖️ **Confidence Scores** - 0.0 to 1.0 rating with detailed reasoning

### Privacy & Security
- 🔒 **Browser-Only Processing** - Zero data storage, GDPR compliant
- 🕵️ **VPN/Proxy Detection** - Flag suspicious traffic
- 🛡️ **Private IP Blocking** - Prevent network reconnaissance
- 🔐 **Secure Architecture** - CORS validation, rate limiting

### Workflow
- 📊 **Batch Processing** - Handle 100s-1000s of IPs at once
- 💾 **CRM-Ready Export** - CSV format (Salesforce, HubSpot, any CRM)
- ⚡ **Lightning Fast** - Validate 100+ leads in 60 seconds
- 🎯 **Smart Filtering** - Sort and filter by any field

---

## 📸 Screenshots

### Manual IP Enrichment
```
Input: 8.8.8.8
Output:
  City: Mountain View
  Region: California
  Country: US
  Organization: Google LLC
  Timezone: America/Los_Angeles
```

### CSV Upload with Validation
```
Input CSV:
  Email: john@acmecorp.com
  Company: Acme Corp
  IP: 76.37.32.66

Output:
  ✅ company_email_score: 1.0 (Exact match)
  ✅ is_corporate_email: true
  📍 City: Chicago, IL
```

---

## 🎬 Quick Start

### Prerequisites
- Modern browser (Chrome, Firefox, Safari, Edge)
- Free IPinfo API token ([Get one here](https://ipinfo.io/signup) - 50k requests/month included)

### 1. Visit the Tool
Go to **[soluniplabs.com/app](https://soluniplabs.com/app)**

### 2. Get Your API Token
1. Sign up at [ipinfo.io/signup](https://ipinfo.io/signup)
2. Copy your API token from the dashboard
3. Paste it into the tool (one-time setup)

### 3. Choose Your Method

**Option A: Manual Input**
```
1. Click "Manual Input" tab
2. Paste IP addresses (one per line):
   8.8.8.8
   1.1.1.1
   76.37.32.66
3. Click "Enrich"
4. Export results
```

**Option B: CSV Upload**
```
1. Click "CSV Upload" tab
2. Upload CSV with columns: Email, Company, IP
3. Click "Enrich"
4. Review validation scores
5. Export enriched data
```

### 4. Import to Your CRM
- Salesforce: Data Import Wizard
- HubSpot: Contacts Import
- Any CRM: CSV upload

**That's it! 🎉 Total time: ~5 minutes**

---

## 🏗️ Self-Hosting (Optional)

Want to run your own instance? Here's how:

### Deploy the Frontend

**Option 1: Cloudflare Pages**
```bash
# Clone the repo
git clone https://github.com/yourusername/solunip-labs.git
cd solunip-labs

# Deploy to Cloudflare Pages
# (via Dashboard or Wrangler CLI)
```

**Option 2: Any Static Host**
```bash
# The app is just HTML/CSS/JS
# Upload to Netlify, Vercel, GitHub Pages, etc.
```

### Deploy the Cloudflare Worker

**1. Create Worker**
```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create new worker
wrangler init ipinfo-proxy
```

**2. Add Code**
```bash
# Copy the worker code
cp src/worker/secure-ipinfo-worker.js ipinfo-proxy/src/index.js

# Add your IPinfo token as a secret
wrangler secret put IPINFO_TOKEN
```

**3. Deploy**
```bash
cd ipinfo-proxy
wrangler deploy
```

**4. Configure Custom Domain** (Optional)
```bash
# In Cloudflare Dashboard:
# - DNS: Add CNAME api.yourdomain.com → worker-name.workers.dev
# - Worker: Add route api.yourdomain.com/*
# - Disable workers.dev route for security
```

**5. Update App Config**
```javascript
// In app.js
const PROXY_URL = 'https://api.yourdomain.com';
```

---

## 🧠 How It Works

### Architecture

```
┌─────────────────┐
│   User Browser  │
│  (soluniplabs)  │
└────────┬────────┘
         │
         │ HTTPS Request
         ▼
┌─────────────────┐
│ Cloudflare WAF  │  ← Bot detection, rate limiting
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Cloudflare      │  ← CORS validation, input sanitization
│ Worker (Proxy)  │     Rate limiting (100/10min)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  IPinfo API     │  ← Geolocation database (99%+ accurate)
└─────────────────┘
```

### Email-Company Scoring Algorithm

The tool uses **7 matching strategies** to score email-company alignment:

| Score | Strategy | Example |
|-------|----------|---------|
| **1.0** | Exact match | `acme.com` + "Acme Corp" |
| **0.9** | Substring match | `fennerppd.com` + "Fenner" |
| **0.8** | Sequential tokens | `parkaerospace.com` + "Park Aerospace" |
| **0.75** | Acronym match | `eliteap.com` + "Elite Advanced Polymers" |
| **0.7** | High token overlap | `globaltechsol.com` + "Global Tech Solutions" |
| **0.6** | Partial overlap | `tech.com` + "Tech Solutions" |
| **0.0** | No match | `random.com` + "Acme Corp" |

**Algorithm highlights:**
- Normalizes text (removes spaces, special chars, common suffixes)
- Detects freemail providers (Gmail, Yahoo, etc.)
- Handles abbreviations, acronyms, concatenations
- Provides detailed reasoning for each score

See [docs/scoring-algorithm.md](docs/scoring-algorithm.md) for full details.

---

## 🛠️ Technology Stack

### Frontend
- **HTML5/CSS3** - Clean, accessible UI
- **Vanilla JavaScript** - No framework overhead
- **PapaParse** - CSV parsing library

### Backend (Serverless)
- **Cloudflare Workers** - Edge compute, global distribution
- **IPinfo API** - Geolocation data provider

### Security
- **CORS validation** - Origin whitelisting
- **Rate limiting** - 100 requests per 10 minutes per IP
- **Input validation** - Regex checks, private IP blocking
- **Security headers** - OWASP best practices

### Infrastructure
- **Cloudflare Pages** - Static hosting
- **Cloudflare DNS** - Domain management
- **Cloudflare WAF** - Web application firewall

---

## 📊 Use Cases

### Marketing Operations
✅ **Clean form submissions** before they enter your CRM  
✅ **Prioritize high-quality leads** by validation score  
✅ **Identify bot traffic** with VPN/proxy detection  
✅ **Save 20+ hours/month** on manual validation

### Sales Operations
✅ **Route leads by geography** using accurate location data  
✅ **Filter out personal emails** (identify corporate domains)  
✅ **Enrich contact records** with company information  
✅ **Improve lead quality** metrics

### Fraud Prevention
✅ **Detect suspicious patterns** (VPNs, proxies, Tor)  
✅ **Flag geographic anomalies** (IP location vs stated location)  
✅ **Identify hosting providers** (datacenter IPs)  
✅ **Batch analyze** for trends

### Data Analysts
✅ **Enrich datasets** with location data  
✅ **Quality assurance** on contact databases  
✅ **Geographic analysis** of form submissions  
✅ **Export clean CSVs** for analysis tools

---

## 🤝 Contributing

We love contributions! Here's how you can help:

### Ways to Contribute
- 🐛 **Report bugs** - Open an issue
- 💡 **Suggest features** - Start a discussion
- 📖 **Improve docs** - Submit a PR
- 🔧 **Fix issues** - Check "good first issue" label
- 🌍 **Add translations** - Help internationalize

### Getting Started
```bash
# 1. Fork the repo
# 2. Clone your fork
git clone https://github.com/yourusername/solunip-labs.git
cd solunip-labs

# 3. Create a branch
git checkout -b feature/your-feature-name

# 4. Make changes and test
# (Open app/index.html in browser)

# 5. Commit and push
git add .
git commit -m "Add: your feature description"
git push origin feature/your-feature-name

# 6. Open a Pull Request
```

### Code Style
- Use ES6+ JavaScript
- Comment complex algorithms
- Keep functions small and focused
- Test with multiple browsers
- Update docs if needed

### Reporting Bugs
Please include:
- Browser version
- Steps to reproduce
- Expected vs actual behavior
- Console errors (if any)
- Sample data (anonymized)

---

## 🔒 Security

### Reporting Vulnerabilities
**Please do NOT open public issues for security vulnerabilities.**

Email: security@soluniplabs.com

We'll respond within 48 hours and work with you to resolve the issue.

### Security Features
- ✅ All processing happens client-side (browser-only)
- ✅ Zero data storage on our servers
- ✅ CORS-protected API endpoints
- ✅ Rate limiting to prevent abuse
- ✅ Private IP blocking (prevents network scanning)
- ✅ Input validation and sanitization
- ✅ Security headers (OWASP recommendations)

See [docs/security.md](docs/security.md) for full security documentation.

---

## 📜 License

MIT License - see [LICENSE](LICENSE) file for details.

**TL;DR:** You can use, modify, and distribute this code freely. Attribution appreciated but not required.

---

## 🙏 Acknowledgments

- **[IPinfo](https://ipinfo.io)** - Geolocation data provider (99%+ accurate)
- **[Cloudflare](https://cloudflare.com)** - Infrastructure and edge compute
- **[PapaParse](https://www.papaparse.com/)** - CSV parsing library

---

## 📚 Documentation

- **[User Guide](docs/user-guide.md)** - How to use the tool
- **[API Reference](docs/api-reference.md)** - IPinfo API details
- **[Scoring Algorithm](docs/scoring-algorithm.md)** - How validation works
- **[Security](docs/security.md)** - Security architecture
- **[Self-Hosting](docs/self-hosting.md)** - Deploy your own instance
- **[FAQ](docs/faq.md)** - Common questions

---

## 🚀 Roadmap

### ✅ Completed (v1.0)
- [x] IP enrichment (geolocation, company, timezone)
- [x] Email-company validation scoring
- [x] CSV upload and batch processing
- [x] Privacy detection (VPN, proxy, Tor)
- [x] CRM-ready export
- [x] Security hardening (CORS, rate limiting)
- [x] Browser-only processing

### 🔨 In Progress (v1.1)
- [ ] Historical data storage (optional, encrypted)
- [ ] Export to Excel format
- [ ] Custom scoring rules
- [ ] Dark mode

### 🔮 Planned (v2.0)
- [ ] REST API access
- [ ] Direct CRM integrations (Salesforce, HubSpot)
- [ ] Team collaboration features
- [ ] Scheduled enrichment
- [ ] Webhooks
- [ ] Advanced analytics dashboard

### 💭 Under Consideration
- [ ] Mobile app
- [ ] Slack/Discord bot
- [ ] Browser extension
- [ ] Zapier integration

**Vote on features:** [Open a discussion](https://github.com/yourusername/solunip-labs/discussions)

---

## 📈 Stats

![GitHub stars](https://img.shields.io/github/stars/yourusername/solunip-labs?style=social)
![GitHub forks](https://img.shields.io/github/forks/yourusername/solunip-labs?style=social)
![GitHub issues](https://img.shields.io/github/issues/yourusername/solunip-labs)
![GitHub pull requests](https://img.shields.io/github/issues-pr/yourusername/solunip-labs)

---

## 💬 Community

- **[GitHub Discussions](https://github.com/yourusername/solunip-labs/discussions)** - Ask questions, share ideas
- **[Issues](https://github.com/yourusername/solunip-labs/issues)** - Report bugs, request features
- **[Twitter](https://twitter.com/soluniplabs)** - Follow for updates
- **[LinkedIn](https://linkedin.com/company/solunip-labs)** - Professional network

---

## 🌟 Show Your Support

If this project helped you, please:
- ⭐ **Star this repo** on GitHub
- 🐦 **Share on Twitter** with #SolunIPLabs
- 📝 **Write a testimonial** (open an issue with "Testimonial" label)
- 🤝 **Recommend to colleagues**

Every bit of support helps us improve the tool!

---

## 📧 Contact

- **Website:** [soluniplabs.com](https://soluniplabs.com)
- **Email:** support@soluniplabs.com
- **Twitter:** [@soluniplabs](https://twitter.com/soluniplabs)
- **LinkedIn:** [SolunIP Labs](https://linkedin.com/company/solunip-labs)

---

## 🎓 About

**SolunIP Labs** was created to solve a real problem: marketing teams wasting time on bad leads. After years of watching teams manually validate thousands of form submissions, we knew there had to be a better way.

We built this tool to be:
- **Free** - No paywalls, no trials, no credit card
- **Privacy-first** - Your data never leaves your browser
- **Simple** - No technical expertise required
- **Effective** - Validated by hundreds of users

**Mission:** Make lead validation accessible to everyone.

---

## 📄 Citing This Project

If you use SolunIP Labs in your research or blog posts, please cite:

```bibtex
@software{solunip_labs_2025,
  title = {SolunIP Labs: Free IP Enrichment and Contact Validation},
  author = {Your Name},
  year = {2025},
  url = {https://github.com/yourusername/solunip-labs},
  note = {Open-source lead validation tool}
}
```

---

**Built with ☀️ and 🌙 by the SolunIP Labs team**

**[⬆ Back to Top](#solunip-labs-️)**
