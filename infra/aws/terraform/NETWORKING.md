# CareerOps AWS network configuration

This Terraform root reuses the existing VPC and subnet resources in account
165328640460, region ap-southeast-2. It does not create or modify the VPC,
subnets, Internet Gateway, or S3 Gateway VPC endpoint.

## Existing network inputs

- VPC: `vpc-0bc0cb5d78fb32a15`
- Public AZ-a: `subnet-06d11260177d2cc26` (`10.0.0.0/20`)
- Public AZ-b: `subnet-0442bc7a85c52a118` (`10.0.16.0/20`)
- Private AZ-a: `subnet-094d092843afe015e` (`10.0.128.0/20`)
- Private AZ-b: `subnet-0d1956f455dd5e05d` (`10.0.144.0/20`)
- Public route table: `rtb-03aa6df3d0020194b`
- Private route tables, in matching AZ order:
  - AZ-a: `rtb-024d3e164c8789f0a`
  - AZ-b: `rtb-06cc31d3e822913e8`
- Existing S3 Gateway endpoint route in both private route tables:
  `pl-6ca54005 -> vpce-04f63de0a856d65dc`

The public route table already has `0.0.0.0/0 -> igw-0e30a3e701be83780`.
The private application route tables currently have no default route. Terraform
adds the private application default routes through the NAT Gateway resources
defined here.

## Environment behavior

Set `environment = "staging"` for the staging footprint:

- One NAT Gateway and one Elastic IP in the first public subnet (AZ-a).
- Both application private route tables use that NAT Gateway for default IPv4 egress.
- This is a cost-saving staging arrangement; AZ-b egress depends on AZ-a NAT.

Set `environment = "production"` for production:

- Two NAT Gateways and two Elastic IPs, one in each public subnet/AZ.
- Each application private route table uses its same-AZ NAT Gateway.
- Production still requires HTTPS and a valid ACM certificate.

Staging and production must use **separate Terraform state backends/workspaces
with independent state and locking**. Do not switch the environment variable
inside a shared state: the environment name is part of resource naming and
the NAT count changes between environments.

## Database network isolation

RDS must use two dedicated database subnets in separate Availability Zones.
They must not overlap the application private subnets, and their associated
route tables must not contain a default route to a NAT Gateway or Internet
Gateway. The application private subnets are intentionally NAT-routed for ECS
task egress and are not acceptable database subnet inputs.

Terraform variable validation now rejects duplicate database subnet IDs and
any database subnet ID that overlaps `private_subnet_ids`. This is a
fail-closed guard against the previous example configuration, which reused
the application subnets. It does not inspect the actual route tables associated
with the supplied database subnet IDs; verify those route tables independently
before any plan or apply.

The example tfvars therefore contains explicit placeholder database subnet
IDs. They are not real AWS resources and must be replaced with verified,
dedicated subnet IDs before Terraform can plan successfully. Do not guess
subnet IDs or allocate CIDRs without checking the VPC's existing address
allocations and confirming free ranges.

## Costs and operational boundaries

NAT Gateways and their Elastic IPs incur ongoing AWS charges, including hourly
and data-processing charges. One NAT Gateway is cheaper but introduces an
AZ dependency for staging. Two NAT Gateways improve production AZ independence
but cost more. Review current regional pricing before applying.

This document describes Terraform configuration only. It does not mean any
AWS resources have been provisioned. Do not run `terraform apply` without an
explicit infrastructure-change approval and a reviewed plan.
