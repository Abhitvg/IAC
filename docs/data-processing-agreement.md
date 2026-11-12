# Data Processing Agreement (DPA)

**Effective Date:** November 12, 2026  
**Between:**  
1. **The Customer / Candidate** (acting as **Data Controller**), and  
2. **CareerOps Systems Inc.** (acting as **Data Processor**).

---

## 1. Scope and Roles of the Parties
* **1.1 Controller and Processor**: The Candidate is the Data Controller of their personal data, Career Graph facts, resumes, application history, and communications. CareerOps acts solely as the Data Processor processing data on documented instructions via the active **Sprint Contract**.
* **1.2 Subject Matter and Duration**: Processing of candidate profile data, job search preferences, job application documents, and recruitment communications during the duration of the Sprint Contract plus statutory retention periods.

---

## 2. Customer Instructions
* **2.1 Documented Instructions**: CareerOps processes personal data strictly in accordance with Customer instructions provided through the Sprint Contract, tenant settings, and authenticated API requests.
* **2.2 Standing Consent Boundaries**: Autonomous actions (submitting applications, dispatching outreach) are bounded strictly by candidate-configured caps, blocklists, confirmed facts (Hard Line H3), and verified business channels (Hard Line H4).

---

## 3. Sub-Processors
CareerOps engages third-party sub-processors to deliver cloud infrastructure and AI evaluation services under written agreements enforcing equivalent data protection terms:

| Sub-Processor | Role / Function | Location | Transfer Mechanism |
| :--- | :--- | :--- | :--- |
| **Amazon Web Services (AWS)** | Cloud hosting, object storage (S3 proofs) | US / EU | EU Standard Contractual Clauses (SCCs) |
| **Google Cloud Platform (GCP)** | Managed database, networking | US / EU | EU Standard Contractual Clauses (SCCs) |
| **Temporal Cloud** | Distributed workflow state orchestration | US | EU Standard Contractual Clauses (SCCs) |
| **Neon / Supabase Postgres** | Relational data persistence with Row-Level Security | US / EU | EU Standard Contractual Clauses (SCCs) |
| **Anthropic / OpenAI / Groq** | LLM inference for text extraction & synthesis | US | Enterprise Data Privacy Agreements (zero training retention) |

---

## 4. Technical and Organizational Security Measures (TOMs)
CareerOps implements industry-grade technical and organizational safeguards:
* **Encryption at Rest**: AES-256-GCM envelope encryption for all sensitive payloads and third-party tokens.
* **Encryption in Transit**: Enforced TLS 1.3 across all public and internal communications.
* **Tenant Isolation**: PostgreSQL Row-Level Security (`FORCE RLS`) enforced on non-owner application roles.
* **Cryptographic Shredding**: Instant DEK destruction rendering candidate tenant data permanently unreadable.
* **Zero Credential Storage for LinkedIn**: Hard Line H1 strictly prohibits storing LinkedIn user passwords or session cookies.
* **Input Sanitization**: Untrusted external text sanitized against prompt-injection and control characters (Hard Line H5).

---

## 5. Security Incident and Breach Notification
* In the event of a confirmed Personal Data Breach affecting candidate personal data, CareerOps will notify the Customer without undue delay and **no later than 48 hours** after becoming aware of the breach.
* Notifications include nature of the breach, affected records, likely consequences, and remediation actions taken.

---

## 6. Data Subject Rights (DSAR) and Deletion
* CareerOps provides automated self-service Data Subject Access Request (DSAR) export and deletion endpoints:
  * `GET /v1/privacy/dsar/export`: Full structured JSON export across DB, S3 object storage keys, workflow history, and tokens.
  * `POST /v1/privacy/crypto-shred`: Destroys the tenant Data Encryption Key with zero-buffer overwrites, cryptographically shredding all tenant ciphertext.

