export const VENDOR_QUESTIONNAIRE_OCR = `
VENDOR EVALUATION & TECHNICAL ASSESSMENT QUESTIONNAIRE
Company: Enterprise Cloud Solutions Inc.
Vendor / Contractor Candidate Evaluation Form

Instructions: Please complete all sections below. Responses will be evaluated for technical architecture maturity, actual implementation experience, and vendor risk.

1. What infrastructure, APIs or other third-party technologies have you implemented in the past 12 months, and what challenges did you run into?
[ Text Area: Max 500 characters ]

2. What was your role in choosing that vendor or API?
[ Text Area: Max 300 characters ]

3. Describe how you monitor SLA compliance, latency, and failure failover for third-party endpoints.
[ Text Area: Max 500 characters ]
`;

export const JOB_APPLICATION_FORM_OCR = `
Greenhouse Job Application - Senior Backend Engineer
Acme Corp | Careers

Application Questions (Required):
* 1. Describe a high-throughput distributed system you designed or optimized in the last 2 years. What was the business impact? (Max 500 characters)
[ ____________________________________________________ ]

* 2. What database technologies do you have direct production experience with, and why did you choose PostgreSQL over DynamoDB in your recent projects?
[ ____________________________________________________ ]

* 3. Are you legally authorized to work in the United States?
( ) Yes  ( ) No
`;

export const BEHAVIORAL_INTERVIEW_OCR = `
Live Video Interview - Behavioral Round
Interviewer: "Tell me about a time when you had a disagreement with a product manager or tech lead about technical debt versus shipping a feature. How did you resolve it?"
`;

export const CODING_PROBLEM_OCR = `
LeetCode 42. Trapping Rain Water (Hard)
Given n non-negative integers representing an elevation map where the width of each bar is 1, compute how much water it can trap after raining.

Example 1:
Input: height = [0,1,0,2,1,0,1,3,2,1,2,1]
Output: 6
Explanation: The above elevation map (black section) is represented by array [0,1,0,2,1,0,1,3,2,1,2,1]. In this case, 6 units of rain water are being trapped.

Constraints:
* n == height.length
* 1 <= n <= 2 * 10^4
* 0 <= height[i] <= 10^5
`;

export const MULTIPLE_CHOICE_ASSESSMENT_OCR = `
AWS Certified Solutions Architect Assessment
Question 14 of 50:
A company requires an Amazon S3 storage solution for data that is accessed infrequently, but requires millisecond retrieval when requested. The solution must be cost-effective.
Which storage class meets these requirements?

A) S3 Standard
B) S3 Standard-Infrequent Access (S3 Standard-IA)
C) S3 Glacier Flexible Retrieval
D) S3 Glacier Deep Archive
`;
